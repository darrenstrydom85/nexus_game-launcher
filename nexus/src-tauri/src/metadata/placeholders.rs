use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradientPlaceholder {
    pub color_start: String,
    pub color_end: String,
    pub svg: String,
}

pub fn generate_gradient(name: &str) -> GradientPlaceholder {
    let hash = simple_hash(name);

    let hue_start = (hash % 360) as u16;
    let hue_end = ((hash / 360) % 360) as u16;

    let color_start = hsl_to_hex(hue_start, 65, 45);
    let color_end = hsl_to_hex(hue_end, 55, 35);

    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:{color_start}"/>
      <stop offset="100%" style="stop-color:{color_end}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <text x="300" y="450" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="36" font-weight="bold" fill="rgba(255,255,255,0.9)">{escaped_name}</text>
</svg>"#,
        color_start = color_start,
        color_end = color_end,
        escaped_name = xml_escape(name),
    );

    GradientPlaceholder {
        color_start,
        color_end,
        svg,
    }
}

pub fn gradient_data_uri(name: &str) -> String {
    let placeholder = generate_gradient(name);
    let encoded = base64_encode(placeholder.svg.as_bytes());
    format!("data:image/svg+xml;base64,{encoded}")
}

fn simple_hash(s: &str) -> u64 {
    let mut hash: u64 = 5381;
    for b in s.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u64);
    }
    hash
}

fn hsl_to_hex(h: u16, s: u8, l: u8) -> String {
    let s_f = s as f64 / 100.0;
    let l_f = l as f64 / 100.0;

    let c = (1.0 - (2.0 * l_f - 1.0).abs()) * s_f;
    let x = c * (1.0 - ((h as f64 / 60.0) % 2.0 - 1.0).abs());
    let m = l_f - c / 2.0;

    let (r1, g1, b1) = match h {
        0..=59 => (c, x, 0.0),
        60..=119 => (x, c, 0.0),
        120..=179 => (0.0, c, x),
        180..=239 => (0.0, x, c),
        240..=299 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    let r = ((r1 + m) * 255.0).round() as u8;
    let g = ((g1 + m) * 255.0).round() as u8;
    let b = ((b1 + m) * 255.0).round() as u8;

    format!("#{r:02x}{g:02x}{b:02x}")
}

fn xml_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };

        let n = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARS[((n >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((n >> 12) & 0x3F) as usize] as char);

        if chunk.len() > 1 {
            result.push(CHARS[((n >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARS[(n & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }

    result
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum KeyAvailability {
    Both,
    SteamGridOnly,
    IgdbOnly,
    Neither,
}

pub fn check_key_availability(
    steamgrid_key: Option<&str>,
    igdb_client_id: Option<&str>,
    igdb_client_secret: Option<&str>,
) -> KeyAvailability {
    let has_steamgrid = steamgrid_key.map_or(false, |k| !k.is_empty());
    let has_igdb = igdb_client_id.map_or(false, |k| !k.is_empty())
        && igdb_client_secret.map_or(false, |k| !k.is_empty());

    match (has_steamgrid, has_igdb) {
        (true, true) => KeyAvailability::Both,
        (true, false) => KeyAvailability::SteamGridOnly,
        (false, true) => KeyAvailability::IgdbOnly,
        (false, false) => KeyAvailability::Neither,
    }
}

pub fn derive_name_from_path(path: &str) -> String {
    let cleaned = path
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string();

    if let Some(last) = cleaned.rsplit('/').next() {
        let name = last
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .replace('_', " ")
            .replace('-', " ");

        let mut result = String::new();
        let mut prev_lower = false;
        for c in name.chars() {
            if c.is_uppercase() && prev_lower {
                result.push(' ');
            }
            result.push(c);
            prev_lower = c.is_lowercase();
        }

        result.trim().to_string()
    } else {
        path.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gradient_consistent_for_same_name() {
        let a = generate_gradient("Halo Infinite");
        let b = generate_gradient("Halo Infinite");
        assert_eq!(a.color_start, b.color_start);
        assert_eq!(a.color_end, b.color_end);
    }

    #[test]
    fn gradient_different_for_different_names() {
        let a = generate_gradient("Halo Infinite");
        let b = generate_gradient("Doom Eternal");
        assert_ne!(a.color_start, b.color_start);
    }

    #[test]
    fn gradient_svg_contains_name() {
        let g = generate_gradient("Test Game");
        assert!(g.svg.contains("Test Game"));
        assert!(g.svg.contains("<svg"));
    }

    #[test]
    fn gradient_svg_escapes_special_chars() {
        let g = generate_gradient("Tom & Jerry <3>");
        assert!(g.svg.contains("Tom &amp; Jerry &lt;3&gt;"));
    }

    #[test]
    fn gradient_data_uri_format() {
        let uri = gradient_data_uri("Test");
        assert!(uri.starts_with("data:image/svg+xml;base64,"));
    }

    #[test]
    fn hsl_to_hex_red() {
        let hex = hsl_to_hex(0, 100, 50);
        assert_eq!(hex, "#ff0000");
    }

    #[test]
    fn hsl_to_hex_green() {
        let hex = hsl_to_hex(120, 100, 50);
        assert_eq!(hex, "#00ff00");
    }

    #[test]
    fn hsl_to_hex_blue() {
        let hex = hsl_to_hex(240, 100, 50);
        assert_eq!(hex, "#0000ff");
    }

    #[test]
    fn key_availability_both() {
        assert_eq!(
            check_key_availability(Some("key"), Some("id"), Some("secret")),
            KeyAvailability::Both
        );
    }

    #[test]
    fn key_availability_steamgrid_only() {
        assert_eq!(
            check_key_availability(Some("key"), None, None),
            KeyAvailability::SteamGridOnly
        );
    }

    #[test]
    fn key_availability_igdb_only() {
        assert_eq!(
            check_key_availability(None, Some("id"), Some("secret")),
            KeyAvailability::IgdbOnly
        );
    }

    #[test]
    fn key_availability_neither() {
        assert_eq!(
            check_key_availability(None, None, None),
            KeyAvailability::Neither
        );
    }

    #[test]
    fn key_availability_empty_strings_treated_as_missing() {
        assert_eq!(
            check_key_availability(Some(""), Some(""), Some("")),
            KeyAvailability::Neither
        );
    }

    #[test]
    fn derive_name_from_exe_path() {
        assert_eq!(
            derive_name_from_path("C:\\Games\\HaloInfinite\\halo_infinite.exe"),
            "halo infinite"
        );
    }

    #[test]
    fn derive_name_from_folder_path() {
        assert_eq!(
            derive_name_from_path("C:\\Games\\Doom Eternal"),
            "Doom Eternal"
        );
    }

    #[test]
    fn derive_name_camel_case_split() {
        assert_eq!(
            derive_name_from_path("C:\\Games\\HaloInfinite"),
            "Halo Infinite"
        );
    }

    #[test]
    fn base64_encode_basic() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hi"), "SGk=");
        assert_eq!(base64_encode(b"ABC"), "QUJD");
    }
}
