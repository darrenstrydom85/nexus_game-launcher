//! Twitch OAuth2 Authorization Code flow with PKCE, CSRF state, token exchange, and refresh.
//!
//! The local callback server returns a branded HTML page (matches the Google Drive flow)
//! and includes a small auto-close script so the user does not have to manually close the tab.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::time::Duration;

use crate::commands::error::CommandError;

/// PKCE code verifier: 43-128 character string, base64url.
/// Challenge = BASE64URL(SHA256(verifier)).
pub fn pkce_pair() -> (String, String) {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("getrandom");
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(digest);
    (verifier, challenge)
}

/// Random URL-safe `state` for CSRF protection on the OAuth round trip.
pub fn random_state() -> String {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).expect("getrandom");
    URL_SAFE_NO_PAD.encode(bytes)
}

const TWITCH_AUTHORIZE: &str = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN: &str = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE: &str = "https://id.twitch.tv/oauth2/validate";
const TWITCH_HELIX_USERS: &str = "https://api.twitch.tv/helix/users";
const SCOPES: &str = "user:read:follows";

/// Fixed port for OAuth callback. Register this exact redirect URI in the Twitch developer console.
pub const TWITCH_REDIRECT_PORT: u16 = 29384;
/// Redirect URI to register at https://dev.twitch.tv/console -> your app -> OAuth Redirect URLs.
/// Uses `localhost` because Twitch's console rejects raw IP addresses as redirect URIs.
pub const TWITCH_REDIRECT_URI: &str = "http://localhost:29384";

/// Block until one HTTP request is received on the listener, parse query for `code`/`error`/`state`.
/// Verifies the returned `state` matches the one we generated (CSRF protection). Returns
/// Ok(Some(code)) on success, Ok(None) if user denied, Err on timeout/parse/state-mismatch.
fn receive_callback(
    listener: TcpListener,
    expected_state: &str,
) -> Result<Option<String>, CommandError> {
    let (mut stream, _) = listener.accept().map_err(|e| {
        if e.kind() == std::io::ErrorKind::TimedOut {
            CommandError::Auth("OAuth callback timed out. Please try again.".to_string())
        } else {
            CommandError::Io(e)
        }
    })?;
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(CommandError::Io)?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(CommandError::Io)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse "GET /?code=...&state=... HTTP/1.1" or "GET /?error=... HTTP/1.1"
    let first_line = request.lines().next().unwrap_or("");
    let path_query = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path_query.split('?').nth(1).unwrap_or("");

    let code = form_param(query, "code");
    let error = form_param(query, "error");
    let state = form_param(query, "state");

    let state_ok = state.as_deref() == Some(expected_state);

    let (status, body) = if !state_ok && code.is_some() {
        (
            "400 Bad Request",
            callback_html(
                "Authorization Failed",
                "The authorization response did not match this session. Close this tab and try connecting again from Nexus settings.",
                false,
            ),
        )
    } else if code.is_some() {
        (
            "200 OK",
            callback_html(
                "Connected to Nexus",
                "Your Twitch account has been linked successfully. You can close this tab and return to Nexus.",
                true,
            ),
        )
    } else if error.as_deref() == Some("access_denied") {
        (
            "200 OK",
            callback_html(
                "Authorization Denied",
                "You chose not to connect your Twitch account. You can close this tab and try again from Nexus settings.",
                false,
            ),
        )
    } else {
        (
            "400 Bad Request",
            callback_html(
                "Authorization Failed",
                "Something went wrong during authorization. Please close this tab and try again from Nexus settings.",
                false,
            ),
        )
    };
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    write_response_and_close(&mut stream, response.as_bytes());

    if let Some(e) = error {
        if e == "access_denied" {
            return Ok(None);
        }
        return Err(CommandError::Auth(format!("Twitch returned error: {e}")));
    }
    if !state_ok {
        return Err(CommandError::Auth(
            "OAuth state mismatch (possible CSRF). Please try again.".to_string(),
        ));
    }
    Ok(code)
}

/// Write the HTTP response and tear the socket down cleanly. We can't just `write_all` and
/// drop, because on Windows in particular dropping a `TcpStream` while bytes are still in the
/// kernel send queue can issue a TCP RST (instead of FIN) and the browser receives an
/// aborted/empty response -- the URL loads but the page renders blank. The explicit
/// `Shutdown::Write` sends a proper FIN, then we drain the read side briefly so the browser
/// has a chance to ACK the bytes before we fully close.
fn write_response_and_close(stream: &mut TcpStream, response: &[u8]) {
    let _ = stream.write_all(response);
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);
    // Best-effort drain. Cap with a short timeout so a misbehaving client can't block us.
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let mut sink = [0u8; 256];
    while matches!(stream.read(&mut sink), Ok(n) if n > 0) {}
}

/// Branded callback page that mirrors the Google Drive flow's design plus a tiny auto-close
/// script so the browser tab dismisses itself ~2.5s after a successful (or denied) callback.
fn callback_html(title: &str, message: &str, success: bool) -> String {
    let (icon, accent) = if success {
        ("&#10003;", "#9146ff") // checkmark, Twitch purple on success
    } else {
        ("&#10007;", "#ef4444") // cross, red
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
  <span class="hint">This tab will close automatically.</span>
</div>
<script>setTimeout(function(){{try{{window.close();}}catch(e){{}}}},2500);</script>
</body>
</html>"#
    )
}

fn form_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        if it.next() == Some(key) {
            if let Some(v) = it.next() {
                return Some(urlencoding::decode(v).unwrap_or_default().into_owned());
            }
        }
    }
    None
}

/// Build the authorize URL for the user to open in the browser.
pub fn authorize_url(
    client_id: &str,
    redirect_uri: &str,
    code_challenge: &str,
    state: &str,
) -> String {
    let params = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", SCOPES),
        ("state", state),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
    ];
    let qs: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect();
    format!("{}?{}", TWITCH_AUTHORIZE, qs.join("&"))
}

/// Exchange authorization code for tokens. Returns (access_token, refresh_token, expires_in_secs).
pub async fn exchange_code(
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<(String, String, i64), CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;
    let has_secret = client_secret.is_some();
    eprintln!("[twitch-auth] POST {TWITCH_TOKEN} (code len={}, verifier len={}, has_secret={has_secret})", code.len(), code_verifier.len());

    let mut params = vec![
        ("client_id", client_id),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
    ];
    if let Some(secret) = client_secret {
        params.push(("client_secret", secret));
    }

    let res = client
        .post(TWITCH_TOKEN)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[twitch-auth] token exchange request failed: {e}");
            map_reqwest_error(e)
        })?;

    let status = res.status();
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    eprintln!("[twitch-auth] token exchange response: status={status}, body_len={}", body.len());

    if !status.is_success() {
        eprintln!("[twitch-auth] token exchange error: {body}");
        return Err(parse_token_error(status.as_u16(), &body));
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("token response json: {e}")))?;
    let access_token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CommandError::Auth("token response missing access_token".to_string()))?
        .to_string();
    let refresh_token = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CommandError::Auth("token response missing refresh_token".to_string()))?
        .to_string();
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    Ok((access_token, refresh_token, expires_in))
}

/// Refresh access token. Returns (access_token, refresh_token, expires_in_secs).
/// Twitch rotates the refresh token on each successful use.
pub async fn refresh_access_token(
    client_id: &str,
    refresh_token: &str,
) -> Result<(String, String, i64), CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;
    let res = client
        .post(TWITCH_TOKEN)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(map_reqwest_error)?;

    let status = res.status();
    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;

    if !status.is_success() {
        return Err(parse_token_error(status.as_u16(), &body));
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("refresh response json: {e}")))?;
    let access_token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CommandError::Auth("refresh response missing access_token".to_string()))?
        .to_string();
    let new_refresh = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| refresh_token.to_string());
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    Ok((access_token, new_refresh, expires_in))
}

/// Validate an access token per Twitch requirements (on startup + hourly).
/// Returns Ok(expires_in_secs) if valid, Err(Auth) if invalid/revoked,
/// or Err(NetworkUnavailable/Unknown) on transient failure.
pub async fn validate_token(access_token: &str) -> Result<i64, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;
    let res = client
        .get(TWITCH_VALIDATE)
        .header("Authorization", format!("OAuth {access_token}"))
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if res.status().as_u16() == 401 {
        return Err(CommandError::Auth("Token invalid or revoked".to_string()));
    }

    if !res.status().is_success() {
        let status = res.status().as_u16();
        return Err(CommandError::Api(format!("Twitch validate returned {status}")));
    }

    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("validate json: {e}")))?;
    let expires_in = json
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    Ok(expires_in)
}

/// Fetched Twitch user identity returned by `helix/users`.
#[derive(Debug, Clone)]
pub struct TwitchUserInfo {
    pub id: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,
}

/// Get Twitch user (id, display_name, profile_image_url) using access token.
pub async fn get_twitch_user(
    client_id: &str,
    access_token: &str,
) -> Result<TwitchUserInfo, CommandError> {
    let client = reqwest::Client::new();
    let res = client
        .get(TWITCH_HELIX_USERS)
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(map_reqwest_error)?;

    if res.status() == 401 {
        return Err(CommandError::Auth("Twitch token invalid or expired".to_string()));
    }

    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("helix users json: {e}")))?;
    let data = json
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| CommandError::Auth("helix users response missing data".to_string()))?;
    let user = data
        .first()
        .ok_or_else(|| CommandError::Auth("helix users data empty".to_string()))?;
    let id = user
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CommandError::Auth("user missing id".to_string()))?
        .to_string();
    let display_name = user
        .get("display_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let profile_image_url = user
        .get("profile_image_url")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from);
    Ok(TwitchUserInfo {
        id,
        display_name,
        profile_image_url,
    })
}

fn map_reqwest_error(e: reqwest::Error) -> CommandError {
    if e.is_connect() || e.is_timeout() {
        CommandError::NetworkUnavailable(e.to_string())
    } else {
        CommandError::Unknown(e.to_string())
    }
}

fn parse_token_error(status: u16, body: &str) -> CommandError {
    let msg = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|j| j.get("message").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| body.to_string());
    if status == 400 && (msg.contains("invalid") || msg.contains("grant")) {
        CommandError::Auth(msg)
    } else if status == 401 || status == 403 {
        CommandError::Auth(format!("Token exchange unauthorized ({})", status))
    } else if status >= 500 {
        CommandError::Api(format!("Twitch server error {}: {}", status, msg))
    } else {
        CommandError::Api(format!("Twitch token error {}: {}", status, msg))
    }
}

/// Output of a successful auth flow.
#[derive(Debug, Clone)]
pub struct AuthFlowResult {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub user: TwitchUserInfo,
}

/// Run the full auth flow: bind callback, build URL with CSRF state, open browser, wait for
/// callback (with state validation), exchange code, fetch user (with avatar).
pub async fn run_auth_flow(
    client_id: &str,
    client_secret: Option<&str>,
    open_url_fn: impl FnOnce(&str),
) -> Result<AuthFlowResult, CommandError> {
    let (verifier, challenge) = pkce_pair();
    let state = random_state();
    let listener = TcpListener::bind(("127.0.0.1", TWITCH_REDIRECT_PORT)).map_err(|e| {
        CommandError::NetworkUnavailable(format!("failed to bind callback listener: {e}"))
    })?;

    let redirect_uri = TWITCH_REDIRECT_URI;
    let url = authorize_url(client_id, redirect_uri, &challenge, &state);
    eprintln!("[twitch-auth] opening browser for OAuth");
    open_url_fn(&url);

    // Move the blocking TCP accept off the async runtime so it doesn't
    // starve Tokio worker threads while waiting for the browser callback.
    eprintln!("[twitch-auth] waiting for callback on port {TWITCH_REDIRECT_PORT}...");
    let state_for_cb = state.clone();
    let code = tokio::task::spawn_blocking(move || receive_callback(listener, &state_for_cb))
        .await
        .map_err(|e| CommandError::Unknown(format!("callback task panicked: {e}")))??;
    let code = code.ok_or_else(|| CommandError::Auth("Authorization was denied".to_string()))?;
    eprintln!("[twitch-auth] got callback code, exchanging for tokens...");

    let (access_token, refresh_token, expires_in) =
        exchange_code(client_id, client_secret, &code, &verifier, redirect_uri).await?;
    eprintln!("[twitch-auth] token exchange ok, fetching user...");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let expires_at = now_secs + expires_in;

    let user = get_twitch_user(client_id, &access_token).await?;
    eprintln!("[twitch-auth] auth complete for user: {}", user.display_name);

    Ok(AuthFlowResult {
        access_token,
        refresh_token,
        expires_at,
        user,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_pair_valid_s256() {
        let (verifier, challenge) = pkce_pair();
        assert!(verifier.len() >= 43 && verifier.len() <= 128);
        assert!(!challenge.is_empty());
        assert!(!verifier.contains('+'));
        assert!(!verifier.contains('/'));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
        // Challenge = BASE64URL(SHA256(verifier))
        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let digest = hasher.finalize();
        let expected = URL_SAFE_NO_PAD.encode(digest);
        assert_eq!(challenge, expected);
    }

    #[test]
    fn random_state_is_url_safe_and_long_enough() {
        let s = random_state();
        assert!(s.len() >= 24);
        assert!(!s.contains('+'));
        assert!(!s.contains('/'));
        assert!(!s.contains('='));
        // distinct between calls (probabilistically)
        let s2 = random_state();
        assert_ne!(s, s2);
    }

    #[test]
    fn form_param_parses_code() {
        let q = "state=abc&code=xyz123&scope=user";
        assert_eq!(form_param(q, "code"), Some("xyz123".to_string()));
        assert_eq!(form_param(q, "state"), Some("abc".to_string()));
        assert_eq!(form_param(q, "missing"), None);
    }

    #[test]
    fn authorize_url_contains_required_params() {
        let url = authorize_url("my_client", "http://127.0.0.1:9999", "challenge123", "stATE-123");
        assert!(url.contains("client_id=my_client"));
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge=challenge123"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope=user%3Aread%3Afollows"));
        assert!(url.contains("state=stATE-123"));
    }

    #[test]
    fn callback_html_includes_brand_and_auto_close() {
        let html = callback_html("Connected to Nexus", "ok", true);
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("Connected to Nexus"));
        assert!(html.contains("window.close()"));
        assert!(html.contains("Content-Type") == false, "header is set on the response, not in body");
        assert!(html.contains("text/html") == false, "header is set on the response, not in body");
    }

    /// Simulate the local callback server: send a fake HTTP request whose query string carries
    /// a `state` that does NOT match the expected value. Verify the receiver returns Auth error.
    #[test]
    fn receive_callback_rejects_state_mismatch() {
        use std::net::TcpStream;

        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();

        let writer = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            let req = b"GET /?code=abc123&state=evil HTTP/1.1\r\nHost: localhost\r\n\r\n";
            let _ = stream.write_all(req);
            let _ = stream.flush();
            // Drain so the server can finish writing.
            let mut sink = Vec::new();
            let _ = stream.read_to_end(&mut sink);
        });

        let result = receive_callback(listener, "expected-state");
        writer.join().unwrap();

        match result {
            Err(CommandError::Auth(msg)) => assert!(msg.to_lowercase().contains("state")),
            other => panic!("expected Auth error for state mismatch, got {:?}", other),
        }
    }

    /// Same setup but the state matches: the receiver should return the code.
    #[test]
    fn receive_callback_accepts_matching_state() {
        use std::net::TcpStream;

        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();

        let writer = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            let req = b"GET /?code=abc123&state=good HTTP/1.1\r\nHost: localhost\r\n\r\n";
            let _ = stream.write_all(req);
            let _ = stream.flush();
            let mut sink = Vec::new();
            let _ = stream.read_to_end(&mut sink);
        });

        let result = receive_callback(listener, "good");
        writer.join().unwrap();

        match result {
            Ok(Some(code)) => assert_eq!(code, "abc123"),
            other => panic!("expected Ok(Some(code)), got {:?}", other),
        }
    }
}
