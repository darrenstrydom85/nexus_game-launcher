//! Twitch OAuth2 Authorization Code flow with PKCE, token exchange, and refresh.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

use crate::commands::error::CommandError;

/// PKCE code verifier: 43–128 character string, base64url.
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

const TWITCH_AUTHORIZE: &str = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN: &str = "https://id.twitch.tv/oauth2/token";
const TWITCH_HELIX_USERS: &str = "https://api.twitch.tv/helix/users";
const SCOPES: &str = "user:read:follows";

/// Fixed port for OAuth callback. Register this exact redirect URI in the Twitch developer console.
pub const TWITCH_REDIRECT_PORT: u16 = 29384;
/// Redirect URI to register at https://dev.twitch.tv/console → your app → OAuth Redirect URLs.
/// Uses `localhost` because Twitch's console rejects raw IP addresses as redirect URIs.
pub const TWITCH_REDIRECT_URI: &str = "http://localhost:29384";

/// Block until one HTTP request is received on the listener, parse query for `code` or `error`.
/// Returns Ok(Some(code)) on success, Ok(None) if user denied (error param), Err on timeout/parse.
fn receive_callback(listener: TcpListener) -> Result<Option<String>, CommandError> {
    let (mut stream, _) = listener.accept().map_err(|e| {
        if e.kind() == std::io::ErrorKind::TimedOut {
            CommandError::Auth("OAuth callback timed out. Please try again.".to_string())
        } else {
            CommandError::Io(e)
        }
    })?;
    stream.set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(|e| CommandError::Io(e))?;

    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).map_err(CommandError::Io)?;
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse "GET /?code=... HTTP/1.1" or "GET /?error=... HTTP/1.1"
    let first_line = request.lines().next().unwrap_or("");
    let path_query = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path_query.split('?').nth(1).unwrap_or("");

    let code = form_param(query, "code");
    let error = form_param(query, "error");

    // Send minimal HTTP response so browser shows success/failure
    let (status, body) = if code.is_some() {
        ("200 OK", "<html><body>Authorization successful. You can close this window.</body></html>")
    } else if error.as_deref() == Some("access_denied") {
        ("200 OK", "<html><body>Authorization was denied. You can close this window.</body></html>")
    } else {
        ("400 Bad Request", "<html><body>Authorization failed. You can close this window.</body></html>")
    };
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();

    if let Some(e) = error {
        if e == "access_denied" {
            return Ok(None);
        }
        return Err(CommandError::Auth(format!("Twitch returned error: {e}")));
    }
    Ok(code)
}

fn form_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        if it.next() == Some(key) {
            if let Some(v) = it.next() {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Build the authorize URL for the user to open in the browser.
pub fn authorize_url(client_id: &str, redirect_uri: &str, code_challenge: &str) -> String {
    let params = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", SCOPES),
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

/// Refresh access token. Returns (access_token, expires_in_secs). Refresh token is rotated in response.
pub async fn refresh_access_token(
    client_id: &str,
    refresh_token: &str,
) -> Result<(String, String, i64), CommandError> {
    let client = reqwest::Client::new();
    let res = client
        .post(TWITCH_TOKEN)
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|e| map_reqwest_error(e))?;

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

/// Get Twitch user (id, display_name) using access token.
pub async fn get_twitch_user(
    client_id: &str,
    access_token: &str,
) -> Result<(String, String), CommandError> {
    let client = reqwest::Client::new();
    let res = client
        .get(TWITCH_HELIX_USERS)
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| map_reqwest_error(e))?;

    if res.status() == 401 {
        return Err(CommandError::Auth("Twitch token invalid or expired".to_string()));
    }

    let body = res.text().await.map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("helix users json: {e}")))?;
    let data = json.get("data").and_then(|v| v.as_array()).ok_or_else(|| {
        CommandError::Auth("helix users response missing data".to_string())
    })?;
    let user = data.first().ok_or_else(|| {
        CommandError::Auth("helix users data empty".to_string())
    })?;
    let id = user.get("id").and_then(|v| v.as_str()).ok_or_else(|| {
        CommandError::Auth("user missing id".to_string())
    })?.to_string();
    let display_name = user.get("display_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    Ok((id, display_name))
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
    } else if status == 401 {
        CommandError::Auth("Token exchange unauthorized".to_string())
    } else {
        CommandError::Auth(msg)
    }
}

/// Run the full auth flow: bind callback, build URL, open browser, wait for callback, exchange code, fetch user.
/// Returns (access_token, refresh_token, expires_at_secs, user_id, display_name).
pub async fn run_auth_flow(
    client_id: &str,
    client_secret: Option<&str>,
    open_url_fn: impl FnOnce(&str),
) -> Result<(String, String, i64, String, String), CommandError> {
    let (verifier, challenge) = pkce_pair();
    let listener = TcpListener::bind(("127.0.0.1", TWITCH_REDIRECT_PORT)).map_err(|e| {
        CommandError::NetworkUnavailable(format!("failed to bind callback listener: {e}"))
    })?;

    let redirect_uri = TWITCH_REDIRECT_URI;
    let url = authorize_url(client_id, redirect_uri, &challenge);
    eprintln!("[twitch-auth] opening browser for OAuth");
    open_url_fn(&url);

    // Move the blocking TCP accept off the async runtime so it doesn't
    // starve Tokio worker threads while waiting for the browser callback.
    eprintln!("[twitch-auth] waiting for callback on port {TWITCH_REDIRECT_PORT}...");
    let code = tokio::task::spawn_blocking(move || receive_callback(listener))
        .await
        .map_err(|e| CommandError::Unknown(format!("callback task panicked: {e}")))?
        ?;
    let code = code.ok_or_else(|| CommandError::Auth("Authorization was denied".to_string()))?;
    eprintln!("[twitch-auth] got callback code, exchanging for tokens...");

    let (access_token, refresh_token, expires_in) = exchange_code(
        client_id,
        client_secret,
        &code,
        &verifier,
        redirect_uri,
    )
    .await?;
    eprintln!("[twitch-auth] token exchange ok, fetching user...");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let expires_at = now_secs + expires_in;

    let (user_id, display_name) = get_twitch_user(client_id, &access_token).await?;
    eprintln!("[twitch-auth] auth complete for user: {display_name}");

    Ok((
        access_token,
        refresh_token,
        expires_at,
        user_id,
        display_name,
    ))
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
    fn form_param_parses_code() {
        let q = "state=abc&code=xyz123&scope=user";
        assert_eq!(form_param(q, "code"), Some("xyz123".to_string()));
        assert_eq!(form_param(q, "state"), Some("abc".to_string()));
        assert_eq!(form_param(q, "missing"), None);
    }

    #[test]
    fn authorize_url_contains_required_params() {
        let url = authorize_url("my_client", "http://127.0.0.1:9999", "challenge123");
        assert!(url.contains("client_id=my_client"));
        assert!(url.contains("redirect_uri="));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge=challenge123"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope=user%3Aread%3Afollows"));
    }
}
