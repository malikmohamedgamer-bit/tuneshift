//! Window and preference commands called from the web app.

use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, PhysicalPosition, State, WebviewWindow};

use crate::Prefs;

#[tauri::command]
pub fn set_prefs(prefs: State<'_, Prefs>, close_to_tray: bool) {
    prefs.close_to_tray.store(close_to_tray, Ordering::Relaxed);
}

/// Command-line arguments (files opened via "Open with Tuneshift", deep links).
#[tauri::command]
pub fn launch_args() -> Vec<String> {
    std::env::args().skip(1).collect()
}

fn window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("window '{label}' not found"))
}

#[tauri::command]
pub fn set_window_visible(app: AppHandle, label: String, visible: bool) -> Result<(), String> {
    let w = window(&app, &label)?;
    if visible {
        w.show().map_err(|e| e.to_string())?;
        // The overlay is never focused (it must not steal focus from games).
        if label != "overlay" {
            let _ = w.set_focus();
        }
    } else {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Show/hide a window; returns the new visibility.
#[tauri::command]
pub fn toggle_window(app: AppHandle, label: String) -> Result<bool, String> {
    let w = window(&app, &label)?;
    let visible = w.is_visible().unwrap_or(false);
    set_window_visible(app, label, !visible)?;
    Ok(!visible)
}

/// Snap position for a window of size (ww, wh) in the work area (ax, ay, aw, ah).
pub fn snap_position(
    area: (i32, i32, u32, u32),
    win: (u32, u32),
    corner: &str,
    margin: i32,
) -> (i32, i32) {
    let (ax, ay, aw, ah) = area;
    let (ww, wh) = (win.0 as i32, win.1 as i32);
    let left = ax + margin;
    let right = ax + aw as i32 - ww - margin;
    let top = ay + margin;
    let bottom = ay + ah as i32 - wh - margin;
    match corner {
        "top-left" => (left, top),
        "top-right" => (right, top),
        "bottom-left" => (left, bottom),
        _ => (right, bottom),
    }
}

/// Overlay pill position: top-centre by default (configurable).
pub fn overlay_position(
    area: (i32, i32, u32, u32),
    win: (u32, u32),
    position: &str,
    margin: i32,
) -> (i32, i32) {
    let (ax, ay, aw, ah) = area;
    let (ww, wh) = (win.0 as i32, win.1 as i32);
    let center_x = ax + (aw as i32 - ww) / 2;
    match position {
        "top-left" => (ax + margin, ay + margin),
        "top-right" => (ax + aw as i32 - ww - margin, ay + margin),
        "bottom-center" => (center_x, ay + ah as i32 - wh - margin),
        _ => (center_x, ay + margin),
    }
}

fn work_area(w: &WebviewWindow) -> Option<((i32, i32, u32, u32), f64)> {
    let m = w
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten())?;
    let a = m.work_area();
    Some((
        (a.position.x, a.position.y, a.size.width, a.size.height),
        m.scale_factor(),
    ))
}

#[tauri::command]
pub fn mini_snap(app: AppHandle, corner: String) -> Result<(), String> {
    let w = window(&app, "mini")?;
    let (area, scale) = work_area(&w).ok_or("no monitor")?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let (x, y) = snap_position(area, (size.width, size.height), &corner, (16.0 * scale) as i32);
    w.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

pub fn place_overlay(w: &WebviewWindow, position: &str) {
    // The overlay always sits on the primary monitor (where fullscreen games usually run).
    let monitor = w.primary_monitor().ok().flatten();
    let Some(m) = monitor else { return };
    let a = m.work_area();
    let scale = m.scale_factor();
    if let Ok(size) = w.outer_size() {
        let (x, y) = overlay_position(
            (a.position.x, a.position.y, a.size.width, a.size.height),
            (size.width, size.height),
            position,
            (18.0 * scale) as i32,
        );
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
}

#[tauri::command]
pub fn overlay_config(app: AppHandle, position: String, click_through: bool) -> Result<(), String> {
    let w = window(&app, "overlay")?;
    w.set_ignore_cursor_events(click_through)
        .map_err(|e| e.to_string())?;
    place_overlay(&w, &position);
    Ok(())
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::{overlay_position, snap_position};

    const AREA: (i32, i32, u32, u32) = (0, 0, 1920, 1040);

    #[test]
    fn snaps_to_each_corner_inside_the_work_area() {
        let win = (340, 110);
        assert_eq!(snap_position(AREA, win, "top-left", 16), (16, 16));
        assert_eq!(snap_position(AREA, win, "top-right", 16), (1920 - 340 - 16, 16));
        assert_eq!(snap_position(AREA, win, "bottom-left", 16), (16, 1040 - 110 - 16));
        assert_eq!(snap_position(AREA, win, "anything", 16), (1564, 914));
    }

    #[test]
    fn respects_monitor_offsets() {
        let second = (1920, -200, 2560, 1400);
        assert_eq!(snap_position(second, (340, 110), "top-left", 10), (1930, -190));
    }

    #[test]
    fn overlay_defaults_to_top_centre() {
        assert_eq!(overlay_position(AREA, (480, 88), "top-center", 18), (720, 18));
        assert_eq!(overlay_position(AREA, (480, 88), "bottom-center", 18), (720, 1040 - 88 - 18));
        assert_eq!(overlay_position(AREA, (480, 88), "top-right", 18), (1920 - 480 - 18, 18));
    }
}
