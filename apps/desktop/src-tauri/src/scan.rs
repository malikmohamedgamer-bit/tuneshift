//! Watched-folder scanning and asset-protocol scope (desktop local library).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

pub const AUDIO_EXTENSIONS: [&str; 7] = ["mp3", "m4a", "aac", "flac", "wav", "ogg", "opus"];
const MAX_FILES: usize = 50_000;

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub rel_path: String,
    pub size: u64,
    pub mtime_ms: u64,
}

pub fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Recursively list audio files under `root` (symlinks not followed, capped at `limit`).
pub fn scan(root: &Path, limit: usize) -> Vec<FileEntry> {
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file() && is_audio(e.path()))
        .take(limit)
        .map(|e| {
            let meta = e.metadata().ok();
            let rel = e
                .path()
                .strip_prefix(root)
                .unwrap_or(e.path())
                .to_string_lossy()
                .replace('\\', "/");
            FileEntry {
                path: e.path().to_string_lossy().into_owned(),
                name: e.file_name().to_string_lossy().into_owned(),
                rel_path: format!("{root_name}/{rel}"),
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                mtime_ms: meta
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<FileEntry>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("'{path}' is not a folder"));
    }
    tauri::async_runtime::spawn_blocking(move || scan(&root, MAX_FILES))
        .await
        .map_err(|e| e.to_string())
}

/// Allow the asset protocol to serve a watched folder (re-applied at every start).
#[tauri::command]
pub fn allow_asset_dir(app: AppHandle, path: String) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("'{path}' is not a folder"));
    }
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}

/// Allow a single file (opened via file association).
#[tauri::command]
pub fn allow_asset_file(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_file() || !is_audio(p) {
        return Err(format!("'{path}' is not an audio file"));
    }
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{is_audio, scan};
    use std::fs;
    use std::path::Path;

    #[test]
    fn recognises_audio_extensions_case_insensitively() {
        assert!(is_audio(Path::new("a/b/song.MP3")));
        assert!(is_audio(Path::new("x.flac")));
        assert!(!is_audio(Path::new("cover.jpg")));
        assert!(!is_audio(Path::new("noext")));
    }

    #[test]
    fn scans_recursively_and_skips_other_files() {
        let root = std::env::temp_dir().join(format!("tuneshift-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Album")).unwrap();
        fs::write(root.join("one.mp3"), b"x").unwrap();
        fs::write(root.join("Album").join("two.Flac"), b"xy").unwrap();
        fs::write(root.join("Album").join("cover.png"), b"z").unwrap();
        let mut found = scan(&root, 100);
        found.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        let root_name = root.file_name().unwrap().to_string_lossy().into_owned();
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].rel_path, format!("{root_name}/Album/two.Flac"));
        assert_eq!(found[0].size, 2);
        assert_eq!(found[1].name, "one.mp3");
        assert_eq!(scan(&root, 1).len(), 1);
        let _ = fs::remove_dir_all(&root);
    }
}
