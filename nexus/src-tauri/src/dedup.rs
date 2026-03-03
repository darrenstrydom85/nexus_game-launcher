use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

// ── Name Normalization ──────────────────────────────────────────────

const STRIP_SUFFIXES: &[&str] = &[
    "game of the year edition",
    "goty edition",
    "goty",
    "definitive edition",
    "complete edition",
    "ultimate edition",
    "deluxe edition",
    "gold edition",
    "premium edition",
    "legendary edition",
    "enhanced edition",
    "special edition",
    "collectors edition",
    "collector s edition",
    "directors cut",
    "director s cut",
    "remastered",
    "remaster",
    "remake",
    "hd",
    "4k",
    "edition",
];

pub fn normalize_name(name: &str) -> String {
    let mut s = name.to_lowercase();

    s = s
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' { c } else { ' ' })
        .collect();

    // Collapse whitespace before suffix matching so "director s cut" matches "directors cut"
    let tokens: Vec<&str> = s.split_whitespace().collect();
    s = tokens.join(" ");

    for suffix in STRIP_SUFFIXES {
        if let Some(pos) = s.find(suffix) {
            let before = &s[..pos];
            let after = &s[pos + suffix.len()..];
            s = format!("{} {}", before.trim(), after.trim());
        }
    }

    let tokens: Vec<&str> = s.split_whitespace().collect();
    tokens.join(" ")
}

// ── Levenshtein Distance ────────────────────────────────────────────

pub fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut prev: Vec<usize> = (0..=n).collect();
    let mut curr = vec![0usize; n + 1];

    for i in 1..=m {
        curr[0] = i;
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] {
                0
            } else {
                1
            };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }

    prev[n]
}

// ── Jaccard Similarity ──────────────────────────────────────────────

fn bigrams(s: &str) -> std::collections::HashSet<(char, char)> {
    let chars: Vec<char> = s.chars().collect();
    let mut set = std::collections::HashSet::new();
    if chars.len() < 2 {
        return set;
    }
    for w in chars.windows(2) {
        set.insert((w[0], w[1]));
    }
    set
}

pub fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let set_a = bigrams(a);
    let set_b = bigrams(b);

    if set_a.is_empty() && set_b.is_empty() {
        return 1.0;
    }

    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();

    if union == 0 {
        return 0.0;
    }

    intersection as f64 / union as f64
}

// ── Match Criteria ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MatchMethod {
    IgdbId,
    ExactName,
    FuzzyName,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCandidate {
    pub game_a_id: String,
    pub game_a_name: String,
    pub game_a_source: String,
    pub game_b_id: String,
    pub game_b_name: String,
    pub game_b_source: String,
    pub match_method: MatchMethod,
    pub confidence: f64,
}

pub fn is_fuzzy_match(name_a: &str, name_b: &str) -> Option<(MatchMethod, f64)> {
    let norm_a = normalize_name(name_a);
    let norm_b = normalize_name(name_b);

    if norm_a == norm_b && !norm_a.is_empty() {
        return Some((MatchMethod::ExactName, 1.0));
    }

    let lev = levenshtein(&norm_a, &norm_b);
    if lev > 0 && lev < 3 {
        let max_len = norm_a.len().max(norm_b.len()) as f64;
        let confidence = 1.0 - (lev as f64 / max_len);
        return Some((MatchMethod::FuzzyName, confidence));
    }

    let jac = jaccard_similarity(&norm_a, &norm_b);
    if jac > 0.8 {
        return Some((MatchMethod::FuzzyName, jac));
    }

    None
}

// ── Deduplication Engine ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DuplicateResolution {
    Unresolved,
    PreferSource,
    KeepBoth,
    HideOne,
}

impl DuplicateResolution {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unresolved => "unresolved",
            Self::PreferSource => "prefer_source",
            Self::KeepBoth => "keep_both",
            Self::HideOne => "hide_one",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "unresolved" => Ok(Self::Unresolved),
            "prefer_source" => Ok(Self::PreferSource),
            "keep_both" => Ok(Self::KeepBoth),
            "hide_one" => Ok(Self::HideOne),
            other => Err(format!("unknown resolution: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub primary_game_id: String,
    pub resolution: String,
    pub members: Vec<DuplicateMember>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateMember {
    pub game_id: String,
    pub game_name: String,
    pub source: String,
    pub is_preferred: bool,
    pub is_hidden: bool,
    pub cover_url: Option<String>,
}

struct GameRow {
    id: String,
    name: String,
    source: String,
    igdb_id: Option<i64>,
}

pub fn find_duplicates(conn: &Connection) -> Result<Vec<DuplicateCandidate>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, source, igdb_id FROM games WHERE is_hidden = 0")
        .map_err(|e| e.to_string())?;

    let games: Vec<GameRow> = stmt
        .query_map([], |row| {
            Ok(GameRow {
                id: row.get("id")?,
                name: row.get("name")?,
                source: row.get("source")?,
                igdb_id: row.get("igdb_id")?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let existing_members: std::collections::HashSet<String> = conn
        .prepare("SELECT game_id FROM game_duplicate_members")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut candidates = Vec::new();
    let mut seen_pairs = std::collections::HashSet::new();

    for i in 0..games.len() {
        for j in (i + 1)..games.len() {
            let a = &games[i];
            let b = &games[j];

            if a.source == b.source {
                continue;
            }

            if existing_members.contains(&a.id) && existing_members.contains(&b.id) {
                continue;
            }

            let pair_key = if a.id < b.id {
                format!("{}:{}", a.id, b.id)
            } else {
                format!("{}:{}", b.id, a.id)
            };
            if seen_pairs.contains(&pair_key) {
                continue;
            }

            if let Some((method, confidence)) = check_match(a, b) {
                seen_pairs.insert(pair_key);
                candidates.push(DuplicateCandidate {
                    game_a_id: a.id.clone(),
                    game_a_name: a.name.clone(),
                    game_a_source: a.source.clone(),
                    game_b_id: b.id.clone(),
                    game_b_name: b.name.clone(),
                    game_b_source: b.source.clone(),
                    match_method: method,
                    confidence,
                });
            }
        }
    }

    candidates.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    Ok(candidates)
}

fn check_match(a: &GameRow, b: &GameRow) -> Option<(MatchMethod, f64)> {
    if let (Some(igdb_a), Some(igdb_b)) = (a.igdb_id, b.igdb_id) {
        if igdb_a == igdb_b && igdb_a > 0 {
            return Some((MatchMethod::IgdbId, 1.0));
        }
    }

    is_fuzzy_match(&a.name, &b.name)
}

pub fn create_duplicate_group(
    conn: &Connection,
    game_ids: &[String],
    preferred_game_id: &str,
    resolution: &DuplicateResolution,
    now: &str,
) -> Result<DuplicateGroup, String> {
    let group_id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO game_duplicates (id, primary_game_id, resolution, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![group_id, preferred_game_id, resolution.as_str(), now, now],
    )
    .map_err(|e| e.to_string())?;

    for gid in game_ids {
        let is_preferred = if gid == preferred_game_id { 1 } else { 0 };
        let is_hidden = if resolution == &DuplicateResolution::HideOne && gid != preferred_game_id {
            1
        } else {
            0
        };

        conn.execute(
            "INSERT INTO game_duplicate_members (duplicate_id, game_id, is_preferred, is_hidden)
             VALUES (?1, ?2, ?3, ?4)",
            params![group_id, gid, is_preferred, is_hidden],
        )
        .map_err(|e| e.to_string())?;

        if is_hidden == 1 {
            conn.execute(
                "UPDATE games SET is_hidden = 1, updated_at = ?1 WHERE id = ?2",
                params![now, gid],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    get_duplicate_group(conn, &group_id)
}

pub fn get_duplicate_group(conn: &Connection, group_id: &str) -> Result<DuplicateGroup, String> {
    let (primary_game_id, resolution, created_at, updated_at) = conn
        .query_row(
            "SELECT primary_game_id, resolution, created_at, updated_at FROM game_duplicates WHERE id = ?1",
            params![group_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;

    let members = get_group_members(conn, group_id)?;

    Ok(DuplicateGroup {
        id: group_id.to_string(),
        primary_game_id,
        resolution,
        members,
        created_at,
        updated_at,
    })
}

fn get_group_members(conn: &Connection, group_id: &str) -> Result<Vec<DuplicateMember>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m.game_id, g.name, g.source, m.is_preferred, m.is_hidden, g.cover_url
             FROM game_duplicate_members m
             JOIN games g ON g.id = m.game_id
             WHERE m.duplicate_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let members = stmt
        .query_map(params![group_id], |row| {
            let is_pref: i32 = row.get(3)?;
            let is_hid: i32 = row.get(4)?;
            Ok(DuplicateMember {
                game_id: row.get(0)?,
                game_name: row.get(1)?,
                source: row.get(2)?,
                is_preferred: is_pref != 0,
                is_hidden: is_hid != 0,
                cover_url: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

pub fn get_all_duplicate_groups(conn: &Connection) -> Result<Vec<DuplicateGroup>, String> {
    let mut stmt = conn
        .prepare("SELECT id FROM game_duplicates ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut groups = Vec::with_capacity(ids.len());
    for id in &ids {
        groups.push(get_duplicate_group(conn, id)?);
    }
    Ok(groups)
}

pub fn get_game_sources(conn: &Connection, game_id: &str) -> Result<Vec<DuplicateMember>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT m2.game_id, g.name, g.source, m2.is_preferred, m2.is_hidden, g.cover_url
             FROM game_duplicate_members m1
             JOIN game_duplicate_members m2 ON m1.duplicate_id = m2.duplicate_id
             JOIN games g ON g.id = m2.game_id
             WHERE m1.game_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let members = stmt
        .query_map(params![game_id], |row| {
            let is_pref: i32 = row.get(3)?;
            let is_hid: i32 = row.get(4)?;
            Ok(DuplicateMember {
                game_id: row.get(0)?,
                game_name: row.get(1)?,
                source: row.get(2)?,
                is_preferred: is_pref != 0,
                is_hidden: is_hid != 0,
                cover_url: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(members)
}

pub fn resolve_duplicate(
    conn: &Connection,
    group_id: &str,
    preferred_game_id: &str,
    resolution: &DuplicateResolution,
    now: &str,
) -> Result<DuplicateGroup, String> {
    conn.execute(
        "UPDATE game_duplicates SET primary_game_id = ?1, resolution = ?2, updated_at = ?3 WHERE id = ?4",
        params![preferred_game_id, resolution.as_str(), now, group_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE game_duplicate_members SET is_preferred = 0, is_hidden = 0 WHERE duplicate_id = ?1",
        params![group_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE game_duplicate_members SET is_preferred = 1 WHERE duplicate_id = ?1 AND game_id = ?2",
        params![group_id, preferred_game_id],
    )
    .map_err(|e| e.to_string())?;

    let member_ids: Vec<String> = conn
        .prepare("SELECT game_id FROM game_duplicate_members WHERE duplicate_id = ?1")
        .map_err(|e| e.to_string())?
        .query_map(params![group_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    match resolution {
        DuplicateResolution::HideOne => {
            for gid in &member_ids {
                if gid != preferred_game_id {
                    conn.execute(
                        "UPDATE game_duplicate_members SET is_hidden = 1 WHERE duplicate_id = ?1 AND game_id = ?2",
                        params![group_id, gid],
                    )
                    .map_err(|e| e.to_string())?;
                    conn.execute(
                        "UPDATE games SET is_hidden = 1, updated_at = ?1 WHERE id = ?2",
                        params![now, gid],
                    )
                    .map_err(|e| e.to_string())?;
                } else {
                    conn.execute(
                        "UPDATE games SET is_hidden = 0, updated_at = ?1 WHERE id = ?2",
                        params![now, gid],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        DuplicateResolution::KeepBoth | DuplicateResolution::PreferSource => {
            for gid in &member_ids {
                conn.execute(
                    "UPDATE games SET is_hidden = 0, updated_at = ?1 WHERE id = ?2",
                    params![now, gid],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        DuplicateResolution::Unresolved => {}
    }

    get_duplicate_group(conn, group_id)
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normalization ──

    #[test]
    fn normalize_lowercase() {
        assert_eq!(normalize_name("The Witcher 3"), "the witcher 3");
    }

    #[test]
    fn normalize_strips_punctuation() {
        assert_eq!(normalize_name("Assassin's Creed: Odyssey"), "assassin s creed odyssey");
    }

    #[test]
    fn normalize_strips_goty_suffix() {
        assert_eq!(normalize_name("Fallout 4 GOTY Edition"), "fallout 4");
    }

    #[test]
    fn normalize_strips_remastered() {
        assert_eq!(normalize_name("Dark Souls Remastered"), "dark souls");
    }

    #[test]
    fn normalize_strips_definitive_edition() {
        assert_eq!(
            normalize_name("Divinity Original Sin 2 Definitive Edition"),
            "divinity original sin 2"
        );
    }

    #[test]
    fn normalize_strips_special_edition() {
        assert_eq!(
            normalize_name("Skyrim Special Edition"),
            "skyrim"
        );
    }

    #[test]
    fn normalize_strips_directors_cut() {
        assert_eq!(normalize_name("Death Stranding Director's Cut"), "death stranding");
    }

    #[test]
    fn normalize_collapses_whitespace() {
        assert_eq!(normalize_name("  Half   Life   2  "), "half life 2");
    }

    #[test]
    fn normalize_empty_string() {
        assert_eq!(normalize_name(""), "");
    }

    // ── Levenshtein ──

    #[test]
    fn levenshtein_identical() {
        assert_eq!(levenshtein("hello", "hello"), 0);
    }

    #[test]
    fn levenshtein_one_insert() {
        assert_eq!(levenshtein("hell", "hello"), 1);
    }

    #[test]
    fn levenshtein_one_delete() {
        assert_eq!(levenshtein("hello", "hell"), 1);
    }

    #[test]
    fn levenshtein_one_substitute() {
        assert_eq!(levenshtein("hello", "hallo"), 1);
    }

    #[test]
    fn levenshtein_empty_strings() {
        assert_eq!(levenshtein("", ""), 0);
        assert_eq!(levenshtein("abc", ""), 3);
        assert_eq!(levenshtein("", "xyz"), 3);
    }

    #[test]
    fn levenshtein_completely_different() {
        assert_eq!(levenshtein("abc", "xyz"), 3);
    }

    #[test]
    fn levenshtein_game_names_close() {
        let a = normalize_name("The Witcher 3");
        let b = normalize_name("The Witcher III");
        let dist = levenshtein(&a, &b);
        assert!(dist <= 3, "distance was {dist}");
    }

    // ── Jaccard ──

    #[test]
    fn jaccard_identical() {
        let sim = jaccard_similarity("hello world", "hello world");
        assert!((sim - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn jaccard_completely_different() {
        let sim = jaccard_similarity("abc", "xyz");
        assert!(sim < 0.1, "similarity was {sim}");
    }

    #[test]
    fn jaccard_empty_strings() {
        let sim = jaccard_similarity("", "");
        assert!((sim - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn jaccard_similar_game_names() {
        let a = normalize_name("Grand Theft Auto V");
        let b = normalize_name("Grand Theft Auto 5");
        let sim = jaccard_similarity(&a, &b);
        assert!(sim > 0.6, "similarity was {sim}");
    }

    // ── Fuzzy Match ──

    #[test]
    fn fuzzy_match_exact_after_normalization() {
        let result = is_fuzzy_match("Skyrim Special Edition", "Skyrim");
        assert!(result.is_some());
        let (method, _) = result.unwrap();
        assert_eq!(method, MatchMethod::ExactName);
    }

    #[test]
    fn fuzzy_match_levenshtein_close() {
        let result = is_fuzzy_match("Halo Infinit", "Halo Infinite");
        assert!(result.is_some());
    }

    #[test]
    fn fuzzy_match_rejects_different_games() {
        let result = is_fuzzy_match("Doom Eternal", "Minecraft");
        assert!(result.is_none());
    }

    #[test]
    fn fuzzy_match_same_game_different_editions() {
        let result = is_fuzzy_match(
            "The Witcher 3 Game of the Year Edition",
            "The Witcher 3",
        );
        assert!(result.is_some());
    }

    // ── Database Integration ──

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::db::migrations::run_pending(&conn).unwrap();
        conn
    }

    fn insert_game(conn: &Connection, id: &str, name: &str, source: &str, igdb_id: Option<i64>) {
        conn.execute(
            "INSERT INTO games (id, name, source, igdb_id, status, added_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'backlog', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            params![id, name, source, igdb_id],
        )
        .unwrap();
    }

    #[test]
    fn find_duplicates_by_igdb_id() {
        let conn = setup_db();
        insert_game(&conn, "g1", "The Witcher 3", "steam", Some(1234));
        insert_game(&conn, "g2", "The Witcher 3 GOTY", "gog", Some(1234));
        insert_game(&conn, "g3", "Doom Eternal", "epic", Some(9999));

        let dupes = find_duplicates(&conn).unwrap();
        assert_eq!(dupes.len(), 1);
        assert_eq!(dupes[0].match_method, MatchMethod::IgdbId);
    }

    #[test]
    fn find_duplicates_by_name() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        let dupes = find_duplicates(&conn).unwrap();
        assert_eq!(dupes.len(), 1);
        assert_eq!(dupes[0].match_method, MatchMethod::ExactName);
    }

    #[test]
    fn find_duplicates_skips_same_source() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "steam", None);

        let dupes = find_duplicates(&conn).unwrap();
        assert!(dupes.is_empty());
    }

    #[test]
    fn find_duplicates_no_false_positives() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Doom Eternal", "steam", None);
        insert_game(&conn, "g2", "Minecraft", "xbox", None);

        let dupes = find_duplicates(&conn).unwrap();
        assert!(dupes.is_empty());
    }

    #[test]
    fn create_and_get_duplicate_group() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        let group = create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::PreferSource,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        assert_eq!(group.members.len(), 2);
        assert_eq!(group.resolution, "prefer_source");

        let preferred = group.members.iter().find(|m| m.is_preferred).unwrap();
        assert_eq!(preferred.game_id, "g1");
    }

    #[test]
    fn resolve_duplicate_hide_one() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        let group = create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::Unresolved,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        let resolved = resolve_duplicate(
            &conn,
            &group.id,
            "g1",
            &DuplicateResolution::HideOne,
            "2026-03-01T01:00:00Z",
        )
        .unwrap();

        assert_eq!(resolved.resolution, "hide_one");

        let hidden: i32 = conn
            .query_row("SELECT is_hidden FROM games WHERE id = 'g2'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hidden, 1);

        let visible: i32 = conn
            .query_row("SELECT is_hidden FROM games WHERE id = 'g1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(visible, 0);
    }

    #[test]
    fn get_game_sources_returns_all_members() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::PreferSource,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        let sources = get_game_sources(&conn, "g1").unwrap();
        assert_eq!(sources.len(), 2);

        let sources_for_g2 = get_game_sources(&conn, "g2").unwrap();
        assert_eq!(sources_for_g2.len(), 2);
    }

    #[test]
    fn get_all_duplicate_groups_returns_all() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);
        insert_game(&conn, "g3", "Doom Eternal", "steam", None);
        insert_game(&conn, "g4", "Doom Eternal", "epic", None);

        create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::Unresolved,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        create_duplicate_group(
            &conn,
            &["g3".into(), "g4".into()],
            "g3",
            &DuplicateResolution::Unresolved,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        let groups = get_all_duplicate_groups(&conn).unwrap();
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn find_duplicates_skips_already_grouped() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::PreferSource,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        let dupes = find_duplicates(&conn).unwrap();
        assert!(dupes.is_empty());
    }

    #[test]
    fn resolve_duplicate_keep_both_unhides() {
        let conn = setup_db();
        insert_game(&conn, "g1", "Halo Infinite", "steam", None);
        insert_game(&conn, "g2", "Halo Infinite", "xbox", None);

        let group = create_duplicate_group(
            &conn,
            &["g1".into(), "g2".into()],
            "g1",
            &DuplicateResolution::HideOne,
            "2026-03-01T00:00:00Z",
        )
        .unwrap();

        let hidden: i32 = conn
            .query_row("SELECT is_hidden FROM games WHERE id = 'g2'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hidden, 1);

        resolve_duplicate(
            &conn,
            &group.id,
            "g1",
            &DuplicateResolution::KeepBoth,
            "2026-03-01T02:00:00Z",
        )
        .unwrap();

        let unhidden: i32 = conn
            .query_row("SELECT is_hidden FROM games WHERE id = 'g2'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(unhidden, 0);
    }
}
