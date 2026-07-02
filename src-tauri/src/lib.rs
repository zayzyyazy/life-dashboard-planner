mod courses;
mod shortcut_server;

use shortcut_server::{ShortcutConfig, ShortcutServerState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[derive(serde::Deserialize)]
struct ShortcutServerConfig {
    enabled: bool,
    port: u16,
    token: String,
}

#[derive(serde::Serialize)]
struct AgentIntegrationInfo {
    id: String,
    name: String,
    status: String,
    description: String,
    capabilities: Vec<String>,
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

#[tauri::command]
fn get_agent_integrations() -> Vec<AgentIntegrationInfo> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let vault = PathBuf::from(&home).join("Documents/CourseDashboard");
    let course_count = if vault.is_dir() {
        std::fs::read_dir(&vault)
            .map(|entries| entries.filter_map(|e| e.ok()).count())
            .unwrap_or(0)
    } else {
        0
    };

    vec![
        AgentIntegrationInfo {
            id: "life_dashboard".into(),
            name: "Life Dashboard".into(),
            status: "connected".into(),
            description: "Tasks, projects, schedule, agent memory".into(),
            capabilities: vec![
                "tasks".into(),
                "projects".into(),
                "memory".into(),
                "schedule".into(),
            ],
        },
        AgentIntegrationInfo {
            id: "course_dashboard".into(),
            name: "Course Dashboard".into(),
            status: if course_count > 0 {
                "connected".into()
            } else {
                "available".into()
            },
            description: format!("{} courses in vault", course_count),
            capabilities: vec!["read_courses".into(), "open_app".into()],
        },
        AgentIntegrationInfo {
            id: "iphone_shortcut".into(),
            name: "iPhone Shortcut".into(),
            status: "available".into(),
            description: "HTTP capture endpoint when server is enabled".into(),
            capabilities: vec!["capture".into(), "voice_updates".into()],
        },
    ]
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
            get_agent_integrations,
            courses::read_course_dashboard_courses,
            courses::open_course_dashboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
