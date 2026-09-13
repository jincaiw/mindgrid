//! 最近打开的文件列表（供「文件 → 最近打开」子菜单使用）。
//!
//! 存放在 `app_config_dir()/recent-files.json`，最多 [`MAX_RECENT`] 条、新项在前。
//!
//! 两条容错原则：
//! 1. **读写都不阻断启动**：文件缺失/损坏/无权限时一律当作空列表，绝不返回错误。
//!    最近列表是便利功能，不该因为它坏了就打不开应用。
//! 2. **只在读取时过滤已不存在的路径**，不顺手改写文件——"文件被移走"是暂时的，
//!    下次它回来时列表里还在。真正写盘的时机只有"又打开/保存了一个文件"。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

/// 最多记住多少个文件（XMind 之类通常也是 10 个左右）。
pub const MAX_RECENT: usize = 10;

const STORE_FILE: &str = "recent-files.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct RecentStore {
    #[serde(default)]
    files: Vec<String>,
}

fn store_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(STORE_FILE))
}

/// 读取最近文件列表（已过滤掉当前不存在的路径）。
pub fn load<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let Some(path) = store_path(app) else {
        return Vec::new()
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new()
    };
    let store: RecentStore = serde_json::from_str(&raw).unwrap_or_default();

    store
        .files
        .into_iter()
        .filter(|file| std::path::Path::new(file).is_file())
        .take(MAX_RECENT)
        .collect()
}

/// 把某个路径置顶到最近列表（去重、截断到上限）。
pub fn remember<R: Runtime>(app: &AppHandle<R>, file_path: &str) {
    let Some(path) = store_path(app) else {
        return
    };
    if file_path.trim().is_empty() {
        return
    }

    // 以现有文件内容为准（而不是 load() 的过滤结果）：被移走的旧项不该因为我们
    // 写了一次就永久消失
    let mut files = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<RecentStore>(&raw).ok())
        .unwrap_or_default()
        .files;

    files.retain(|item| item != file_path);
    files.insert(0, file_path.to_string());
    files.truncate(MAX_RECENT);

    write(app, &files);
}

/// 清空最近列表。
pub fn clear<R: Runtime>(app: &AppHandle<R>) {
    write(app, &[]);
}

/// 按下标取路径（菜单项只带下标，路径由 Rust 自己解析——避免前端再维护一份列表）。
pub fn resolve<R: Runtime>(app: &AppHandle<R>, index: usize) -> Option<String> {
    load(app).into_iter().nth(index)
}

fn write<R: Runtime>(app: &AppHandle<R>, files: &[String]) {
    let Some(path) = store_path(app) else {
        return
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let store = RecentStore {
        files: files.to_vec(),
    };
    if let Ok(raw) = serde_json::to_string_pretty(&store) {
        let _ = std::fs::write(&path, raw);
    }
}
