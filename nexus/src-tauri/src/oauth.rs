//! Shared OAuth2 Authorization Code + PKCE plumbing for the Twitch and Google Drive
//! integrations: CSRF `state`, a one-shot localhost callback server with a branded
//! result page, token-endpoint requests, and error mapping. Provider modules keep only
//! their endpoints, scopes and user lookup.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::time::Duration;

use crate::commands::error::CommandError;

/// What differs per provider in the shared flow.
pub struct Provider {
    /// Shown in errors and logs, e.g. "Twitch".
    pub name: &'static str,
    /// Shown on the callback page, e.g. "Twitch account".
    pub account: &'static str,
    /// Success colour on the callback page.
    pub accent: &'static str,
    /// Fixed callback port; `redirect_uri` must be registered with the provider.
    pub port: u16,
    pub redirect_uri: &'static str,
}

/// PKCE code verifier (43-128 chars, base64url) and its S256 challenge.
pub fn pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("getrandom");
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// Random URL-safe `state` for CSRF protection on the OAuth round trip.
pub fn random_state() -> String {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).expect("getrandom");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// `base?k=v&...` with values URL-encoded.
pub fn build_url(base: &str, params: &[(&str, &str)]) -> String {
    let qs: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect();
    format!("{base}?{}", qs.join("&"))
}

/// Open the browser at the URL built by `authorize_url(challenge, state)`, wait for the
/// callback, and return `(code, pkce_verifier)`. Errors if the user denies access.
pub async fn authorize(
    p: &'static Provider,
    authorize_url: impl FnOnce(&str, &str) -> String,
    open_url_fn: impl FnOnce(&str),
) -> Result<(String, String), CommandError> {
    let (verifier, challenge) = pkce_pair();
    let state = random_state();
    let listener = TcpListener::bind(("127.0.0.1", p.port)).map_err(|e| {
        CommandError::NetworkUnavailable(format!("failed to bind callback listener: {e}"))
    })?;

    eprintln!("[{}-auth] opening browser for OAuth", p.name);
    open_url_fn(&authorize_url(&challenge, &state));

    // Blocking accept runs off the async runtime so it doesn't starve Tokio workers.
    eprintln!("[{}-auth] waiting for callback on port {}...", p.name, p.port);
    let code = tokio::task::spawn_blocking(move || receive_callback(listener, &state, p))
        .await
        .map_err(|e| CommandError::Unknown(format!("callback task panicked: {e}")))??
        .ok_or_else(|| CommandError::Auth("Authorization was denied".to_string()))?;
    Ok((code, verifier))
}

/// Block until one HTTP request hits the listener and parse `code`/`error`/`state`.
/// Returns Ok(Some(code)) on success, Ok(None) if the user denied, Err on timeout,
/// provider error, or `state` mismatch.
fn receive_callback(
    listener: TcpListener,
    expected_state: &str,
    p: &Provider,
) -> Result<Option<String>, CommandError> {
    let (mut stream, _) = listener.accept().map_err(|e| {
        if e.kind() == std::io::ErrorKind::TimedOut {
            CommandError::Auth("OAuth callback timed out. Please try again.".to_string())
        } else {
            CommandError::Io(e)
        }
    })?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // "GET /?code=...&state=... HTTP/1.1" or "GET /?error=... HTTP/1.1"
    let first_line = request.lines().next().unwrap_or("");
    let path_query = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path_query.split('?').nth(1).unwrap_or("");

    let code = form_param(query, "code");
    let error = form_param(query, "error");
    let state_ok = form_param(query, "state").as_deref() == Some(expected_state);

    let account = p.account;
    let (status, body) = if !state_ok && code.is_some() {
        ("400 Bad Request", callback_html("Authorization Failed", "The authorization response did not match this session. Close this tab and try connecting again from Nexus settings.", false, p.accent))
    } else if code.is_some() {
        ("200 OK", callback_html("Connected to Nexus", &format!("Your {account} has been linked successfully. You can close this tab and return to Nexus."), true, p.accent))
    } else if error.as_deref() == Some("access_denied") {
        ("200 OK", callback_html("Authorization Denied", &format!("You chose not to connect your {account}. You can close this tab and try again from Nexus settings."), false, p.accent))
    } else {
        ("400 Bad Request", callback_html("Authorization Failed", "Something went wrong during authorization. Please close this tab and try again from Nexus settings.", false, p.accent))
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len(),
    );
    write_response_and_close(&mut stream, response.as_bytes());

    if let Some(e) = error {
        if e == "access_denied" {
            return Ok(None);
        }
        return Err(CommandError::Auth(format!("{} returned error: {e}", p.name)));
    }
    if !state_ok {
        return Err(CommandError::Auth(
            "OAuth state mismatch (possible CSRF). Please try again.".to_string(),
        ));
    }
    Ok(code)
}

/// Write the HTTP response and tear the socket down cleanly. Dropping a `TcpStream` with
/// bytes still queued can send a RST on Windows and the browser renders a blank page, so
/// send a FIN with `Shutdown::Write`, then briefly drain so the browser can ACK.
fn write_response_and_close(stream: &mut TcpStream, response: &[u8]) {
    let _ = stream.write_all(response);
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let mut sink = [0u8; 256];
    while matches!(stream.read(&mut sink), Ok(n) if n > 0) {}
}

/// Branded callback page that tries to close its own tab ~2.5s after loading. Browsers only
/// allow that when the tab's history is a single page (e.g. Twitch redirecting straight back),
/// not after Google's account-chooser/consent screens, so the hint falls back to "close it".
fn callback_html(title: &str, message: &str, success: bool, accent: &str) -> String {
    let (icon, accent) = if success {
        ("&#10003;", accent)
    } else {
        ("&#10007;", "#ef4444")
    };
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} - Nexus</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       background:#0a0a0f;color:#e4e4e7}}
  .card{{max-width:420px;width:90%;text-align:center;padding:48px 32px;
        background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
        border-radius:16px;backdrop-filter:blur(12px)}}
  .icon{{width:64px;height:64px;border-radius:50%;display:inline-flex;
        align-items:center;justify-content:center;font-size:28px;font-weight:700;
        margin-bottom:20px;background:{accent}20;color:{accent};border:2px solid {accent}40}}
  h1{{font-size:20px;font-weight:600;margin-bottom:12px}}
  p{{font-size:14px;line-height:1.6;color:#a1a1aa;margin-bottom:24px}}
  .hint{{font-size:12px;color:#52525b}}
</style>
</head>
<body>
<div class="card">
  <div class="icon">{icon}</div>
  <h1>{title}</h1>
  <p>{message}</p>
  <span class="hint" id="hint">This tab will close automatically.</span>
</div>
<script>setTimeout(function(){{try{{window.close();}}catch(e){{}}setTimeout(function(){{document.getElementById("hint").textContent="You can close this tab now.";}},300);}},2500);</script>
</body>
</html>"#
    )
}

fn form_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| urlencoding::decode(v).unwrap_or_default().into_owned())
    })
}

pub fn map_reqwest_error(e: reqwest::Error) -> CommandError {
    if e.is_connect() || e.is_timeout() {
        CommandError::NetworkUnavailable(e.to_string())
    } else {
        CommandError::Unknown(e.to_string())
    }
}

/// POST a form to a token endpoint and return the JSON body, mapping non-2xx responses
/// through `parse_token_error`. The body is never logged: it holds tokens.
pub async fn token_request(
    p: &Provider,
    url: &str,
    params: &[(&str, &str)],
) -> Result<serde_json::Value, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;
    let res = client
        .post(url)
        .form(params)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[{}-auth] token request failed: {e}", p.name);
            map_reqwest_error(e)
        })?;
    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    eprintln!("[{}-auth] token response: status={status}", p.name);
    if !status.is_success() {
        return Err(parse_token_error(p, status.as_u16(), &body));
    }
    serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("token response json: {e}")))
}

/// `(access_token, refresh_token, expires_in)` from a token response. `old_refresh` is the
/// fallback when the provider doesn't rotate refresh tokens; `None` makes it required.
pub fn token_triple(
    json: &serde_json::Value,
    old_refresh: Option<&str>,
    default_expires_in: i64,
) -> Result<(String, String, i64), CommandError> {
    let field = |k: &str| json.get(k).and_then(|v| v.as_str()).map(String::from);
    let access = field("access_token")
        .ok_or_else(|| CommandError::Auth("token response missing access_token".to_string()))?;
    let refresh = field("refresh_token")
        .or_else(|| old_refresh.map(String::from))
        .ok_or_else(|| CommandError::Auth("token response missing refresh_token".to_string()))?;
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(default_expires_in);
    Ok((access, refresh, expires_in))
}

/// Twitch errors carry `message`; Google's carry `error_description`/`error`.
fn parse_token_error(p: &Provider, status: u16, body: &str) -> CommandError {
    let msg = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|j| {
            ["message", "error_description", "error"]
                .iter()
                .find_map(|k| j.get(*k).and_then(|v| v.as_str()).map(String::from))
        })
        .unwrap_or_else(|| body.to_string());
    let name = p.name;
    if status == 400 && (msg.contains("invalid") || msg.contains("grant")) {
        CommandError::Auth(msg)
    } else if status == 401 || status == 403 {
        CommandError::Auth(format!("Token exchange unauthorized ({status})"))
    } else if status >= 500 {
        CommandError::Api(format!("{name} server error {status}: {msg}"))
    } else {
        CommandError::Api(format!("{name} token error {status}: {msg}"))
    }
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST: Provider = Provider {
        name: "Test",
        account: "Test account",
        accent: "#123456",
        port: 0,
        redirect_uri: "http://localhost:0",
    };

    #[test]
    fn pkce_pair_valid_s256() {
        let (verifier, challenge) = pkce_pair();
        assert!(verifier.len() >= 43 && verifier.len() <= 128);
        assert!(!verifier.contains('+') && !verifier.contains('/'));
        assert!(!challenge.contains('+') && !challenge.contains('/'));
        assert_eq!(challenge, URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())));
    }

    #[test]
    fn random_state_is_url_safe_and_unique() {
        let s = random_state();
        assert!(s.len() >= 24);
        assert!(!s.contains('+') && !s.contains('/') && !s.contains('='));
        assert_ne!(s, random_state());
    }

    #[test]
    fn form_param_parses_and_decodes() {
        let q = "state=abc&code=xyz%2F123&scope=user";
        assert_eq!(form_param(q, "code"), Some("xyz/123".to_string()));
        assert_eq!(form_param(q, "state"), Some("abc".to_string()));
        assert_eq!(form_param(q, "missing"), None);
    }

    #[test]
    fn callback_html_includes_brand_and_auto_close() {
        let html = callback_html("Connected to Nexus", "ok", true, "#9146ff");
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("Connected to Nexus"));
        assert!(html.contains("#9146ff"));
        assert!(html.contains("window.close()"));
        assert!(html.contains("You can close this tab now."));
    }

    #[test]
    fn token_triple_requires_or_falls_back_on_refresh() {
        let with = serde_json::json!({"access_token": "a", "refresh_token": "r", "expires_in": 60});
        let without = serde_json::json!({"access_token": "a"});
        assert_eq!(token_triple(&with, None, 0).unwrap(), ("a".into(), "r".into(), 60));
        assert!(token_triple(&without, None, 0).is_err());
        assert_eq!(token_triple(&without, Some("old"), 3600).unwrap(), ("a".into(), "old".into(), 3600));
    }

    #[test]
    fn parse_token_error_reads_both_provider_shapes() {
        let twitch = parse_token_error(&TEST, 400, r#"{"status":400,"message":"invalid refresh token"}"#);
        assert!(matches!(twitch, CommandError::Auth(m) if m == "invalid refresh token"));
        let google = parse_token_error(&TEST, 400, r#"{"error":"invalid_grant","error_description":"Bad Request"}"#);
        assert!(matches!(google, CommandError::Api(m) if m.contains("Bad Request")));
    }

    /// Send a fake browser callback to the one-shot server and return its result.
    fn callback_with(query: &'static str, expected_state: &str) -> Result<Option<String>, CommandError> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let writer = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            let _ = stream.write_all(format!("GET /?{query} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes());
            let mut sink = Vec::new();
            let _ = stream.read_to_end(&mut sink);
        });
        let result = receive_callback(listener, expected_state, &TEST);
        writer.join().unwrap();
        result
    }

    #[test]
    fn receive_callback_checks_state() {
        assert!(matches!(callback_with("code=abc123&state=good", "good"), Ok(Some(c)) if c == "abc123"));
        assert!(matches!(callback_with("code=abc123&state=evil", "good"), Err(CommandError::Auth(m)) if m.contains("state")));
        assert!(matches!(callback_with("code=abc123", "good"), Err(CommandError::Auth(_))));
        assert!(matches!(callback_with("error=access_denied&state=good", "good"), Ok(None)));
    }
}
