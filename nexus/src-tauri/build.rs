/// `.env` keys the app reads via `option_env!()`. Only these are forwarded:
/// everything passed as `rustc-env` is written in plaintext to
/// `target/*/build/*/output`, and `.env` also holds the updater signing key.
const FORWARDED_ENV: [&str; 4] = [
    "NEXUS_TWITCH_CLIENT_ID",
    "NEXUS_TWITCH_CLIENT_SECRET",
    "NEXUS_GOOGLE_CLIENT_ID",
    "NEXUS_GOOGLE_CLIENT_SECRET",
];

fn main() {
    // Load .env from src-tauri/ so option_env!() picks up compile-time secrets.
    // Falls back silently if .env is missing — shell env vars still work.
    if let Ok(path) = dotenvy::dotenv() {
        println!("cargo:rerun-if-changed={}", path.display());
        for (key, value) in dotenvy::dotenv_iter().unwrap().flatten() {
            if FORWARDED_ENV.contains(&key.as_str()) {
                println!("cargo:rustc-env={key}={value}");
            }
        }
    }

    tauri_build::build()
}
