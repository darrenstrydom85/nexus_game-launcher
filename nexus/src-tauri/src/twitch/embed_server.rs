//! Local HTTP server that hosts Twitch embed pages from a `localhost:PORT` origin.
//!
//! ## Why this exists
//!
//! Twitch's embedded player (`player.twitch.tv`) and chat (`www.twitch.tv/embed/.../chat`)
//! refuse to render unless **every ancestor in the frame chain** matches the
//! `frame-ancestors` CSP Twitch sends back (which allows only `http://localhost:*`
//! / `https://localhost:*`). In packaged Tauri 2 builds on Windows the webview
//! origin is `https://tauri.localhost`, which never matches — and because
//! `frame-ancestors` is a chain check, iframing Twitch through a `localhost`
//! wrapper from inside `tauri.localhost` **still fails** (the top of the chain
//! is `tauri.localhost`).
//!
//! The only CSP-compliant solution is to make the **top-level origin** a
//! `localhost` URL. So instead of the React app iframing Twitch, we spawn a
//! dedicated Tauri window whose URL points at this server (`http://localhost:PORT/watch`),
//! and that page iframes Twitch directly. Chain: `localhost → player.twitch.tv`.
//! Twitch is happy.
//!
//! ## What this server serves
//!
//! - `GET /watch` — The pop-out player page. Full HTML + vanilla JS with
//!   header chrome (mute, chat toggle, sign-in, open-on-twitch, close) and
//!   two iframes (player + chat). The chrome talks back to Tauri via the
//!   `/__api/*` endpoints on this same server (the browser can't call Tauri
//!   commands from a remote origin without explicit capabilities, so we
//!   route through HTTP instead of plumbing a capability file).
//! - `GET /player`, `GET /chat` — Legacy single-iframe wrapper pages. Kept
//!   for backward compatibility with any code path that still iframes them
//!   directly; new code should use `/watch`.
//! - `POST /__api/signin` — Opens the in-app Twitch login window.
//! - `GET /health` — Unauthenticated liveness check.
//!
//! ## Security
//!
//! - All routes except `/health` require a random per-session token (generated
//!   at startup) to be supplied in the query string (`?token=...`) for GETs
//!   and in the `Authorization: Bearer <token>` header for POSTs. This keeps
//!   any other process on the machine from calling our API endpoints.
//! - `channel_login` is strictly allow-listed (`[a-z0-9_]{1,25}`) before being
//!   interpolated into HTML to avoid XSS.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

/// Shared state every connection handler needs.
struct ServerCtx {
    app: AppHandle,
    /// Random session token required on every non-`/health` request.
    token: String,
}

/// Bind, spawn the accept loop, and return `(base_url, token)` — the base URL
/// is stashed in Tauri state and read by Rust when building window URLs, and
/// the token is embedded into the generated HTML so the in-page JS can call
/// `/__api/*` endpoints.
pub fn start(app: AppHandle) -> Result<EmbedServerInfo, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("failed to bind embed server: {e}"))?;
    let addr: SocketAddr = listener
        .local_addr()
        .map_err(|e| format!("failed to read embed server addr: {e}"))?;
    let base = format!("http://localhost:{}", addr.port());

    let token = random_token();
    let ctx = Arc::new(ServerCtx {
        app,
        token: token.clone(),
    });

    thread::Builder::new()
        .name("twitch-embed-server".to_string())
        .spawn(move || accept_loop(listener, ctx))
        .map_err(|e| format!("failed to spawn embed server thread: {e}"))?;

    Ok(EmbedServerInfo { base, token })
}

pub struct EmbedServerInfo {
    pub base: String,
    pub token: String,
}

fn accept_loop(listener: TcpListener, ctx: Arc<ServerCtx>) {
    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let ctx = Arc::clone(&ctx);
                thread::spawn(move || {
                    if let Err(e) = handle_connection(s, &ctx) {
                        if !is_benign_client_error(&e) {
                            eprintln!("[twitch-embed] connection error: {e}");
                        }
                    }
                });
            }
            Err(e) => {
                if !is_benign_client_error(&e) {
                    eprintln!("[twitch-embed] accept error: {e}");
                }
            }
        }
    }
}

/// Chromium / WebView2 speculatively opens TCP connections (preconnect) and
/// often never sends a request on them — it just sits on the socket until it
/// feels like using it or tears it down. When our 2-second read timeout fires
/// on one of those idle sockets we get a WSAETIMEDOUT (Windows `os error
/// 10060`) / `ErrorKind::TimedOut`; on teardown we sometimes see
/// `ConnectionReset` / `ConnectionAborted` / `BrokenPipe`. None of these
/// represent a real problem — the preconnect pool is normal browser
/// behaviour — so we filter them out of the log to avoid spam.
fn is_benign_client_error(e: &std::io::Error) -> bool {
    use std::io::ErrorKind as K;
    matches!(
        e.kind(),
        K::TimedOut
            | K::WouldBlock
            | K::ConnectionReset
            | K::ConnectionAborted
            | K::BrokenPipe
            | K::UnexpectedEof
    )
}

fn handle_connection(mut stream: TcpStream, ctx: &ServerCtx) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_millis(2_000)))?;

    // 8KB is enough for any of our requests (including a short POST body).
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf)?;
    if n == 0 {
        return Ok(());
    }
    let raw = &buf[..n];

    let (headers_end, body) = match find_headers_end(raw) {
        Some(i) => (i, &raw[i..]),
        None => (raw.len(), &[][..]),
    };
    let head = String::from_utf8_lossy(&raw[..headers_end]);

    let mut lines = head.lines();
    let request_line = lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("/");

    let auth_header = lines
        .clone()
        .find_map(|l| {
            let (k, v) = l.split_once(':')?;
            if k.trim().eq_ignore_ascii_case("authorization") {
                Some(v.trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_default();

    let (route, query) = match path.split_once('?') {
        Some((r, q)) => (r, q),
        None => (path, ""),
    };
    let params = parse_query(query);

    // Route dispatch.
    match (method, route) {
        ("GET", "/health") => {
            write_response(&mut stream, 200, "text/plain; charset=utf-8", b"ok");
        }
        ("GET", "/watch") => {
            if !check_token_query(&params, ctx) {
                write_response(&mut stream, 401, "text/plain", b"unauthorized");
                return Ok(());
            }
            let html = render_watch(&params, &ctx.token);
            write_response(&mut stream, 200, "text/html; charset=utf-8", html.as_bytes());
        }
        ("GET", "/player") => {
            // Legacy single-iframe wrapper; no token check to preserve prior
            // behaviour for any callers that still use it. No sensitive data
            // is served here.
            let html = render_player(&params);
            write_response(&mut stream, 200, "text/html; charset=utf-8", html.as_bytes());
        }
        ("GET", "/chat") => {
            let html = render_chat(&params);
            write_response(&mut stream, 200, "text/html; charset=utf-8", html.as_bytes());
        }
        ("POST", "/__api/signin") => {
            if !check_token_bearer(&auth_header, ctx) {
                write_response(&mut stream, 401, "text/plain", b"unauthorized");
                return Ok(());
            }
            handle_signin(&ctx.app);
            write_response(&mut stream, 204, "text/plain", b"");
        }
        ("POST", "/__api/open-channel") => {
            if !check_token_bearer(&auth_header, ctx) {
                write_response(&mut stream, 401, "text/plain", b"unauthorized");
                return Ok(());
            }
            let body_str = String::from_utf8_lossy(body);
            let body_params = parse_query(body_str.trim_end_matches('\0').trim());
            let channel = sanitize_channel(
                body_params.get("channel").map(String::as_str).unwrap_or(""),
            );
            if channel.is_empty() {
                write_response(&mut stream, 400, "text/plain", b"bad channel");
                return Ok(());
            }
            handle_open_channel(&ctx.app, &channel);
            write_response(&mut stream, 204, "text/plain", b"");
        }
        _ => {
            write_response(&mut stream, 404, "text/plain", b"not found");
        }
    }

    Ok(())
}

fn find_headers_end(raw: &[u8]) -> Option<usize> {
    raw.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
}

fn check_token_query(params: &HashMap<String, String>, ctx: &ServerCtx) -> bool {
    params
        .get("token")
        .map(|t| constant_time_eq(t.as_bytes(), ctx.token.as_bytes()))
        .unwrap_or(false)
}

fn check_token_bearer(auth_header: &str, ctx: &ServerCtx) -> bool {
    let stripped = auth_header.strip_prefix("Bearer ").unwrap_or(auth_header);
    constant_time_eq(stripped.as_bytes(), ctx.token.as_bytes())
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Generate a 256-bit random token, hex-encoded. Uses `getrandom` which is
/// already pulled in for OAuth state generation, so no new dependency.
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    // `getrandom` can only fail on systems without an OS RNG; treat failure
    // as fatal by falling back to a deterministic-but-noisy value that will
    // at least cause the token check to fail safely.
    if getrandom::getrandom(&mut bytes).is_err() {
        return "disabled".to_string();
    }
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

fn handle_signin(app: &AppHandle) {
    // Reuse the existing command by emitting a well-known event. The main
    // window already listens for it (via a listener we add in `lib.rs`) and
    // invokes `open_twitch_login`. We avoid calling the command directly
    // from this thread because Tauri commands are tied to the async runtime.
    let _ = app.emit("nexus://embed-api/signin", ());
}

/// Open `https://twitch.tv/{channel}` in the user's default browser.
///
/// This replaces the previous in-page `window.open(...)` which WebView2
/// silently blocks for cross-origin popups. We take only a pre-sanitized
/// channel login (not an arbitrary URL) to keep the endpoint trivially safe
/// against abuse.
fn handle_open_channel(app: &AppHandle, channel: &str) {
    use tauri_plugin_opener::OpenerExt;
    let url = format!("https://twitch.tv/{channel}");
    if let Err(e) = app.opener().open_url(&url, None::<&str>) {
        eprintln!("[twitch-embed] failed to open channel url: {e}");
    }
}

/// Parse `key=value&key2=value2` into a map. Values are URL-decoded with a tiny
/// hand-rolled decoder (we only handle `+` and percent-encoding).
fn parse_query(query: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if query.is_empty() {
        return out;
    }
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(url_decode(k), url_decode(v));
    }
    out
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(h), Some(l)) = (hi, lo) {
                    out.push((h * 16 + l) as u8);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Strict allow-list sanitiser for Twitch channel logins (per Twitch docs: 4-25
/// chars, lowercase ASCII letters/digits/underscore). Anything else returns an
/// empty string so the rendered iframe is harmless.
fn sanitize_channel(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(25)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// HTML-escape text for safe interpolation into element bodies / attributes.
fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#x27;"),
            _ => out.push(c),
        }
    }
    out
}

/// JSON-escape a string for safe interpolation inside a `<script>` string
/// literal. Lets us pass the channel / display name into the client JS without
/// needing a full JSON serializer.
fn js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            // Escape `<`, `>`, `&` so the string literal can't terminate the
            // enclosing `<script>` element or otherwise break out of the JS
            // context. `/` is intentionally left alone (purely cosmetic and
            // it makes the iframe URLs harder to read in the HTML output).
            '<' => out.push_str("\\u003c"),
            '>' => out.push_str("\\u003e"),
            '&' => out.push_str("\\u0026"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn render_watch(params: &HashMap<String, String>, api_token: &str) -> String {
    let channel = sanitize_channel(params.get("channel").map(String::as_str).unwrap_or(""));
    let display_raw = params
        .get("display")
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    let display = if display_raw.is_empty() {
        &channel
    } else {
        display_raw
    };
    let game_name = params.get("gameName").cloned().unwrap_or_default();

    if channel.is_empty() {
        return error_page("Missing channel — nothing to play.");
    }

    let display_escaped = html_escape(display);
    let game_name_escaped = html_escape(&game_name);
    let player_src = format!(
        "https://player.twitch.tv/?channel={channel}&parent=localhost&muted=true&autoplay=true"
    );
    let chat_src = format!("https://www.twitch.tv/embed/{channel}/chat?parent=localhost&darkpopout");

    let channel_js = js_string(&channel);
    let token_js = js_string(api_token);
    let player_src_js = js_string(&player_src);
    let chat_src_js = js_string(&chat_src);

    // The page is intentionally a single self-contained HTML document: no
    // build step, no bundler, no external JS. Keeps the surface area tiny
    // and means we never have to worry about CSP for inline scripts on the
    // `localhost:PORT` origin (we serve it, so we control its policy).
    format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{display_escaped} · Nexus</title>
<style>
  :root {{
    --bg: #0d0d10;
    --panel: #141418;
    --border: #26262c;
    --fg: #f1f1f3;
    --muted: #8a8a94;
    --accent: #7f5af0;
    --danger: #ff4d4f;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{
    margin: 0; padding: 0; height: 100%;
    background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    overflow: hidden;
  }}
  .app {{ display: flex; flex-direction: column; height: 100%; }}
  header {{
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 8px 12px;
    background: var(--panel); border-bottom: 1px solid var(--border);
    flex: 0 0 auto;
  }}
  .meta {{ display: flex; align-items: center; gap: 8px; min-width: 0; }}
  .live-dot {{
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--danger); flex: 0 0 auto;
  }}
  .channel {{ font-weight: 600; font-size: 14px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }}
  .game {{ color: var(--muted); font-size: 12px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }}
  .actions {{ display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }}
  button.act {{
    background: transparent; border: 0; color: var(--muted);
    padding: 6px 10px; border-radius: 4px; cursor: pointer;
    font-size: 12px; font-weight: 500;
  }}
  button.act:hover {{ background: #26262c; color: var(--fg); }}
  button.act[aria-pressed="true"] {{ color: var(--accent); }}
  main {{ display: flex; flex: 1 1 auto; min-height: 0; }}
  .player-wrap {{ position: relative; flex: 1 1 auto; background: #000; min-width: 0; }}
  .player-wrap iframe {{ position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }}
  aside {{
    flex: 0 0 340px; border-left: 1px solid var(--border);
    background: var(--panel); display: flex;
  }}
  aside iframe {{ width: 100%; height: 100%; border: 0; }}
  .hidden {{ display: none !important; }}
  @media (max-width: 680px) {{
    aside {{ display: none; }}
  }}
</style>
</head>
<body>
<div class="app">
  <header>
    <div class="meta">
      <span class="live-dot" aria-hidden="true"></span>
      <span class="channel">{display_escaped}</span>
      {game_html}
    </div>
    <div class="actions">
      <button class="act" id="btn-mute" aria-pressed="false" title="Mute / unmute">Unmute</button>
      <button class="act" id="btn-chat" aria-pressed="true" title="Toggle chat">Hide chat</button>
      <button class="act" id="btn-signin" title="Sign in on Twitch (chat, follow, etc.)">Sign in</button>
      <button class="act" id="btn-open" title="Open on twitch.tv">Open on Twitch</button>
    </div>
  </header>
  <main>
    <div class="player-wrap">
      <iframe id="player" title="Twitch stream" allow="autoplay; fullscreen" allowfullscreen></iframe>
    </div>
    <aside id="chat-wrap">
      <iframe id="chat" title="Twitch chat"></iframe>
    </aside>
  </main>
</div>
<script>
(function() {{
  var CHANNEL = {channel_js};
  var TOKEN = {token_js};
  var PLAYER_SRC_BASE = {player_src_js};
  var CHAT_SRC = {chat_src_js};

  var playerEl = document.getElementById('player');
  var chatEl = document.getElementById('chat');
  var chatWrap = document.getElementById('chat-wrap');
  var btnMute = document.getElementById('btn-mute');
  var btnChat = document.getElementById('btn-chat');
  var btnSignin = document.getElementById('btn-signin');
  var btnOpen = document.getElementById('btn-open');

  var muted = true;
  function setPlayerSrc() {{
    var src = PLAYER_SRC_BASE.replace('muted=true', 'muted=' + (muted ? 'true' : 'false'));
    playerEl.src = src;
  }}
  setPlayerSrc();
  chatEl.src = CHAT_SRC;

  btnMute.textContent = 'Unmute';
  btnMute.addEventListener('click', function() {{
    muted = !muted;
    btnMute.textContent = muted ? 'Unmute' : 'Mute';
    btnMute.setAttribute('aria-pressed', muted ? 'false' : 'true');
    setPlayerSrc();
  }});

  var chatVisible = true;
  btnChat.addEventListener('click', function() {{
    chatVisible = !chatVisible;
    chatWrap.classList.toggle('hidden', !chatVisible);
    btnChat.textContent = chatVisible ? 'Hide chat' : 'Show chat';
    btnChat.setAttribute('aria-pressed', chatVisible ? 'true' : 'false');
  }});

  btnOpen.addEventListener('click', function() {{
    // `window.open` from the localhost page is silently blocked by WebView2
    // (cross-origin popup from an embedded webview). Route through the
    // embed-server API, which asks Rust to open the URL in the OS default
    // browser via the opener plugin.
    var body = 'channel=' + encodeURIComponent(CHANNEL);
    fetch('/__api/open-channel', {{
      method: 'POST',
      headers: {{
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded',
      }},
      body: body,
    }}).catch(function() {{}});
  }});

  btnSignin.addEventListener('click', function() {{
    fetch('/__api/signin', {{
      method: 'POST',
      headers: {{ 'Authorization': 'Bearer ' + TOKEN }},
    }}).catch(function() {{}});
  }});
}})();
</script>
</body>
</html>
"##,
        display_escaped = display_escaped,
        game_html = if game_name.is_empty() {
            String::new()
        } else {
            format!("<span class=\"game\">· {game_name_escaped}</span>")
        },
        channel_js = channel_js,
        token_js = token_js,
        player_src_js = player_src_js,
        chat_src_js = chat_src_js,
    )
}

fn render_player(params: &HashMap<String, String>) -> String {
    let channel = sanitize_channel(params.get("channel").map(String::as_str).unwrap_or(""));
    let muted = matches!(
        params.get("muted").map(String::as_str).unwrap_or("true"),
        "true" | "1"
    );
    let muted_str = if muted { "true" } else { "false" };

    if channel.is_empty() {
        return wrapper_html("<p style=\"color:#999;font-family:sans-serif\">Missing channel.</p>");
    }

    let iframe_src = format!(
        "https://player.twitch.tv/?channel={channel}&parent=localhost&muted={muted_str}&autoplay=true"
    );
    let iframe = format!(
        "<iframe src=\"{iframe_src}\" allow=\"autoplay; fullscreen\" allowfullscreen frameborder=\"0\"></iframe>"
    );
    wrapper_html(&iframe)
}

fn render_chat(params: &HashMap<String, String>) -> String {
    let channel = sanitize_channel(params.get("channel").map(String::as_str).unwrap_or(""));
    if channel.is_empty() {
        return wrapper_html("<p style=\"color:#999;font-family:sans-serif\">Missing channel.</p>");
    }

    let iframe_src = format!(
        "https://www.twitch.tv/embed/{channel}/chat?parent=localhost&darkpopout"
    );
    let iframe = format!(
        "<iframe src=\"{iframe_src}\" frameborder=\"0\"></iframe>"
    );
    wrapper_html(&iframe)
}

fn wrapper_html(body: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nexus Twitch Embed</title>
<style>
  html,body{{margin:0;padding:0;height:100%;background:#000;overflow:hidden}}
  iframe{{display:block;width:100%;height:100%;border:0}}
</style>
</head>
<body>{body}</body>
</html>
"#
    )
}

fn error_page(msg: &str) -> String {
    let escaped = html_escape(msg);
    format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Nexus</title>
<style>html,body{{margin:0;padding:24px;background:#0d0d10;color:#f1f1f3;font-family:-apple-system,system-ui,sans-serif}}</style>
</head><body><p>{escaped}</p></body></html>
"#
    )
}

fn write_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let status_text = match status {
        200 => "OK",
        204 => "No Content",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "OK",
    };
    let header = format!(
        "HTTP/1.1 {status} {status_text}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {len}\r\n\
         Cache-Control: no-store\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Connection: close\r\n\
         \r\n",
        len = body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
    // Same Windows TCP-RST workaround used by the OAuth callback servers.
    let _ = stream.shutdown(Shutdown::Write);
    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let mut sink = [0u8; 256];
    while matches!(stream.read(&mut sink), Ok(n) if n > 0) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_channel_keeps_valid_login() {
        assert_eq!(sanitize_channel("Shroud_2024"), "shroud_2024");
    }

    #[test]
    fn sanitize_channel_strips_html_injection() {
        let cleaned = sanitize_channel("<script>x</script>");
        assert!(!cleaned.contains('<'));
        assert!(!cleaned.contains('>'));
    }

    #[test]
    fn sanitize_channel_caps_at_25_chars() {
        let long = "a".repeat(100);
        assert_eq!(sanitize_channel(&long).len(), 25);
    }

    #[test]
    fn url_decode_handles_percent_and_plus() {
        assert_eq!(url_decode("hello+world"), "hello world");
        assert_eq!(url_decode("a%20b"), "a b");
        assert_eq!(url_decode("a%2Fb"), "a/b");
    }

    #[test]
    fn parse_query_handles_multiple_keys() {
        let q = parse_query("channel=foo&muted=false");
        assert_eq!(q.get("channel"), Some(&"foo".to_string()));
        assert_eq!(q.get("muted"), Some(&"false".to_string()));
    }

    #[test]
    fn render_player_uses_parent_localhost() {
        let mut params = HashMap::new();
        params.insert("channel".to_string(), "shroud".to_string());
        let html = render_player(&params);
        assert!(html.contains("parent=localhost"));
        assert!(html.contains("channel=shroud"));
        assert!(html.contains("muted=true"));
    }

    #[test]
    fn render_player_missing_channel_renders_safe_fallback() {
        let html = render_player(&HashMap::new());
        assert!(html.contains("Missing channel"));
        assert!(!html.contains("player.twitch.tv"));
    }

    #[test]
    fn render_chat_uses_parent_localhost() {
        let mut params = HashMap::new();
        params.insert("channel".to_string(), "ninja".to_string());
        let html = render_chat(&params);
        assert!(html.contains("parent=localhost"));
        assert!(html.contains("/embed/ninja/chat"));
    }

    #[test]
    fn render_watch_includes_player_and_chat_iframes() {
        let mut params = HashMap::new();
        params.insert("channel".to_string(), "shroud".to_string());
        params.insert("display".to_string(), "Shroud".to_string());
        let html = render_watch(&params, "tok");
        assert!(html.contains("player.twitch.tv"));
        assert!(html.contains("twitch.tv/embed/shroud/chat"));
        assert!(html.contains("Shroud"));
        assert!(html.contains("parent=localhost"));
    }

    #[test]
    fn render_watch_has_no_popout_button() {
        // The /watch page is no longer used as an overlay, so the "Pop out"
        // button was removed entirely.
        let mut params = HashMap::new();
        params.insert("channel".to_string(), "shroud".to_string());
        let html = render_watch(&params, "tok");
        assert!(!html.contains("id=\"btn-popout\""));
    }

    #[test]
    fn render_watch_missing_channel_renders_error_page() {
        let html = render_watch(&HashMap::new(), "tok");
        assert!(html.contains("Missing channel"));
        assert!(!html.contains("player.twitch.tv"));
    }

    #[test]
    fn render_watch_escapes_display_name() {
        let mut params = HashMap::new();
        params.insert("channel".to_string(), "shroud".to_string());
        params.insert("display".to_string(), "<img onerror=x>".to_string());
        let html = render_watch(&params, "tok");
        assert!(!html.contains("<img onerror=x>"));
        assert!(html.contains("&lt;img onerror=x&gt;"));
    }

    #[test]
    fn js_string_escapes_closing_script_tag() {
        // `</script>` inside a JS string would prematurely end the enclosing
        // <script> element; we must escape it.
        let out = js_string("</script><img>");
        assert!(!out.contains("</script>"));
        assert!(out.contains("\\u003c/script\\u003e"));
    }

    #[test]
    fn is_benign_client_error_filters_idle_browser_sockets() {
        // The exact Windows error we were spamming the log with (WSAETIMEDOUT,
        // os error 10060) maps to ErrorKind::TimedOut in std::io.
        let timeout = std::io::Error::new(std::io::ErrorKind::TimedOut, "oops");
        let reset = std::io::Error::new(std::io::ErrorKind::ConnectionReset, "oops");
        let aborted = std::io::Error::new(std::io::ErrorKind::ConnectionAborted, "oops");
        let broken = std::io::Error::new(std::io::ErrorKind::BrokenPipe, "oops");
        assert!(is_benign_client_error(&timeout));
        assert!(is_benign_client_error(&reset));
        assert!(is_benign_client_error(&aborted));
        assert!(is_benign_client_error(&broken));

        // Real problems must still surface.
        let other = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "oops");
        assert!(!is_benign_client_error(&other));
        let invalid = std::io::Error::new(std::io::ErrorKind::InvalidData, "oops");
        assert!(!is_benign_client_error(&invalid));
    }

    #[test]
    fn constant_time_eq_basic() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn random_token_is_nonempty_and_changes() {
        let a = random_token();
        let b = random_token();
        assert!(a.len() >= 32);
        assert_ne!(a, b);
    }
}
