use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GameSource {
    Steam,
    Epic,
    Gog,
    Ubisoft,
    Battlenet,
    Xbox,
    Standalone,
}

impl GameSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
            Self::Gog => "gog",
            Self::Ubisoft => "ubisoft",
            Self::Battlenet => "battlenet",
            Self::Xbox => "xbox",
            Self::Standalone => "standalone",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "steam" => Ok(Self::Steam),
            "epic" => Ok(Self::Epic),
            "gog" => Ok(Self::Gog),
            "ubisoft" => Ok(Self::Ubisoft),
            "battlenet" => Ok(Self::Battlenet),
            "xbox" => Ok(Self::Xbox),
            "standalone" => Ok(Self::Standalone),
            other => Err(format!("unknown game source: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GameStatus {
    Playing,
    Completed,
    Backlog,
    Dropped,
    Wishlist,
    /// Game was uninstalled / no longer detected by a source; kept for stats, hidden from library until re-installed.
    Removed,
}

impl GameStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Playing => "playing",
            Self::Completed => "completed",
            Self::Backlog => "backlog",
            Self::Dropped => "dropped",
            Self::Wishlist => "wishlist",
            Self::Removed => "removed",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "playing" => Ok(Self::Playing),
            "completed" => Ok(Self::Completed),
            "backlog" => Ok(Self::Backlog),
            "dropped" => Ok(Self::Dropped),
            "wishlist" => Ok(Self::Wishlist),
            "removed" => Ok(Self::Removed),
            other => Err(format!("unknown game status: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub source: String,
    pub source_id: Option<String>,
    pub source_hint: Option<String>,
    pub folder_path: Option<String>,
    pub exe_path: Option<String>,
    pub exe_name: Option<String>,
    pub launch_url: Option<String>,
    pub igdb_id: Option<i64>,
    pub steamgrid_id: Option<i64>,
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub genres: Option<String>,
    pub cover_url: Option<String>,
    pub hero_url: Option<String>,
    pub logo_url: Option<String>,
    pub screenshot_urls: Option<String>,
    pub trailer_url: Option<String>,
    pub custom_cover: Option<String>,
    pub custom_hero: Option<String>,
    pub potential_exe_names: Option<String>,
    pub critic_score: Option<f64>,
    pub critic_score_count: Option<i64>,
    pub community_score: Option<f64>,
    pub community_score_count: Option<i64>,
    pub status: String,
    pub rating: Option<i32>,
    pub total_play_time: i64,
    pub last_played: Option<String>,
    pub play_count: i64,
    pub is_hidden: bool,
    pub added_at: String,
    pub updated_at: String,
    pub source_folder_id: Option<String>,
    pub hltb_main_h: Option<f64>,
    pub hltb_main_extra_h: Option<f64>,
    pub hltb_completionist_h: Option<f64>,
    pub hltb_id: Option<String>,
    pub hltb_fetched_at: Option<String>,
    pub notes: Option<String>,
    pub progress: Option<i32>,
    pub milestones_json: Option<String>,
    pub completed: bool,
}

impl Game {
    pub fn from_row(row: &rusqlite::Row) -> rusqlite::Result<Self> {
        let is_hidden_int: i32 = row.get("is_hidden")?;
        let completed_int: i32 = row.get("completed")?;
        Ok(Game {
            id: row.get("id")?,
            name: row.get("name")?,
            source: row.get("source")?,
            source_id: row.get("source_id")?,
            source_hint: row.get("source_hint")?,
            folder_path: row.get("folder_path")?,
            exe_path: row.get("exe_path")?,
            exe_name: row.get("exe_name")?,
            launch_url: row.get("launch_url")?,
            igdb_id: row.get("igdb_id")?,
            steamgrid_id: row.get("steamgrid_id")?,
            description: row.get("description")?,
            release_date: row.get("release_date")?,
            developer: row.get("developer")?,
            publisher: row.get("publisher")?,
            genres: row.get("genres")?,
            cover_url: row.get("cover_url")?,
            hero_url: row.get("hero_url")?,
            logo_url: row.get("logo_url")?,
            screenshot_urls: row.get("screenshot_urls")?,
            trailer_url: row.get("trailer_url")?,
            custom_cover: row.get("custom_cover")?,
            custom_hero: row.get("custom_hero")?,
            potential_exe_names: row.get("potential_exe_names")?,
            critic_score: row.get("critic_score")?,
            critic_score_count: row.get("critic_score_count")?,
            community_score: row.get("community_score")?,
            community_score_count: row.get("community_score_count")?,
            status: row.get("status")?,
            rating: row.get("rating")?,
            total_play_time: row.get("total_play_time")?,
            last_played: row.get("last_played")?,
            play_count: row.get("play_count")?,
            is_hidden: is_hidden_int != 0,
            added_at: row.get("added_at")?,
            updated_at: row.get("updated_at")?,
            source_folder_id: row.get("source_folder_id")?,
            hltb_main_h: row.get("hltb_main_h")?,
            hltb_main_extra_h: row.get("hltb_main_extra_h")?,
            hltb_completionist_h: row.get("hltb_completionist_h")?,
            hltb_id: row.get("hltb_id")?,
            hltb_fetched_at: row.get("hltb_fetched_at")?,
            notes: row.get("notes")?,
            progress: row.get("progress")?,
            milestones_json: row.get("milestones_json")?,
            completed: completed_int != 0,
        })
    }
}
