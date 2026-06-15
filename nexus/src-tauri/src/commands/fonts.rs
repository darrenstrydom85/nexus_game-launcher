//! Enumerate fonts installed on the user's system so the Theme Studio can offer
//! them as UI / monospace font choices.
//!
//! On Windows we read the font registry keys (no extra crate needed — `winreg`
//! is already a dependency). On other platforms we return an empty list and the
//! frontend falls back to the bundled fonts.

use super::error::CommandError;

#[cfg(windows)]
fn collect_windows_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const FONTS_PATH: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";
    let hives = [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER];

    let mut families: BTreeSet<String> = BTreeSet::new();
    for hive in hives {
        let root = RegKey::predef(hive);
        let key = match root.open_subkey(FONTS_PATH) {
            Ok(k) => k,
            Err(_) => continue,
        };
        for entry in key.enum_values().flatten() {
            let raw_name = entry.0;
            // Registry names look like "Arial (TrueType)" or
            // "Cambria & Cambria Math (TrueType)". Strip the parenthetical type
            // suffix, then split combined entries on '&'.
            let base = raw_name.split(" (").next().unwrap_or(&raw_name);
            for family in base.split('&') {
                let trimmed = family.trim();
                if !trimmed.is_empty() {
                    families.insert(trimmed.to_string());
                }
            }
        }
    }
    families.into_iter().collect()
}

/// Return the sorted, de-duplicated list of installed font family names.
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, CommandError> {
    #[cfg(windows)]
    {
        Ok(collect_windows_fonts())
    }
    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_system_fonts_succeeds() {
        let fonts = list_system_fonts().expect("listing fonts should not error");
        // The returned list is always sorted and free of empty entries.
        assert!(fonts.iter().all(|f| !f.trim().is_empty()));
        let mut sorted = fonts.clone();
        sorted.sort();
        assert_eq!(fonts, sorted);
    }
}
