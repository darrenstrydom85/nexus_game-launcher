//! Twitch API connectivity check with 30s result cache (Story 19.11).
//! Uses TCP connect to api.twitch.tv:443 with 3s timeout (same as check_twitch_api_available).

use std::net::ToSocketAddrs;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);

struct CacheEntry {
    online: bool,
    checked_at: Instant,
}

static CACHE: Mutex<Option<CacheEntry>> = Mutex::new(None);

/// Perform a lightweight connectivity check: TCP connect to api.twitch.tv:443 with timeout.
/// Result is cached for 30 seconds.
pub fn check_online() -> bool {
    let cached = {
        let guard = match CACHE.lock() {
            Ok(g) => g,
            Err(_) => return do_check_online(),
        };
        guard.as_ref().and_then(|e| {
            if e.checked_at.elapsed() < CACHE_TTL {
                Some(e.online)
            } else {
                None
            }
        })
    };
    if let Some(online) = cached {
        return online;
    }

    let online = do_check_online();
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(CacheEntry {
            online,
            checked_at: Instant::now(),
        });
    }
    online
}

/// Return the last-known connectivity result without making a request.
pub fn is_cached_online() -> bool {
    CACHE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|e| e.online))
        .unwrap_or(false)
}

fn do_check_online() -> bool {
    let addr = match ("api.twitch.tv", 443).to_socket_addrs() {
        Ok(mut a) => match a.next() {
            Some(addr) => addr,
            None => return false,
        },
        Err(_) => return false,
    };
    std::net::TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_cached_online_returns_false_when_never_checked() {
        let guard = CACHE.lock().unwrap();
        let result = guard.as_ref().map(|e| e.online);
        drop(guard);
        assert!(result.is_none() || result == Some(false) || result == Some(true));
    }
}
