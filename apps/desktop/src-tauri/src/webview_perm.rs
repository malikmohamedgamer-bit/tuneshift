//! Boost mode needs microphone-style access to "CABLE Output". WebView2 would ask for permission
//! on every launch; Tuneshift only ever loads its own bundled pages, so grant audio capture to the
//! main window automatically (spec §11.2).

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs, COREWEBVIEW2_PERMISSION_KIND,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use webview2_com::PermissionRequestedEventHandler;

fn on_permission(
    _sender: Option<ICoreWebView2>,
    args: Option<ICoreWebView2PermissionRequestedEventArgs>,
) -> windows::core::Result<()> {
    let Some(args) = args else {
        return Ok(());
    };
    let mut kind = COREWEBVIEW2_PERMISSION_KIND(0);
    // SAFETY: `args` is a live event-args object WebView2 passes to this callback.
    unsafe {
        args.PermissionKind(&mut kind)?;
        if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
        }
    }
    Ok(())
}

pub fn auto_allow_media(window: &WebviewWindow) {
    let _ = window.with_webview(|webview| {
        let handler = PermissionRequestedEventHandler::create(Box::new(on_permission));
        let controller = webview.controller();
        let mut token = 0i64;
        // SAFETY: COM calls on the WebView2 controller owned by this window, on the thread Tauri
        // hands us inside `with_webview`.
        unsafe {
            if let Ok(core) = controller.CoreWebView2() {
                let _ = core.add_PermissionRequested(&handler, &mut token);
            }
        }
    });
}
