pub mod collections;
pub mod database;
pub mod dedup;
pub mod error;
pub mod events;
pub mod games;
pub mod health;
pub mod launcher;
pub mod metadata;
pub mod ping;
pub mod playtime;
pub mod scanner;
pub mod sessions;
pub mod settings;
pub mod sources;
pub mod twitch;
pub mod utils;
pub mod version_check;
pub mod wrapped;

#[cfg(test)]
mod tests;
