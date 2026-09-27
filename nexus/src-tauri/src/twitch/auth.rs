//! Twitch OAuth2 Authorization Code flow with PKCE and CSRF state (shared plumbing in
//! `crate::oauth`), plus token validation and user lookup.

use std::time::Duration;

use crate::commands::error::CommandError;
use crate::oauth::{self, Provider};

const TWITCH_AUTHORIZE: &str = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN: &str = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE: &str = "https://id.twitch.tv/oauth2/validate";
const TWITCH_HELIX_USERS: &str = "https://api.twitch.tv/helix/users";
const SCOPES: &str = "user:read:follows";

/// Register `redirect_uri` exactly at https://dev.twitch.tv/console -> your app -> OAuth
/// Redirect URLs. `localhost` because Twitch's console rejects raw IP addresses.
static TWITCH: Provider = Provider {
    name: "Twitch",
    account: "Twitch account",
    accent: "#9146ff",
    port: 29384,
    redirect_uri: "http://localhost:29384",
};

/// Build the authorize URL for the user to open in the browser.
pub fn authorize_url(client_id: &str, code_challenge: &str, state: &str) -> String {
    oauth::build_url(
        TWITCH_AUTHORIZE,
        &[
            ("client_id", client_id),
            ("redirect_uri", TWITCH.redirect_uri),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("state", state),
            ("code_challenge", code_challenge),
            ("code_challenge_method", "S256"),
        ],
    )
}

/// Append `client_secret` when the build has one (confidential client).
fn with_secret<'a>(
    mut params: Vec<(&'static str, &'a str)>,
    client_secret: Option<&'a str>,
) -> Vec<(&'static str, &'a str)> {
    if let Some(secret) = client_secret {
        params.push(("client_secret", secret));
    }
    params
}

/// Parameters for a `refresh_token` grant. Extracted so the presence of `client_secret`
/// can be unit-tested without a live Twitch server.
fn build_refresh_params<'a>(
    client_id: &'a str,
    client_secret: Option<&'a str>,
    refresh_token: &'a str,
) -> Vec<(&'static str, &'a str)> {
    with_secret(
        vec![
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ],
        client_secret,
    )
}

/// Refresh access token. Returns (access_token, refresh_token, expires_in_secs).
/// Twitch rotates the refresh token on each successful use.
///
/// ## Why `client_secret` is required even with PKCE
///
/// Twitch's token endpoint requires `client_secret` on the `refresh_token`
/// grant regardless of how the original authorization code was exchanged
/// (PKCE or confidential). Omitting it yields `400 invalid_client` with
/// `"missing client secret"` — which is what bricked overnight refreshes
/// before this parameter existed. See:
/// https://dev.twitch.tv/docs/authentication/refresh-tokens/
pub async fn refresh_access_token(
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Result<(String, String, i64), CommandError> {
    let params = build_refresh_params(client_id, client_secret, refresh_token);
    let json = oauth::token_request(&TWITCH, TWITCH_TOKEN, &params).await?;
    oauth::token_triple(&json, Some(refresh_token), 0)
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
        .map_err(oauth::map_reqwest_error)?;

    if res.status().as_u16() == 401 {
        return Err(CommandError::Auth("Token invalid or revoked".to_string()));
    }

    if !res.status().is_success() {
        let status = res.status().as_u16();
        return Err(CommandError::Api(format!(
            "Twitch validate returned {status}"
        )));
    }

    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| CommandError::Parse(format!("validate json: {e}")))?;
    let expires_in = json.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(0);
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
        .map_err(oauth::map_reqwest_error)?;

    if res.status() == 401 {
        return Err(CommandError::Auth(
            "Twitch token invalid or expired".to_string(),
        ));
    }

    let body = res
        .text()
        .await
        .map_err(|e| CommandError::Unknown(e.to_string()))?;
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

/// Output of a successful auth flow.
#[derive(Debug, Clone)]
pub struct AuthFlowResult {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub user: TwitchUserInfo,
}

/// Run the full auth flow: browser round trip (PKCE + state), code exchange, user lookup.
pub async fn run_auth_flow(
    client_id: &str,
    client_secret: Option<&str>,
    open_url_fn: impl FnOnce(&str),
) -> Result<AuthFlowResult, CommandError> {
    let (code, verifier) = oauth::authorize(
        &TWITCH,
        |challenge, state| authorize_url(client_id, challenge, state),
        open_url_fn,
    )
    .await?;

    let params = with_secret(
        vec![
            ("client_id", client_id),
            ("code", &code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", TWITCH.redirect_uri),
            ("code_verifier", &verifier),
        ],
        client_secret,
    );
    let json = oauth::token_request(&TWITCH, TWITCH_TOKEN, &params).await?;
    let (access_token, refresh_token, expires_in) = oauth::token_triple(&json, None, 0)?;

    let user = get_twitch_user(client_id, &access_token).await?;
    eprintln!("[Twitch-auth] auth complete for user: {}", user.display_name);
    Ok(AuthFlowResult {
        access_token,
        refresh_token,
        expires_at: crate::utils::now_secs() + expires_in,
        user,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_refresh_params_includes_client_secret_when_provided() {
        let params = build_refresh_params("cid_123", Some("sec_abc"), "r0t");
        assert!(params.contains(&("client_id", "cid_123")));
        assert!(params.contains(&("grant_type", "refresh_token")));
        assert!(params.contains(&("refresh_token", "r0t")));
        assert!(
            params.contains(&("client_secret", "sec_abc")),
            "Twitch requires client_secret on the refresh grant — omitting it              causes `400 invalid_client: missing client secret` overnight"
        );
    }

    #[test]
    fn build_refresh_params_omits_client_secret_when_none() {
        let params = build_refresh_params("cid_123", None, "r0t");
        assert!(params.iter().all(|(k, _)| *k != "client_secret"));
    }

    #[test]
    fn authorize_url_contains_required_params() {
        let url = authorize_url("my_client", "challenge123", "stATE-123");
        assert!(url.contains("client_id=my_client"));
        assert!(url.contains("redirect_uri=http%3A%2F%2Flocalhost%3A29384"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("code_challenge=challenge123"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope=user%3Aread%3Afollows"));
        assert!(url.contains("state=stATE-123"));
    }
}
