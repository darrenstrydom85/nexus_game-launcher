use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::game::GameSource as GameSourceType;

use super::{resolve_path, DetectedGame, GameSource, SourceError};

// ---------------------------------------------------------------------------
// Task 1: Path resolution — Battle.net client + data paths
// ---------------------------------------------------------------------------

pub struct BattleNetScanner {
    path_override: Option<PathBuf>,
    data_path_override: Option<PathBuf>,
    resolved: Option<PathBuf>,
    resolved_data: Option<PathBuf>,
}

impl BattleNetScanner {
    pub fn new() -> Self {
        Self {
            path_override: None,
            data_path_override: None,
            resolved: None,
            resolved_data: None,
        }
    }

    fn resolve(&mut self) {
        let (path, _method) = resolve_path(
            &self.path_override,
            detect_battlenet_from_registry,
            &self.default_paths(),
        );
        self.resolved = path;

        let data_defaults = vec![PathBuf::from(r"C:\ProgramData\Battle.net")];
        let (data_path, _) = resolve_path(
            &self.data_path_override,
            || None,
            &data_defaults,
        );
        self.resolved_data = data_path;
    }

    pub fn set_data_path_override(&mut self, path: Option<PathBuf>) {
        self.data_path_override = path;
        self.resolve();
    }
}

/// Read the Battle.net install path from the Windows registry.
///
/// Checks `HKLM\SOFTWARE\WOW6432Node\Blizzard Entertainment\Battle.net\` → `InstallPath`.
#[cfg(target_os = "windows")]
fn detect_battlenet_from_registry() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) =
        hklm.open_subkey(r"SOFTWARE\WOW6432Node\Blizzard Entertainment\Battle.net")
    {
        if let Ok(install_path) = key.get_value::<String, _>("InstallPath") {
            let path = PathBuf::from(&install_path);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
fn detect_battlenet_from_registry() -> Option<PathBuf> {
    None
}

// ---------------------------------------------------------------------------
// Task 3: product.db parsing (protobuf via prost)
// ---------------------------------------------------------------------------

/// A product entry extracted from Battle.net's product.db.
#[derive(Debug, Clone)]
pub(crate) struct BnetProduct {
    pub product_code: String,
    pub install_path: PathBuf,
}

/// Parse Battle.net's product.db protobuf file.
///
/// The product.db is a protobuf-encoded file containing a list of installed
/// products. Each product has a product code (e.g. "wow", "d3") and an
/// install path. The file uses a well-known reverse-engineered schema.
///
/// We use `prost` for decoding. The message definitions are derived from
/// community documentation of the Battle.net Agent protocol.
pub(crate) fn parse_product_db(data_path: &Path) -> Result<Vec<BnetProduct>, SourceError> {
    let db_path = data_path.join("Agent").join("product.db");

    let bytes = std::fs::read(&db_path).map_err(|e| {
        SourceError::Parse(format!(
            "failed to read product.db at {}: {e}",
            db_path.display()
        ))
    })?;

    decode_product_db(&bytes)
}

/// Decode the raw protobuf bytes of product.db into a list of products.
///
/// Battle.net product.db uses a protobuf schema where:
/// - The root message contains repeated product install entries (field 1)
/// - Each product install has:
///   - uid (field 1, string) — the product code
///   - install_path (field 2, string) — where the game is installed
///   - playable (field 5, bool) — whether the game is ready to play
///
/// We parse this manually using protobuf wire format to avoid needing
/// a build step with prost-build. This is a common approach for
/// reverse-engineered schemas.
pub(crate) fn decode_product_db(bytes: &[u8]) -> Result<Vec<BnetProduct>, SourceError> {
    let mut products = Vec::new();
    let mut pos = 0;

    while pos < bytes.len() {
        let (field_number, wire_type, new_pos) = read_tag(bytes, pos)?;
        pos = new_pos;

        match wire_type {
            // Length-delimited (wire type 2)
            2 => {
                let (data, new_pos) = read_length_delimited(bytes, pos)?;
                pos = new_pos;

                // Field 1 of root = product install entries
                if field_number == 1 {
                    if let Ok(product) = parse_product_install(data) {
                        if !product.product_code.is_empty()
                            && !product.install_path.as_os_str().is_empty()
                        {
                            products.push(product);
                        }
                    }
                }
            }
            // Varint (wire type 0)
            0 => {
                let (_value, new_pos) = read_varint(bytes, pos)?;
                pos = new_pos;
            }
            // 64-bit (wire type 1)
            1 => {
                if pos + 8 > bytes.len() {
                    return Err(SourceError::Parse("unexpected end of protobuf data".into()));
                }
                pos += 8;
            }
            // 32-bit (wire type 5)
            5 => {
                if pos + 4 > bytes.len() {
                    return Err(SourceError::Parse("unexpected end of protobuf data".into()));
                }
                pos += 4;
            }
            _ => {
                return Err(SourceError::Parse(format!(
                    "unknown protobuf wire type {wire_type}"
                )));
            }
        }
    }

    Ok(products)
}

fn parse_product_install(data: &[u8]) -> Result<BnetProduct, SourceError> {
    let mut product_code = String::new();
    let mut install_path = String::new();
    let mut pos = 0;

    while pos < data.len() {
        let (field_number, wire_type, new_pos) = read_tag(data, pos)?;
        pos = new_pos;

        match wire_type {
            2 => {
                let (field_data, new_pos) = read_length_delimited(data, pos)?;
                pos = new_pos;

                match field_number {
                    1 => {
                        // uid / product code
                        product_code = String::from_utf8_lossy(field_data).to_string();
                    }
                    2 => {
                        // install_path — may be nested, try as string first
                        let s = String::from_utf8_lossy(field_data).to_string();
                        if !s.is_empty()
                            && s.chars().all(|c| !c.is_control() || c == '\\' || c == '/')
                        {
                            install_path = s;
                        }
                    }
                    _ => {}
                }
            }
            0 => {
                let (_value, new_pos) = read_varint(data, pos)?;
                pos = new_pos;
            }
            1 => {
                if pos + 8 > data.len() {
                    break;
                }
                pos += 8;
            }
            5 => {
                if pos + 4 > data.len() {
                    break;
                }
                pos += 4;
            }
            _ => break,
        }
    }

    Ok(BnetProduct {
        product_code,
        install_path: PathBuf::from(install_path),
    })
}

fn read_varint(data: &[u8], start: usize) -> Result<(u64, usize), SourceError> {
    let mut result: u64 = 0;
    let mut shift = 0;
    let mut pos = start;

    loop {
        if pos >= data.len() {
            return Err(SourceError::Parse("varint extends past end of data".into()));
        }
        let byte = data[pos];
        pos += 1;

        result |= ((byte & 0x7F) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok((result, pos));
        }
        shift += 7;
        if shift >= 64 {
            return Err(SourceError::Parse("varint too long".into()));
        }
    }
}

fn read_tag(data: &[u8], pos: usize) -> Result<(u32, u32, usize), SourceError> {
    let (value, new_pos) = read_varint(data, pos)?;
    let field_number = (value >> 3) as u32;
    let wire_type = (value & 0x07) as u32;
    Ok((field_number, wire_type, new_pos))
}

fn read_length_delimited(data: &[u8], pos: usize) -> Result<(&[u8], usize), SourceError> {
    let (length, new_pos) = read_varint(data, pos)?;
    let length = length as usize;
    let end = new_pos + length;
    if end > data.len() {
        return Err(SourceError::Parse(
            "length-delimited field extends past end of data".into(),
        ));
    }
    Ok((&data[new_pos..end], end))
}

// ---------------------------------------------------------------------------
// Task 4: Product code → display name mapping
// ---------------------------------------------------------------------------

fn product_code_display_names() -> HashMap<&'static str, &'static str> {
    let mut map = HashMap::new();
    map.insert("wow", "World of Warcraft");
    map.insert("d3", "Diablo III");
    map.insert("fen", "Diablo IV");
    map.insert("anbs", "Diablo Immortal");
    map.insert("pro", "Overwatch 2");
    map.insert("s2", "StarCraft II");
    map.insert("s1", "StarCraft Remastered");
    map.insert("hero", "Heroes of the Storm");
    map.insert("wtcg", "Hearthstone");
    map.insert("vipr", "Call of Duty");
    map.insert("odin", "Call of Duty: Modern Warfare");
    map.insert("lazr", "Call of Duty: MW2");
    map.insert("fore", "Call of Duty: MW3");
    map.insert("wlby", "Crash Bandicoot 4");
    map.insert("rtro", "Blizzard Arcade Collection");
    map
}

/// Resolve a display name for a Battle.net product code.
///
/// Uses the known product code mapping first, then falls back to the
/// install folder name.
fn resolve_product_name(product_code: &str, install_path: &Path) -> String {
    let names = product_code_display_names();
    if let Some(name) = names.get(product_code) {
        return name.to_string();
    }

    install_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| product_code.to_string())
}

// ---------------------------------------------------------------------------
// Task 5: Fallback — scan registry uninstall entries for Blizzard
// ---------------------------------------------------------------------------

/// Fallback detection: scan uninstall registry for "Blizzard Entertainment" publisher.
///
/// Used when product.db is missing or unparseable.
#[cfg(target_os = "windows")]
fn fallback_blizzard_uninstall_scan() -> Result<Vec<DetectedGame>, SourceError> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall_key = hklm
        .open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
        .map_err(|e| SourceError::Unavailable(format!("Uninstall registry not found: {e}")))?;

    let mut games = Vec::new();

    for subkey_name in uninstall_key.enum_keys().flatten() {
        if let Ok(subkey) = uninstall_key.open_subkey(&subkey_name) {
            let publisher: String = match subkey.get_value("Publisher") {
                Ok(v) => v,
                Err(_) => continue,
            };

            if !publisher.contains("Blizzard Entertainment") {
                continue;
            }

            let display_name: String = match subkey.get_value("DisplayName") {
                Ok(v) => v,
                Err(_) => continue,
            };

            let install_location: String = match subkey.get_value("InstallLocation") {
                Ok(v) => v,
                Err(_) => continue,
            };

            if install_location.is_empty() {
                continue;
            }

            let install_path = PathBuf::from(&install_location);
            if !install_path.is_dir() {
                continue;
            }

            games.push(DetectedGame {
                name: display_name,
                source: GameSourceType::Battlenet,
                source_id: None,
                source_hint: Some("uninstall-registry-fallback".into()),
                folder_path: Some(install_path),
                exe_path: None,
                exe_name: None,
                launch_url: None,
                potential_exe_names: None,
            });
        }
    }

    Ok(games)
}

#[cfg(not(target_os = "windows"))]
fn fallback_blizzard_uninstall_scan() -> Result<Vec<DetectedGame>, SourceError> {
    Ok(Vec::new())
}

// ---------------------------------------------------------------------------
// Task 6 (Battle.net part): Assemble DetectedGame
// ---------------------------------------------------------------------------

impl BattleNetScanner {
    pub fn scan(&self) -> Result<Vec<DetectedGame>, SourceError> {
        let data_path = match &self.resolved_data {
            Some(p) => p.clone(),
            None => {
                return fallback_blizzard_uninstall_scan();
            }
        };

        let products = match parse_product_db(&data_path) {
            Ok(p) => p,
            Err(e) => {
                log::warn!("product.db parsing failed, using fallback: {e}");
                return fallback_blizzard_uninstall_scan();
            }
        };

        let mut games = Vec::new();

        for product in &products {
            if !product.install_path.is_dir() {
                log::debug!(
                    "skipping Battle.net product {}: install path does not exist: {}",
                    product.product_code,
                    product.install_path.display()
                );
                continue;
            }

            let name =
                resolve_product_name(&product.product_code, &product.install_path);

            games.push(DetectedGame {
                name,
                source: GameSourceType::Battlenet,
                source_id: Some(product.product_code.clone()),
                source_hint: None,
                folder_path: Some(product.install_path.clone()),
                exe_path: None,
                exe_name: None,
                launch_url: Some(format!("battlenet://{}", product.product_code)),
                potential_exe_names: None,
            });
        }

        Ok(games)
    }
}

// ---------------------------------------------------------------------------
// Task 7 (Battle.net part): Availability check + GameSource trait
// ---------------------------------------------------------------------------

impl GameSource for BattleNetScanner {
    fn id(&self) -> &str {
        "battlenet"
    }

    fn display_name(&self) -> &str {
        "Battle.net"
    }

    fn is_available(&self) -> bool {
        match &self.resolved_data {
            Some(p) => p.join("Agent").join("product.db").is_file(),
            None => false,
        }
    }

    fn detect_games(&self) -> Result<Vec<DetectedGame>, SourceError> {
        self.scan()
    }

    fn default_paths(&self) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\Program Files (x86)\Battle.net")]
    }

    fn set_path_override(&mut self, path: Option<PathBuf>) {
        self.path_override = path;
        self.resolve();
    }

    fn resolved_path(&self) -> Option<PathBuf> {
        self.resolved.clone()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // -- Protobuf encoding helpers for tests --

    fn encode_varint(value: u64) -> Vec<u8> {
        let mut buf = Vec::new();
        let mut v = value;
        loop {
            let mut byte = (v & 0x7F) as u8;
            v >>= 7;
            if v != 0 {
                byte |= 0x80;
            }
            buf.push(byte);
            if v == 0 {
                break;
            }
        }
        buf
    }

    fn encode_tag(field_number: u32, wire_type: u32) -> Vec<u8> {
        encode_varint(((field_number as u64) << 3) | (wire_type as u64))
    }

    fn encode_string_field(field_number: u32, value: &str) -> Vec<u8> {
        let mut buf = encode_tag(field_number, 2);
        buf.extend(encode_varint(value.len() as u64));
        buf.extend(value.as_bytes());
        buf
    }

    fn encode_product_install(product_code: &str, install_path: &str) -> Vec<u8> {
        let mut inner = Vec::new();
        inner.extend(encode_string_field(1, product_code));
        inner.extend(encode_string_field(2, install_path));

        let mut buf = encode_tag(1, 2);
        buf.extend(encode_varint(inner.len() as u64));
        buf.extend(inner);
        buf
    }

    fn create_product_db(tmp: &TempDir, products: &[(&str, &str)]) -> PathBuf {
        let data_dir = tmp.path().join("BattleNet");
        let agent_dir = data_dir.join("Agent");
        fs::create_dir_all(&agent_dir).unwrap();

        let mut bytes = Vec::new();
        for (code, path) in products {
            bytes.extend(encode_product_install(code, path));
        }

        fs::write(agent_dir.join("product.db"), &bytes).unwrap();
        data_dir
    }

    // -- Protobuf primitives --

    #[test]
    fn varint_encoding_round_trip() {
        for value in [0u64, 1, 127, 128, 300, 16384, u64::MAX] {
            let encoded = encode_varint(value);
            let (decoded, _) = read_varint(&encoded, 0).unwrap();
            assert_eq!(decoded, value);
        }
    }

    #[test]
    fn tag_encoding_round_trip() {
        let encoded = encode_tag(1, 2);
        let (field, wire, _) = read_tag(&encoded, 0).unwrap();
        assert_eq!(field, 1);
        assert_eq!(wire, 2);
    }

    #[test]
    fn read_varint_error_on_empty() {
        let result = read_varint(&[], 0);
        assert!(result.is_err());
    }

    // -- product.db decoding --

    #[test]
    fn decode_single_product() {
        let bytes = encode_product_install("wow", r"C:\Games\World of Warcraft");
        let products = decode_product_db(&bytes).unwrap();
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].product_code, "wow");
        assert_eq!(
            products[0].install_path,
            PathBuf::from(r"C:\Games\World of Warcraft")
        );
    }

    #[test]
    fn decode_multiple_products() {
        let mut bytes = Vec::new();
        bytes.extend(encode_product_install("wow", r"C:\Games\WoW"));
        bytes.extend(encode_product_install("d3", r"C:\Games\Diablo III"));
        bytes.extend(encode_product_install("pro", r"C:\Games\Overwatch"));

        let products = decode_product_db(&bytes).unwrap();
        assert_eq!(products.len(), 3);

        let codes: Vec<&str> = products.iter().map(|p| p.product_code.as_str()).collect();
        assert!(codes.contains(&"wow"));
        assert!(codes.contains(&"d3"));
        assert!(codes.contains(&"pro"));
    }

    #[test]
    fn decode_empty_product_db() {
        let products = decode_product_db(&[]).unwrap();
        assert!(products.is_empty());
    }

    #[test]
    fn decode_skips_products_with_empty_code() {
        let bytes = encode_product_install("", r"C:\Games\Something");
        let products = decode_product_db(&bytes).unwrap();
        assert!(products.is_empty());
    }

    #[test]
    fn decode_skips_products_with_empty_path() {
        let bytes = encode_product_install("wow", "");
        let products = decode_product_db(&bytes).unwrap();
        assert!(products.is_empty());
    }

    // -- parse_product_db from file --

    #[test]
    fn parse_product_db_from_file() {
        let tmp = TempDir::new().unwrap();
        let install_dir = tmp.path().join("WoW");
        fs::create_dir_all(&install_dir).unwrap();

        let data_dir = create_product_db(
            &tmp,
            &[("wow", &install_dir.to_string_lossy())],
        );

        let products = parse_product_db(&data_dir).unwrap();
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].product_code, "wow");
    }

    #[test]
    fn parse_product_db_error_when_missing() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().join("BattleNet");
        fs::create_dir_all(data_dir.join("Agent")).unwrap();

        let result = parse_product_db(&data_dir);
        assert!(result.is_err());
    }

    // -- Product code → display name --

    #[test]
    fn known_product_codes_resolve_to_names() {
        let names = product_code_display_names();
        assert_eq!(names.get("wow"), Some(&"World of Warcraft"));
        assert_eq!(names.get("d3"), Some(&"Diablo III"));
        assert_eq!(names.get("fen"), Some(&"Diablo IV"));
        assert_eq!(names.get("pro"), Some(&"Overwatch 2"));
        assert_eq!(names.get("s2"), Some(&"StarCraft II"));
        assert_eq!(names.get("hero"), Some(&"Heroes of the Storm"));
        assert_eq!(names.get("wtcg"), Some(&"Hearthstone"));
        assert_eq!(names.get("vipr"), Some(&"Call of Duty"));
    }

    #[test]
    fn resolve_product_name_uses_known_mapping() {
        let path = PathBuf::from(r"C:\Games\World of Warcraft");
        assert_eq!(resolve_product_name("wow", &path), "World of Warcraft");
    }

    #[test]
    fn resolve_product_name_falls_back_to_folder_name() {
        let path = PathBuf::from(r"C:\Games\SomeNewGame");
        assert_eq!(resolve_product_name("unknown_code", &path), "SomeNewGame");
    }

    #[test]
    fn resolve_product_name_falls_back_to_code_when_no_folder() {
        let path = PathBuf::from(r"C:\");
        assert_eq!(resolve_product_name("xyz", &path), "xyz");
    }

    // -- Scan pipeline --

    #[test]
    fn scan_returns_detected_games_from_product_db() {
        let tmp = TempDir::new().unwrap();

        let wow_dir = tmp.path().join("Games").join("WoW");
        let d3_dir = tmp.path().join("Games").join("Diablo III");
        fs::create_dir_all(&wow_dir).unwrap();
        fs::create_dir_all(&d3_dir).unwrap();

        let data_dir = create_product_db(
            &tmp,
            &[
                ("wow", &wow_dir.to_string_lossy()),
                ("d3", &d3_dir.to_string_lossy()),
            ],
        );

        let mut scanner = BattleNetScanner::new();
        scanner.resolved_data = Some(data_dir);

        let games = scanner.scan().unwrap();
        assert_eq!(games.len(), 2);

        let wow = games.iter().find(|g| g.name == "World of Warcraft").unwrap();
        assert_eq!(wow.source, GameSourceType::Battlenet);
        assert_eq!(wow.source_id, Some("wow".to_string()));
        assert_eq!(wow.launch_url, Some("battlenet://wow".to_string()));
        assert_eq!(wow.folder_path, Some(wow_dir));

        let d3 = games.iter().find(|g| g.name == "Diablo III").unwrap();
        assert_eq!(d3.source_id, Some("d3".to_string()));
        assert_eq!(d3.launch_url, Some("battlenet://d3".to_string()));
    }

    #[test]
    fn scan_skips_products_with_missing_install_dir() {
        let tmp = TempDir::new().unwrap();

        let data_dir = create_product_db(
            &tmp,
            &[("wow", r"C:\nonexistent_xyz_12345")],
        );

        let mut scanner = BattleNetScanner::new();
        scanner.resolved_data = Some(data_dir);

        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    #[test]
    fn scan_falls_back_when_no_data_path() {
        let scanner = BattleNetScanner::new();
        let games = scanner.scan().unwrap();
        assert!(games.is_empty());
    }

    // -- Availability check --

    #[test]
    fn is_available_true_when_product_db_exists() {
        let tmp = TempDir::new().unwrap();
        let data_dir = create_product_db(&tmp, &[]);

        let mut scanner = BattleNetScanner::new();
        scanner.resolved_data = Some(data_dir);

        assert!(scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_product_db() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().join("BattleNet");
        fs::create_dir_all(data_dir.join("Agent")).unwrap();

        let mut scanner = BattleNetScanner::new();
        scanner.resolved_data = Some(data_dir);

        assert!(!scanner.is_available());
    }

    #[test]
    fn is_available_false_when_no_resolved_data() {
        let scanner = BattleNetScanner::new();
        assert!(!scanner.is_available());
    }

    // -- GameSource trait --

    #[test]
    fn trait_id_and_display_name() {
        let scanner = BattleNetScanner::new();
        assert_eq!(scanner.id(), "battlenet");
        assert_eq!(scanner.display_name(), "Battle.net");
    }

    #[test]
    fn scanner_default_paths() {
        let scanner = BattleNetScanner::new();
        let defaults = scanner.default_paths();
        assert_eq!(defaults.len(), 1);
        assert!(defaults[0].to_string_lossy().contains("Battle.net"));
    }

    #[test]
    fn scanner_no_path_resolved_when_nothing_exists() {
        let scanner = BattleNetScanner::new();
        assert!(scanner.resolved_path().is_none());
    }

    #[test]
    fn scanner_uses_override_path() {
        let tmp = TempDir::new().unwrap();
        let bnet_dir = tmp.path().join("BattleNet");
        fs::create_dir_all(&bnet_dir).unwrap();

        let mut scanner = BattleNetScanner::new();
        scanner.set_path_override(Some(bnet_dir.clone()));
        assert_eq!(scanner.resolved_path(), Some(bnet_dir));
    }

    #[test]
    fn data_path_override_round_trip() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().join("BnetData");
        fs::create_dir_all(&data_dir).unwrap();

        let mut scanner = BattleNetScanner::new();
        scanner.set_data_path_override(Some(data_dir.clone()));
        assert_eq!(scanner.resolved_data, Some(data_dir));

        scanner.set_data_path_override(None);
    }

    // -- Serialization --

    #[test]
    fn detected_game_serializes_correctly() {
        let game = DetectedGame {
            name: "World of Warcraft".into(),
            source: GameSourceType::Battlenet,
            source_id: Some("wow".into()),
            source_hint: None,
            folder_path: Some(PathBuf::from(r"C:\Games\WoW")),
            exe_path: None,
            exe_name: None,
            launch_url: Some("battlenet://wow".into()),
            potential_exe_names: None,
        };
        let json = serde_json::to_string(&game).unwrap();
        assert!(json.contains("\"sourceId\""));
        assert!(json.contains("wow"));
        assert!(json.contains("battlenet://wow"));
    }

    // -- Full pipeline --

    #[test]
    fn full_pipeline_end_to_end() {
        let tmp = TempDir::new().unwrap();

        let wow_dir = tmp.path().join("Games").join("WoW");
        let ow_dir = tmp.path().join("Games").join("Overwatch");
        fs::create_dir_all(&wow_dir).unwrap();
        fs::create_dir_all(&ow_dir).unwrap();

        let data_dir = create_product_db(
            &tmp,
            &[
                ("wow", &wow_dir.to_string_lossy()),
                ("pro", &ow_dir.to_string_lossy()),
                ("missing", r"C:\nonexistent_xyz_12345"),
            ],
        );

        let mut scanner = BattleNetScanner::new();
        scanner.resolved_data = Some(data_dir.clone());

        assert!(scanner.is_available());

        let games = scanner.detect_games().unwrap();
        assert_eq!(games.len(), 2);

        for game in &games {
            assert_eq!(game.source, GameSourceType::Battlenet);
            assert!(game.source_id.is_some());
            assert!(game.launch_url.is_some());
            assert!(game.folder_path.is_some());

            let launch_url = game.launch_url.as_ref().unwrap();
            let code = game.source_id.as_ref().unwrap();
            assert_eq!(launch_url, &format!("battlenet://{code}"));
        }

        let wow = games.iter().find(|g| g.name == "World of Warcraft").unwrap();
        assert_eq!(wow.source_id, Some("wow".to_string()));

        let ow = games.iter().find(|g| g.name == "Overwatch 2").unwrap();
        assert_eq!(ow.source_id, Some("pro".to_string()));
    }

    // -- Non-Windows stubs --

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn detect_from_registry_none_on_non_windows() {
        assert!(detect_battlenet_from_registry().is_none());
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn fallback_returns_empty_on_non_windows() {
        let games = fallback_blizzard_uninstall_scan().unwrap();
        assert!(games.is_empty());
    }
}
