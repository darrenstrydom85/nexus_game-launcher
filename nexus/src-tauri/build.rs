fn main() {
    // Load .env from src-tauri/ so option_env!() picks up compile-time secrets.
    // Falls back silently if .env is missing — shell env vars still work.
    if let Ok(path) = dotenvy::dotenv() {
        println!("cargo:rerun-if-changed={}", path.display());
        for item in dotenvy::dotenv_iter().unwrap().flatten() {
            println!("cargo:rustc-env={}={}", item.0, item.1);
        }
    }

    tauri_build::build()
}
