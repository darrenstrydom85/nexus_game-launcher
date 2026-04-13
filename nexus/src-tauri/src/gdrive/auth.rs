//! Google OAuth2 Authorization Code flow with PKCE, token exchange, and refresh.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

use crate::commands::error::CommandError;

const GOOGLE_AUTHORIZE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES: &str = "https://www.googleapis.com/auth/drive.file email";

pub const GOOGLE_REDIRECT_PORT: u16 = 29385;
pub const GOOGLE_REDIRECT_URI: &str = "http://localhost:29385";

/// PKCE code verifier + challenge (S256).
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

fn receive_callback(listener: TcpListener) -> Result<Option<String>, CommandError> {
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

    let first_line = request.lines().next().unwrap_or("");
    let path_query = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path_query.split('?').nth(1).unwrap_or("");

    let code = form_param(query, "code");
    let error = form_param(query, "error");

    let (status, body) = if code.is_some() {
        ("200 OK", callback_html("Connected to Nexus", "Your Google Drive account has been linked successfully. You can close this tab and return to Nexus.", true))
    } else if error.as_deref() == Some("access_denied") {
        ("200 OK", callback_html("Authorization Denied", "You chose not to connect your Google Drive account. You can close this tab and try again from Nexus settings.", false))
    } else {
        ("400 Bad Request", callback_html("Authorization Failed", "Something went wrong during authorization. Please close this tab and try again from Nexus settings.", false))
    };
    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
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
        return Err(CommandError::Auth(format!("Google returned error: {e}")));
    }
    Ok(code)
}

fn callback_html(title: &str, message: &str, success: bool) -> String {
    let (icon, accent) = if success {
        ("&#10003;", "#22c55e") // checkmark, green
    } else {
        ("&#10007;", "#ef4444") // cross, red
    };
    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Nexus</title>
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
  <span class="hint">This tab can be safely closed.</span>
</div>
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

pub fn authorize_url(client_id: &str, redirect_uri: &str, code_challenge: &str) -> String {
    let params = [
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("response_type", "code"),
        ("scope", SCOPES),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
        ("access_type", "offline"),
        ("prompt", "consent"),
    ];
    let qs: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect();
    format!("{}?{}", GOOGLE_AUTHORIZE, qs.join("&"))
}

/// Exchange authorization code for tokens. Returns (access_token, refresh_token, expires_in_secs).
pub async fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<(String, String, i64), CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;

    eprintln!(
        "[gdrive-auth] POST {GOOGLE_TOKEN} (code len={}, verifier len={})",
        code.len(),
        code_verifier.len()
    );

    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
        ("code_verifier", code_verifier),
    ];

    let res = client
        .post(GOOGLE_TOKEN)
        .form(&params)
        .send()
        .await
        .map_err(|e| {
            eprintln!("[gdrive-auth] token exchange request failed: {e}");
            map_reqwest_error(e)
        })?;

    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    eprintln!(
        "[gdrive-auth] token exchange response: status={status}, body_len={}",
        body.len()
    );

    if !status.is_success() {
        eprintln!("[gdrive-auth] token exchange error: {body}");
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
        .unwrap_or(3600);
    Ok((access_token, refresh_token, expires_in))
}

/// Refresh access token. Returns (new_access_token, refresh_token, expires_in_secs).
/// Google does not rotate refresh tokens by default, so the same refresh token is returned.
pub async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, String, i64), CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;

    let res = client
        .post(GOOGLE_TOKEN)
        .form(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(map_reqwest_error)?;

    let status = res.status();
    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;

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
        .unwrap_or(3600);
    Ok((access_token, new_refresh, expires_in))
}

/// Get Google user email using access token.
pub async fn get_google_user_email(access_token: &str) -> Result<String, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;

    eprintln!("[gdrive-auth] GET {GOOGLE_USERINFO}");
    let res = client
        .get(GOOGLE_USERINFO)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| {
            eprintln!("[gdrive-auth] userinfo request failed: {e}");
            map_reqwest_error(e)
        })?;

    let status = res.status();
    eprintln!("[gdrive-auth] userinfo response status: {status}");

    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CommandError::Auth(
            "Google token invalid or expired".to_string(),
        ));
    }

    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    eprintln!("[gdrive-auth] userinfo body: {body}");

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("userinfo json: {e}")))?;
    let email = json
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    Ok(email)
}

/// Run the full auth flow: bind callback, build URL, open browser, wait for callback,
/// exchange code, fetch user email.
/// Returns (access_token, refresh_token, expires_at_secs, email).
pub async fn run_auth_flow(
    client_id: &str,
    client_secret: &str,
    open_url_fn: impl FnOnce(&str),
) -> Result<(String, String, i64, String), CommandError> {
    let (verifier, challenge) = pkce_pair();
    let listener = TcpListener::bind(("127.0.0.1", GOOGLE_REDIRECT_PORT)).map_err(|e| {
        CommandError::NetworkUnavailable(format!("failed to bind callback listener: {e}"))
    })?;

    let redirect_uri = GOOGLE_REDIRECT_URI;
    let url = authorize_url(client_id, redirect_uri, &challenge);
    eprintln!("[gdrive-auth] opening browser for OAuth");
    open_url_fn(&url);

    eprintln!("[gdrive-auth] waiting for callback on port {GOOGLE_REDIRECT_PORT}...");
    let code = tokio::task::spawn_blocking(move || receive_callback(listener))
        .await
        .map_err(|e| CommandError::Unknown(format!("callback task panicked: {e}")))?
        ?;
    let code = code.ok_or_else(|| CommandError::Auth("Authorization was denied".to_string()))?;
    eprintln!("[gdrive-auth] got callback code, exchanging for tokens...");

    let (access_token, refresh_token, expires_in) =
        exchange_code(client_id, client_secret, &code, &verifier, redirect_uri).await?;
    eprintln!("[gdrive-auth] token exchange ok, fetching user email...");

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let expires_at = now_secs + expires_in;

    let email = get_google_user_email(&access_token).await?;
    eprintln!("[gdrive-auth] auth complete for user: {email}");

    Ok((access_token, refresh_token, expires_at, email))
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
        .and_then(|j| {
            j.get("error_description")
                .or_else(|| j.get("error"))
                .and_then(|v| v.as_str())
                .map(String::from)
        })
        .unwrap_or_else(|| body.to_string());
    if status == 400 && (msg.contains("invalid") || msg.contains("grant")) {
        CommandError::Auth(msg)
    } else if status == 401 || status == 403 {
        CommandError::Auth(format!("Token exchange unauthorized ({status})"))
    } else if status >= 500 {
        CommandError::Api(format!("Google server error {status}: {msg}"))
    } else {
        CommandError::Api(format!("Google token error {status}: {msg}"))
    }
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
        assert!(url.contains("scope="));
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("prompt=consent"));
    }
}
