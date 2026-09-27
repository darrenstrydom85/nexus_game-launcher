//! Google Drive OAuth2 Authorization Code flow with PKCE and CSRF state (shared plumbing
//! in `crate::oauth`), plus the user email lookup shown in settings.

use std::time::Duration;

use crate::commands::error::CommandError;
use crate::oauth::{self, Provider};

const GOOGLE_AUTHORIZE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const SCOPES: &str = "https://www.googleapis.com/auth/drive.file email";

static GOOGLE: Provider = Provider {
    name: "Google",
    account: "Google Drive account",
    accent: "#22c55e",
    port: 29385,
    redirect_uri: "http://localhost:29385",
};

pub fn authorize_url(client_id: &str, code_challenge: &str, state: &str) -> String {
    oauth::build_url(
        GOOGLE_AUTHORIZE,
        &[
            ("client_id", client_id),
            ("redirect_uri", GOOGLE.redirect_uri),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("state", state),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            ("prompt", "consent"),
        ],
    )
}

/// Refresh access token. Returns (new_access_token, refresh_token, expires_in_secs).
/// Google does not rotate refresh tokens by default, so the old one is kept.
pub async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, String, i64), CommandError> {
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ];
    let json = oauth::token_request(&GOOGLE, GOOGLE_TOKEN, &params).await?;
    oauth::token_triple(&json, Some(refresh_token), 3600)
}

/// Get Google user email using access token.
pub async fn get_google_user_email(access_token: &str) -> Result<String, CommandError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| CommandError::Unknown(format!("http client build: {e}")))?;

    eprintln!("[Google-auth] GET {GOOGLE_USERINFO}");
    let res = client
        .get(GOOGLE_USERINFO)
        .header("Authorization", format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| {
            eprintln!("[Google-auth] userinfo request failed: {e}");
            oauth::map_reqwest_error(e)
        })?;

    let status = res.status();
    eprintln!("[Google-auth] userinfo response status: {status}");

    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CommandError::Auth(
            "Google token invalid or expired".to_string(),
        ));
    }

    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("userinfo json: {e}")))?;
    let email = json
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    Ok(email)
}

/// Run the full auth flow: browser round trip (PKCE + state), code exchange, email lookup.
/// Returns (access_token, refresh_token, expires_at_secs, email).
pub async fn run_auth_flow(
    client_id: &str,
    client_secret: &str,
    open_url_fn: impl FnOnce(&str),
) -> Result<(String, String, i64, String), CommandError> {
    let (code, verifier) = oauth::authorize(
        &GOOGLE,
        |challenge, state| authorize_url(client_id, challenge, state),
        open_url_fn,
    )
    .await?;

    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", &code),
        ("grant_type", "authorization_code"),
        ("redirect_uri", GOOGLE.redirect_uri),
        ("code_verifier", &verifier),
    ];
    let json = oauth::token_request(&GOOGLE, GOOGLE_TOKEN, &params).await?;
    let (access_token, refresh_token, expires_in) = oauth::token_triple(&json, None, 3600)?;

    let email = get_google_user_email(&access_token).await?;
    eprintln!("[Google-auth] auth complete for user: {email}");
    Ok((access_token, refresh_token, oauth::now_secs() + expires_in, email))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorize_url_contains_required_params() {
        let url = authorize_url("my_client", "challenge123", "st8");
        assert!(url.contains("client_id=my_client"));
        assert!(url.contains("redirect_uri=http%3A%2F%2Flocalhost%3A29385"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge=challenge123"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope="));
        assert!(url.contains("state=st8"));
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("prompt=consent"));
    }
}
