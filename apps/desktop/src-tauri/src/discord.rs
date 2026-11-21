//! Optional Discord Rich Presence ("Listening to …"). Off by default; needs a client ID the user
//! pastes in Settings. Fails softly when Discord isn't running.

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
pub struct DiscordState {
    client: Mutex<Option<(String, DiscordIpcClient)>>,
}

pub fn valid_client_id(id: &str) -> bool {
    (17..=20).contains(&id.len()) && id.chars().all(|c| c.is_ascii_digit())
}

fn clip(s: &str, max: usize) -> String {
    // Discord rejects fields shorter than 2 or longer than 128 characters.
    let mut out: String = s.chars().take(max).collect();
    while out.chars().count() < 2 {
        out.push(' ');
    }
    out
}

#[tauri::command]
pub fn discord_update(
    state: State<'_, DiscordState>,
    client_id: String,
    details: String,
    status: String,
    start_ms: Option<i64>,
    large_text: String,
) -> Result<(), String> {
    if !valid_client_id(&client_id) {
        return Err("That doesn't look like a Discord client ID".into());
    }
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    let stale = guard.as_ref().map(|(id, _)| id != &client_id).unwrap_or(true);
    if stale {
        if let Some((_, mut old)) = guard.take() {
            let _ = old.close();
        }
        let mut client = DiscordIpcClient::new(&client_id);
        client
            .connect()
            .map_err(|e| format!("Discord isn't running ({e})"))?;
        *guard = Some((client_id.clone(), client));
    }
    let Some((_, client)) = guard.as_mut() else {
        return Err("Discord client unavailable".into());
    };
    let mut activity = Activity::new()
        .activity_type(ActivityType::Listening)
        .details(clip(&details, 128))
        .state(clip(&status, 128))
        .assets(Assets::new().large_image("tuneshift").large_text(clip(&large_text, 128)));
    if let Some(start) = start_ms {
        activity = activity.timestamps(Timestamps::new().start(start));
    }
    if let Err(e) = client.set_activity(activity) {
        // Discord restarted: drop the client so the next update reconnects.
        guard.take();
        return Err(format!("Discord presence failed ({e})"));
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut guard = state.client.lock().map_err(|e| e.to_string())?;
    if let Some((_, mut client)) = guard.take() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{clip, valid_client_id};

    #[test]
    fn validates_snowflake_ids() {
        assert!(valid_client_id("123456789012345678"));
        assert!(!valid_client_id("abc"));
        assert!(!valid_client_id("12345"));
        assert!(!valid_client_id("12345678901234567a"));
    }

    #[test]
    fn clips_fields_to_discord_limits() {
        assert_eq!(clip("x", 128).chars().count(), 2);
        assert_eq!(clip(&"y".repeat(300), 128).chars().count(), 128);
    }
}
