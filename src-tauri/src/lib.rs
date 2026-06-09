mod courses;
mod shortcut_server;

use shortcut_server::{ShortcutConfig, ShortcutServerState};
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[derive(serde::Deserialize)]
struct ShortcutServerConfig {
    enabled: bool,
    port: u16,
    token: String,
}

#[tauri::command]
fn configure_shortcut_server(
    state: tauri::State<Arc<ShortcutServerState>>,
    config: ShortcutServerConfig,
) -> Result<(), String> {
    {
        let mut cfg = state.config.lock().map_err(|e| e.to_string())?;
        *cfg = ShortcutConfig {
            enabled: config.enabled,
            port: config.port,
            token: config.token,
        };
    }
    shortcut_server::restart_server(state.inner().clone());
    Ok(())
}

#[tauri::command]
fn get_local_ip() -> String {
    use std::net::UdpSocket;
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

#[tauri::command]
fn test_shortcut_capture(
    app: tauri::AppHandle,
    text: String,
) -> Result<serde_json::Value, String> {
    app.emit("shortcut-capture", serde_json::json!({ "text": text }))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "ok": true,
        "message": "Test capture sent to planner"
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let server_state = Arc::new(ShortcutServerState {
                config: std::sync::Mutex::new(ShortcutConfig::default()),
                app: handle,
                shutdown: std::sync::Mutex::new(None),
            });
            app.manage(server_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            configure_shortcut_server,
            get_local_ip,
            test_shortcut_capture,
            courses::read_course_dashboard_courses,
            courses::open_course_dashboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
