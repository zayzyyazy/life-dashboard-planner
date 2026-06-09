use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CourseInfo {
    pub storage_key: String,
    pub display_name: String,
    pub exam_date: Option<String>,
    pub personal_difficulty: Option<u8>,
}

fn vault_path() -> PathBuf {
    std::env::var("HOME")
        .map(|h| PathBuf::from(h).join("Documents/CourseDashboard"))
        .unwrap_or_else(|_| PathBuf::from("Documents/CourseDashboard"))
}

fn display_name_from_key(key: &str) -> String {
    key.replace('_', " ")
}

#[tauri::command]
pub fn read_course_dashboard_courses() -> Result<Vec<CourseInfo>, String> {
    let vault = vault_path();
    if !vault.is_dir() {
        return Ok(vec![]);
    }

    let mut courses = Vec::new();
    let entries = fs::read_dir(&vault).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let storage_key = entry.file_name().to_string_lossy().to_string();
        if storage_key.starts_with('.') {
            continue;
        }

        let settings_path = path.join("course_settings.json");
        let (exam_date, personal_difficulty) = if settings_path.is_file() {
            parse_settings(&settings_path)
        } else {
            (None, None)
        };

        courses.push(CourseInfo {
            storage_key: storage_key.clone(),
            display_name: display_name_from_key(&storage_key),
            exam_date,
            personal_difficulty,
        });
    }

    courses.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(courses)
}

fn parse_settings(path: &PathBuf) -> (Option<String>, Option<u8>) {
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return (None, None),
    };
    let json: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return (None, None),
    };
    let exam = json
        .pointer("/studyMeta/examDate")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let diff = json
        .pointer("/studyMeta/personalDifficulty")
        .and_then(|v| v.as_u64())
        .map(|n| n as u8);
    (exam, diff)
}

#[tauri::command]
pub fn open_course_dashboard() -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let candidates = [
        format!("{home}/Desktop/Course Dashboard.app"),
        "/Users/zay/Desktop/LLM projects/Course_Dashboard/dist-app/mac-arm64/Course Dashboard.app"
            .to_string(),
    ];

    for path in candidates {
        if std::path::Path::new(&path).exists() {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    let vault = vault_path();
    if vault.is_dir() {
        std::process::Command::new("open")
            .arg(&vault)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err("Course Dashboard.app not found on Desktop".to_string())
}
