/// Shared time utilities and string helpers for Tauri commands.
/// Uses no external crates — pure std only.

/// Normalizes a game title for storage and metadata lookup by stripping
/// trademark, registered, and copyright symbols (e.g. TM, (R), ®, ™, ©)
/// so APIs like IGDB and SteamGridDB can match correctly.
pub fn normalize_game_title(s: &str) -> String {
    let mut t = s
        .replace('\u{00AE}', "")  // ®
        .replace('\u{2122}', "")  // ™
        .replace('\u{00A9}', ""); // ©

    // Strip parenthesized (R), (r), (TM), (tm), (C), (c) and common variants
    let patterns = [
        " (R)", "(R)", " (r)", "(r)", " (TM)", "(TM)", " (tm)", "(tm)",
        " (C)", "(C)", " (c)", "(c)", " (C)", " ®", " ™", " ©",
    ];
    for p in &patterns {
        t = t.replace(p, "");
    }

    // Strip trailing " TM" or " tm" (standalone suffix)
    if t.ends_with(" TM") {
        t = t.trim_end_matches(" TM").to_string();
    } else if t.ends_with(" tm") {
        t = t.trim_end_matches(" tm").to_string();
    }

    // Collapse internal whitespace and trim
    t.split_whitespace().collect::<Vec<_>>().join(" ").trim().to_string()
}

pub fn now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let secs_per_day = 86400;
    let days = now / secs_per_day;
    let remaining = now % secs_per_day;
    let hours = remaining / 3600;
    let minutes = (remaining % 3600) / 60;
    let seconds = remaining % 60;

    let (year, month, day) = days_to_ymd(days);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

// Algorithm from http://howardhinnant.github.io/date_algorithms.html
fn days_to_ymd(days_since_epoch: u64) -> (u64, u64, u64) {
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

pub fn iso_to_epoch_secs(iso: &str) -> Result<i64, String> {
    let trimmed = iso.trim_end_matches('Z');
    let parts: Vec<&str> = trimmed.split('T').collect();
    if parts.len() != 2 {
        return Err(format!("invalid ISO timestamp: {iso}"));
    }

    let date_parts: Vec<&str> = parts[0].split('-').collect();
    let time_parts: Vec<&str> = parts[1].split(':').collect();
    if date_parts.len() != 3 || time_parts.len() != 3 {
        return Err(format!("invalid ISO timestamp: {iso}"));
    }

    let year: i64 = date_parts[0].parse().map_err(|_| format!("invalid year in: {iso}"))?;
    let month: i64 = date_parts[1].parse().map_err(|_| format!("invalid month in: {iso}"))?;
    let day: i64 = date_parts[2].parse().map_err(|_| format!("invalid day in: {iso}"))?;
    let hour: i64 = time_parts[0].parse().map_err(|_| format!("invalid hour in: {iso}"))?;
    let min: i64 = time_parts[1].parse().map_err(|_| format!("invalid minute in: {iso}"))?;

    // Handle seconds with optional fractional part (e.g. "45.123")
    let sec_str = time_parts[2].split('.').next().unwrap_or(time_parts[2]);
    let sec: i64 = sec_str.parse().map_err(|_| format!("invalid second in: {iso}"))?;

    let (y, m_adj) = if month <= 2 { (year - 1, month + 9) } else { (year, month - 3) };
    let era = y / 400;
    let yoe = y - era * 400;
    let doy = (153 * m_adj + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;

    Ok(days * 86400 + hour * 3600 + min * 60 + sec)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn now_iso_returns_valid_format() {
        let ts = now_iso();
        assert!(ts.ends_with('Z'));
        assert!(ts.contains('T'));
        assert_eq!(ts.len(), 20); // "YYYY-MM-DDTHH:MM:SSZ"
    }

    #[test]
    fn iso_to_epoch_secs_parses_correctly() {
        let epoch = iso_to_epoch_secs("2026-01-15T10:00:00Z").unwrap();
        let epoch2 = iso_to_epoch_secs("2026-01-15T11:00:00Z").unwrap();
        assert_eq!(epoch2 - epoch, 3600);
    }

    #[test]
    fn iso_to_epoch_secs_handles_milliseconds() {
        let without_ms = iso_to_epoch_secs("2026-01-15T10:00:00Z").unwrap();
        let with_ms = iso_to_epoch_secs("2026-01-15T10:00:00.123Z").unwrap();
        assert_eq!(without_ms, with_ms);
    }

    #[test]
    fn iso_to_epoch_secs_rejects_invalid() {
        assert!(iso_to_epoch_secs("not-a-date").is_err());
        assert!(iso_to_epoch_secs("2026-01-15").is_err());
    }

    #[test]
    fn roundtrip_epoch_known_date() {
        // 2026-01-01T00:00:00Z = 1767225600 seconds since epoch
        let secs = iso_to_epoch_secs("2026-01-01T00:00:00Z").unwrap();
        assert_eq!(secs, 1767225600);
    }

    // ── normalize_game_title ──

    #[test]
    fn normalize_game_title_strips_tm() {
        assert_eq!(normalize_game_title("Game Name TM"), "Game Name");
        assert_eq!(normalize_game_title("Game Name tm"), "Game Name");
    }

    #[test]
    fn normalize_game_title_strips_r() {
        assert_eq!(normalize_game_title("Game Name (R)"), "Game Name");
        assert_eq!(normalize_game_title("Game Name(R)"), "Game Name");
    }

    #[test]
    fn normalize_game_title_strips_unicode_symbols() {
        assert_eq!(normalize_game_title("Game®"), "Game");
        assert_eq!(normalize_game_title("Game™"), "Game");
        assert_eq!(normalize_game_title("Game©"), "Game");
    }

    #[test]
    fn normalize_game_title_collapses_whitespace() {
        assert_eq!(normalize_game_title("  Game   Name  "), "Game Name");
    }

    #[test]
    fn normalize_game_title_unchanged_when_clean() {
        assert_eq!(normalize_game_title("Halo Infinite"), "Halo Infinite");
    }
}
