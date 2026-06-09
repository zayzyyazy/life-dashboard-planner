use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tower_http::cors::CorsLayer;

#[derive(Clone, Default)]
pub struct ShortcutConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

pub struct ShortcutServerState {
    pub config: Mutex<ShortcutConfig>,
    pub app: AppHandle,
    pub shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[derive(Deserialize)]
pub struct CaptureBody {
    pub text: String,
}

#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<String>,
}

#[derive(Serialize)]
pub struct CaptureResponse {
    pub ok: bool,
    pub message: String,
}

async fn health() -> &'static str {
    "Life Dashboard shortcut server OK"
}

async fn capture(
    State(state): State<Arc<ShortcutServerState>>,
    Query(query): Query<TokenQuery>,
    Json(body): Json<CaptureBody>,
) -> Result<Json<CaptureResponse>, StatusCode> {
    let config = state.config.lock().unwrap().clone();
    if !config.enabled {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let token = query.token.unwrap_or_default();
    if token != config.token {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Ok(Json(CaptureResponse {
            ok: false,
            message: "Empty capture text".into(),
        }));
    }

    let _ = state.app.emit("shortcut-capture", serde_json::json!({ "text": text }));

    Ok(Json(CaptureResponse {
        ok: true,
        message: format!("Captured {} characters — processing through planner", text.len()),
    }))
}

pub fn spawn_server(state: Arc<ShortcutServerState>) {
    let mut shutdown_guard = state.shutdown.lock().unwrap();
    if let Some(tx) = shutdown_guard.take() {
        let _ = tx.send(());
    }

    let config = state.config.lock().unwrap().clone();
    if !config.enabled {
        return;
    }

    let app_state = state.clone();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    *shutdown_guard = Some(shutdown_tx);

    tauri::async_runtime::spawn(async move {
        let app = Router::new()
            .route("/health", get(health))
            .route("/capture", post(capture))
            .layer(CorsLayer::permissive())
            .with_state(app_state);

        let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Shortcut server bind failed on port {}: {}", config.port, e);
                return;
            }
        };

        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });
}

pub fn restart_server(state: Arc<ShortcutServerState>) {
    spawn_server(state);
}
