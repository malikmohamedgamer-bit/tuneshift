//! Windows System Media Transport Controls: show what another app (Spotify, a browser…) is
//! playing in Boost mode / mini player / overlay, and control it. Hidden gracefully elsewhere.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SmtcInfo {
    pub app: String,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    /// data: URL of the cover, when the app provides one.
    pub thumbnail: Option<String>,
}

/// "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify"; "chrome.exe" → "Chrome".
pub fn friendly_app_name(aumid: &str) -> String {
    let tail = aumid.rsplit('!').next().unwrap_or(aumid);
    let base = tail.rsplit(['\\', '/']).next().unwrap_or(tail);
    let base = base.strip_suffix(".exe").unwrap_or(base);
    let base = base.split('.').next_back().unwrap_or(base);
    let mut c = base.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => "Another app".to_string(),
    }
}

/// Our own WebView2 media session also shows up in SMTC — never report it as "another app".
pub fn is_own_session(aumid: &str) -> bool {
    let id = aumid.to_ascii_lowercase();
    id.contains("tuneshift")
}

#[cfg(windows)]
mod imp {
    use super::{friendly_app_name, is_own_session, SmtcInfo};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::{Buffer, DataReader, IRandomAccessStreamReference, InputStreamOptions};

    const MAX_THUMB: u64 = 600_000;

    fn pick(mgr: &Manager) -> windows::core::Result<Option<Session>> {
        if let Ok(cur) = mgr.GetCurrentSession() {
            let id = cur.SourceAppUserModelId()?.to_string();
            if !is_own_session(&id) {
                return Ok(Some(cur));
            }
        }
        let sessions = mgr.GetSessions()?;
        for i in 0..sessions.Size()? {
            let s = sessions.GetAt(i)?;
            if !is_own_session(&s.SourceAppUserModelId()?.to_string()) {
                return Ok(Some(s));
            }
        }
        Ok(None)
    }

    fn thumbnail(r: &IRandomAccessStreamReference) -> Option<String> {
        let stream = r.OpenReadAsync().ok()?.join().ok()?;
        let size = stream.Size().ok()?.min(MAX_THUMB) as u32;
        if size == 0 {
            return None;
        }
        let buffer = Buffer::Create(size).ok()?;
        let read = stream
            .ReadAsync(&buffer, size, InputStreamOptions::None)
            .ok()?
            .join()
            .ok()?;
        let len = read.Length().ok()? as usize;
        let reader = DataReader::FromBuffer(&read).ok()?;
        let mut bytes = vec![0u8; len];
        reader.ReadBytes(&mut bytes).ok()?;
        let mime = stream
            .ContentType()
            .map(|c| c.to_string())
            .ok()
            .filter(|m| m.starts_with("image/"))
            .unwrap_or_else(|| "image/png".to_string());
        Some(format!("data:{mime};base64,{}", crate::b64::encode(&bytes)))
    }

    pub fn current() -> Option<SmtcInfo> {
        let mgr = Manager::RequestAsync().ok()?.join().ok()?;
        let session = pick(&mgr).ok()??;
        let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
        let playing = session
            .GetPlaybackInfo()
            .and_then(|i| i.PlaybackStatus())
            .map(|s| s == Status::Playing)
            .unwrap_or(false);
        Some(SmtcInfo {
            app: friendly_app_name(&session.SourceAppUserModelId().ok()?.to_string()),
            title: props.Title().map(|t| t.to_string()).unwrap_or_default(),
            artist: props.Artist().map(|a| a.to_string()).unwrap_or_default(),
            playing,
            thumbnail: props.Thumbnail().ok().and_then(|r| thumbnail(&r)),
        })
    }

    pub fn control(action: &str) -> Result<(), String> {
        let err = |e: windows::core::Error| e.to_string();
        let mgr = Manager::RequestAsync().map_err(err)?.join().map_err(err)?;
        let Some(s) = pick(&mgr).map_err(err)? else {
            return Ok(());
        };
        let op = match action {
            "toggle" => s.TryTogglePlayPauseAsync(),
            "next" => s.TrySkipNextAsync(),
            "previous" => s.TrySkipPreviousAsync(),
            _ => return Err(format!("unknown action '{action}'")),
        };
        op.map_err(err)?.join().map_err(err)?;
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::SmtcInfo;

    pub fn current() -> Option<SmtcInfo> {
        None
    }

    pub fn control(_action: &str) -> Result<(), String> {
        Err("Media controls for other apps are only available on Windows".into())
    }
}

#[tauri::command]
pub async fn smtc_current() -> Option<SmtcInfo> {
    tauri::async_runtime::spawn_blocking(imp::current)
        .await
        .ok()
        .flatten()
}

#[tauri::command]
pub async fn smtc_control(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || imp::control(&action))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{friendly_app_name, is_own_session};

    #[test]
    fn maps_app_ids_to_friendly_names() {
        assert_eq!(friendly_app_name("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), "Spotify");
        assert_eq!(friendly_app_name("Spotify.exe"), "Spotify");
        assert_eq!(friendly_app_name("chrome.exe"), "Chrome");
        assert_eq!(friendly_app_name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "ZuneMusic");
        assert_eq!(friendly_app_name("C:\\Apps\\vlc.exe"), "Vlc");
        assert_eq!(friendly_app_name(""), "Another app");
    }

    #[test]
    fn ignores_our_own_session() {
        assert!(is_own_session("app.tuneshift.desktop"));
        assert!(is_own_session("Tuneshift.exe"));
        assert!(!is_own_session("Spotify.exe"));
    }
}
