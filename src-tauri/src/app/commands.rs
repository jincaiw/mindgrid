use crate::app::assets::AssetStore;
use crate::domain::document::{
    DocumentRepairReport, DocumentSession, DocumentSessionSnapshot, DocumentSnapshot,
    SheetBranchStyle, TopicImage, TopicLink, TopicMarker, TopicStyleOverrides, TopicTask,
};
use crate::AppState;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Runtime, State};

fn snapshot_document_session(session: &DocumentSession) -> Result<DocumentSessionSnapshot, String> {
    session
        .snapshot()
        .ok_or_else(|| "unable to build document snapshot".to_string())
}

fn persist_recovery_and_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    session: &mut DocumentSession,
) -> Result<DocumentSessionSnapshot, String> {
    // 恢复快照必须包含资源区，否则崩溃恢复后主题图片只剩 asset_id 没有字节流
    let assets = state
        .asset_store
        .lock()
        .map_err(|_| "unable to acquire asset store".to_string())?;
    crate::app::persistence::persist_recovery_snapshot(app, session, &assets)?;
    snapshot_document_session(session)
}

/// 浏览器可直接用 `<img src="data:...">` 渲染的图片 MIME 白名单。
///
/// 只按 `image/` 前缀放行是不够的：`image/tiff`、`image/heic`、`image/x-icon`
/// 等虽然 MIME 合法，但浏览器根本渲染不出来，插入后只会显示破图且不报错，
/// 比直接拒绝更难排查。故收紧为可渲染类型的明确枚举。
const RENDERABLE_IMAGE_MIME_TYPES: [&str; 7] = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/avif",
    "image/svg+xml",
];

/// 按扩展名推断图片 MIME 类型；无法识别时回落到通用二进制类型
/// （由 `register_image_asset` 据此拒绝）。
fn mime_type_for_path(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match extension.as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
}

/// 读取图片文件并注册为资源，返回 asset_id。
/// `AssetStore::register` 内部按 SHA-256 去重：相同内容复用同一 asset_id。
fn register_image_asset(assets: &mut AssetStore, source_path: &Path) -> Result<String, String> {
    let bytes = fs::read(source_path).map_err(|error| format!("无法读取图片文件: {error}"))?;
    if bytes.is_empty() {
        return Err("图片文件为空".to_string());
    }

    let mime_type = mime_type_for_path(source_path);
    // 必须是浏览器可渲染的类型，避免把渲染不出的二进制塞进资源区
    if !RENDERABLE_IMAGE_MIME_TYPES.contains(&mime_type) {
        return Err(format!(
            "不支持的图片格式：{}",
            source_path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("(无扩展名)")
        ));
    }

    Ok(assets.register(bytes, mime_type, None, None))
}

/// 把资源字节编码为 data URL，供前端 `<img src>` 直接渲染。
fn encode_asset_data_url(assets: &AssetStore, asset_id: &str) -> Result<String, String> {
    let entry = assets
        .index
        .find(asset_id)
        .ok_or_else(|| format!("找不到资源 {asset_id}"))?;
    let bytes = assets
        .get_bytes(asset_id)
        .ok_or_else(|| format!("资源 {asset_id} 的字节流缺失"))?;

    Ok(crate::app::assets::encode_asset_data_url(
        &entry.mime_type,
        bytes,
    ))
}

#[tauri::command]
pub fn create_document(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::create_default();

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_document_from_template(
    app: AppHandle,
    state: State<'_, AppState>,
    document: DocumentSnapshot,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_template(document);

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn get_document_state(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<DocumentSessionSnapshot>, String> {
    let guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    if let Some(snapshot) = guard.snapshot() {
        return Ok(Some(snapshot));
    }

    drop(guard);

    let restored =
        crate::app::persistence::try_restore_recovery_snapshot_with_assets(&app)?;

    if let Some((document, assets)) = restored {
        let mut guard = state
            .document_session
            .lock()
            .map_err(|_| "unable to acquire document state".to_string())?;

        *guard = DocumentSession::from_document(document);
        guard.mark_recovered_from_autosave();

        let mut store = state
            .asset_store
            .lock()
            .map_err(|_| "unable to acquire asset store".to_string())?;
        *store = assets;
        drop(store);

        return persist_recovery_and_snapshot(&app, &state, &mut guard).map(Some);
    }

    Ok(None)
}

#[tauri::command]
pub fn open_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let (document, assets) =
        crate::app::persistence::open_document_file_with_assets(std::path::Path::new(&path))?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        document,
        Some(path),
        Some(crate::app::persistence::current_timestamp_ms()),
    );

    let mut store = state
        .asset_store
        .lock()
        .map_err(|_| "unable to acquire asset store".to_string())?;
    *store = assets;
    drop(store);

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn save_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    {
        let assets = state
            .asset_store
            .lock()
            .map_err(|_| "unable to acquire asset store".to_string())?;
        crate::app::persistence::save_document_file(&mut guard, &assets, std::path::Path::new(&path))?;
    }

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn save_document_to_current_file(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;
    let file_path = guard
        .file_path
        .clone()
        .ok_or_else(|| "当前文档还没有正式文件路径，请先另存为".to_string())?;

    {
        let assets = state
            .asset_store
            .lock()
            .map_err(|_| "unable to acquire asset store".to_string())?;
        crate::app::persistence::save_document_file(
            &mut guard,
            &assets,
            std::path::Path::new(&file_path),
        )?;
    }

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn export_recovery_copy(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;
    let assets = state
        .asset_store
        .lock()
        .map_err(|_| "unable to acquire asset store".to_string())?;

    crate::app::persistence::export_recovery_copy(
        &app,
        &guard,
        &assets,
        std::path::Path::new(&path),
    )
}

#[tauri::command]
pub fn export_markdown_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    crate::app::import_export::export_markdown_file(&guard, std::path::Path::new(&path))
}

#[tauri::command]
pub fn import_markdown_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let document =
        crate::app::import_export::import_markdown_file(std::path::Path::new(&path))?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        document,
        None,
        Some(crate::app::persistence::current_timestamp_ms()),
    );

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn export_opml_file(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    let guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    crate::app::import_export::export_opml_file(&guard, std::path::Path::new(&path))
}

#[tauri::command]
pub fn export_png_file(path: String, data: Vec<u8>) -> Result<(), String> {
    crate::app::import_export::export_png_file(std::path::Path::new(&path), data)
}

#[tauri::command]
pub fn export_pdf_file(path: String, data: Vec<u8>) -> Result<(), String> {
    crate::app::import_export::export_pdf_file(std::path::Path::new(&path), data)
}

#[tauri::command]
pub fn export_svg_file(path: String, content: String) -> Result<(), String> {
    crate::app::import_export::export_svg_file(std::path::Path::new(&path), &content)
}

#[tauri::command]
pub fn import_opml_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let document =
        crate::app::import_export::import_opml_file(std::path::Path::new(&path))?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        document,
        None,
        Some(crate::app::persistence::current_timestamp_ms()),
    );

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn import_docx_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let document =
        crate::app::import_export::import_docx_file(std::path::Path::new(&path))?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        document,
        None,
        Some(crate::app::persistence::current_timestamp_ms()),
    );

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

/// 写入文档级设置键值（视图偏好，如 `canvas.showGrid`）；value 为 null 表示删除该键。
#[tauri::command]
pub fn set_document_setting(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: Option<serde_json::Value>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_document_setting(&key, value)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn repair_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
    destination_path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let repair_outcome = crate::app::persistence::repair_document_file_with_report(
        std::path::Path::new(&source_path),
        std::path::Path::new(&destination_path),
    )?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        repair_outcome.document,
        Some(destination_path.clone()),
        Some(repair_outcome.repaired_at_ms),
    );
    guard.mark_repaired(DocumentRepairReport {
        source_path,
        destination_path,
        repaired_at_ms: repair_outcome.repaired_at_ms,
        changes: repair_outcome.changes,
    });

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn clear_repair_report(
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.clear_repair_report()
}

#[tauri::command]
pub fn select_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.select_sheet(&sheet_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_sheet()?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn rename_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    title: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.rename_sheet(&sheet_id, &title)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_sheet(&sheet_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    direction: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_sheet(&sheet_id, &direction)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_sheet_chart_type(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    chart_type: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_sheet_chart_type(&sheet_id, &chart_type)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_sheet_branch_style(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    branch_style: Option<SheetBranchStyle>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_sheet_branch_style(&sheet_id, branch_style)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn select_topic(
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.select_topic(&topic_id)
}

#[tauri::command]
pub fn create_child_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    parent_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_child_topic(&parent_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_sibling_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    position: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_sibling_topic(&topic_id, position.as_deref())?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_parent_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_parent_topic(&topic_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_floating_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
    offset_x: f64,
    offset_y: f64,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_floating_topic(&text, offset_x, offset_y)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn rename_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    text: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.rename_topic(&topic_id, &text)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_topic(&topic_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_topics(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_ids: Vec<String>,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_topics(&topic_ids, action_label.as_deref())?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn toggle_topic_collapsed(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.toggle_topic_collapsed(&topic_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_notes(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    notes: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_notes(&topic_id, notes)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_link(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    link: Option<TopicLink>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_link(&topic_id, link)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_markers(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    markers: Vec<TopicMarker>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_markers(&topic_id, markers)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_labels(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    labels: Vec<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_labels(&topic_id, labels)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_task(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    task: Option<TopicTask>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_task(&topic_id, task)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_style_ref(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    style_ref: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_style_ref(&topic_id, style_ref)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn set_topic_style_overrides(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    style_overrides: Option<TopicStyleOverrides>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_style_overrides(&topic_id, style_overrides)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

/// 为主题设置图片：读取本地图片 → 注册为资源（SHA-256 去重）→ 写入 topic.image。
/// 撤销标签为「设置主题图片」。
#[tauri::command]
pub fn set_topic_image(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    source_path: String,
) -> Result<DocumentSessionSnapshot, String> {
    // 先完成文件读取与资源注册，再动文档，避免半途写入空引用
    let asset_id = {
        let mut assets = state
            .asset_store
            .lock()
            .map_err(|_| "unable to acquire asset store".to_string())?;
        register_image_asset(&mut assets, Path::new(&source_path))?
    };

    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_image(
        &topic_id,
        Some(TopicImage {
            asset_id,
            width: None,
            height: None,
        }),
    )?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

/// 移除主题图片（topic.image 置空）。撤销标签为「移除主题图片」。
/// 资源本体由保存时的 GC 回收，不在此处删除，保证撤销后仍可恢复。
#[tauri::command]
pub fn remove_topic_image(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_topic_image(&topic_id, None)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

/// 读取资源字节并编码为 data URL（`data:<mime>;base64,<...>`），供前端直接渲染主题图片。
#[tauri::command]
pub fn read_asset_data_url(
    state: State<'_, AppState>,
    asset_id: String,
) -> Result<String, String> {
    let assets = state
        .asset_store
        .lock()
        .map_err(|_| "unable to acquire asset store".to_string())?;

    encode_asset_data_url(&assets, &asset_id)
}

#[tauri::command]
pub fn set_document_theme(
    app: AppHandle,
    state: State<'_, AppState>,
    theme_id: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.set_document_theme(theme_id.as_deref())?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_relationship(
    app: AppHandle,
    state: State<'_, AppState>,
    from_topic_id: String,
    to_topic_id: String,
    label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_relationship(&from_topic_id, &to_topic_id, label)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_relationship(
    app: AppHandle,
    state: State<'_, AppState>,
    relationship_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_relationship(&relationship_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_boundary(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    topic_ids: Vec<String>,
    label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_boundary(&sheet_id, topic_ids, label)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_boundary(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    boundary_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_boundary(&sheet_id, &boundary_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn create_summary(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    topic_ids: Vec<String>,
    label: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_summary(&sheet_id, topic_ids, label)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn delete_summary(
    app: AppHandle,
    state: State<'_, AppState>,
    sheet_id: String,
    summary_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.delete_summary(&sheet_id, &summary_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    target_parent_id: String,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_topic(&topic_id, &target_parent_id, action_label.as_deref())?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_topics(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_ids: Vec<String>,
    target_parent_id: String,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_topics(&topic_ids, &target_parent_id, action_label.as_deref())?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_topic_in_parent(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    direction: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_topic_in_parent(&topic_id, &direction)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_topic_to_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    target_sheet_id: String,
    target_parent_id: Option<String>,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_topic_to_sheet(
        &topic_id,
        &target_sheet_id,
        target_parent_id.as_deref(),
        action_label.as_deref(),
    )?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn move_topics_to_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_ids: Vec<String>,
    target_sheet_id: String,
    target_parent_id: Option<String>,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.move_topics_to_sheet(
        &topic_ids,
        &target_sheet_id,
        target_parent_id.as_deref(),
        action_label.as_deref(),
    )?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn copy_topic_to_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
    target_sheet_id: String,
    target_parent_id: Option<String>,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.copy_topic_to_sheet(
        &topic_id,
        &target_sheet_id,
        target_parent_id.as_deref(),
        action_label.as_deref(),
    )?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn copy_topics_to_sheet(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_ids: Vec<String>,
    target_sheet_id: String,
    target_parent_id: Option<String>,
    action_label: Option<String>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.copy_topics_to_sheet(
        &topic_ids,
        &target_sheet_id,
        target_parent_id.as_deref(),
        action_label.as_deref(),
    )?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn paste_topics(
    app: AppHandle,
    state: State<'_, AppState>,
    topics: Vec<crate::domain::document::TopicSnapshot>,
    target_parent_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.paste_topics(&topics, &target_parent_id)?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn undo_document_command(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.undo()?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[tauri::command]
pub fn redo_document_command(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.redo()?;

    persist_recovery_and_snapshot(&app, &state, &mut guard)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::document::find_topic;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(1);

    /// 每条测试独立的临时目录，避免并发测试互相干扰。
    fn temp_dir(tag: &str) -> PathBuf {
        let unique = TEST_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "mindgrid-commands-{}-{}-{unique}",
            std::process::id(),
            tag
        ));
        fs::create_dir_all(&dir).expect("should create temp dir");
        dir
    }

    /// 默认文档的第一个子主题 id（对应 DocumentSession::create_default）。
    fn first_child_topic_id(session: &DocumentSession) -> String {
        session
            .document
            .as_ref()
            .expect("session should hold a document")
            .root_topic()
            .children[0]
            .id
            .clone()
    }

    fn topic_image_of(session: &DocumentSession, topic_id: &str) -> Option<TopicImage> {
        let document = session.document.as_ref().expect("session should hold a document");
        find_topic(document.root_topic(), topic_id)
            .expect("topic should exist")
            .image
            .clone()
    }

    #[test]
    fn set_topic_image_registers_asset_and_updates_topic() {
        let dir = temp_dir("set-image");
        let image_path = dir.join("logo.png");
        fs::write(&image_path, b"\x89PNG\r\n\x1a\nfake-png-bytes").expect("should write file");

        let mut assets = AssetStore::default();
        let asset_id =
            register_image_asset(&mut assets, &image_path).expect("should register asset");
        assert!(asset_id.starts_with("sha256-"), "got {asset_id}");
        assert!(asset_id.ends_with(".png"), "got {asset_id}");

        let mut session = DocumentSession::create_default();
        let topic_id = first_child_topic_id(&session);

        let snapshot = session
            .set_topic_image(
                &topic_id,
                Some(TopicImage {
                    asset_id: asset_id.clone(),
                    width: None,
                    height: None,
                }),
            )
            .expect("should set topic image");

        let topic = find_topic(snapshot.document.root_topic(), &topic_id)
            .expect("topic should exist in snapshot");
        assert_eq!(topic.image.as_ref().unwrap().asset_id, asset_id);
        assert_eq!(snapshot.next_undo_action.as_deref(), Some("设置主题图片"));
        assert!(snapshot.can_undo);

        // 撤销后图片引用消失，但资源字节保留，重做/再次插入可复用
        session.undo().expect("should undo");
        assert!(topic_image_of(&session, &topic_id).is_none());
        assert!(assets.get_bytes(&asset_id).is_some());
    }

    #[test]
    fn set_topic_image_rejects_missing_file() {
        let dir = temp_dir("set-image-missing");
        let mut assets = AssetStore::default();

        let error = register_image_asset(&mut assets, &dir.join("nope.png"))
            .expect_err("missing file should fail");

        assert!(error.contains("无法读取图片文件"), "got {error}");
        assert!(assets.index.assets.is_empty());
    }

    #[test]
    fn register_image_asset_rejects_unsupported_format() {
        let dir = temp_dir("set-image-bad-format");
        let mut assets = AssetStore::default();

        // 非图片后缀：即使文件存在且非空也应拒绝
        let file_path = dir.join("notes.txt");
        fs::write(&file_path, b"definitely not an image").expect("should write file");
        let error = register_image_asset(&mut assets, &file_path)
            .expect_err("unsupported format should fail");
        assert!(error.contains("不支持的图片格式"), "got {error}");
        assert!(error.contains("txt"), "错误信息应带上扩展名，got {error}");

        // 无扩展名同样拒绝
        let extensionless = dir.join("noextension");
        fs::write(&extensionless, b"\x00\x01\x02").expect("should write file");
        let error = register_image_asset(&mut assets, &extensionless)
            .expect_err("extensionless file should fail");
        assert!(error.contains("不支持的图片格式"), "got {error}");

        // MIME 合法但浏览器渲染不出的类型：tiff / heic / ico 一律拒绝
        for name in ["scan.tiff", "photo.heic", "favicon.ico"] {
            let path = dir.join(name);
            fs::write(&path, b"II*\x00not-renderable").expect("should write file");
            let error = register_image_asset(&mut assets, &path)
                .expect_err("{name} should be rejected");
            assert!(error.contains("不支持的图片格式"), "got {error}");
        }

        // 失败路径不应污染资源区
        assert!(assets.index.assets.is_empty());
        assert!(assets.blobs.is_empty());
    }

    #[test]
    fn register_image_asset_accepts_all_renderable_formats() {
        let dir = temp_dir("set-image-allowlist");
        let mut assets = AssetStore::default();

        // 白名单内的每个扩展名都应注册成功，且得到互不相同的 asset_id
        let extensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"];
        let mut ids = std::collections::HashSet::new();
        for extension in extensions {
            let path = dir.join(format!("image.{extension}"));
            fs::write(&path, format!("body-of-{extension}")).expect("should write file");

            let asset_id =
                register_image_asset(&mut assets, &path).expect("{extension} should be accepted");
            assert!(
                asset_id.starts_with("sha256-"),
                "{extension} got {asset_id}"
            );
            assert!(ids.insert(asset_id), "{extension} 应产生独立的 asset_id");
        }

        assert_eq!(assets.index.assets.len(), extensions.len());
        // 白名单全部落进 image/ 分类，不会混进 attachments 子目录
        assert!(assets.index.assets.iter().all(|e| e.mime_type.starts_with("image/")));
    }

    #[test]
    fn set_topic_image_deduplicates_identical_content() {
        let dir = temp_dir("set-image-dedupe");
        let first = dir.join("first.png");
        let second = dir.join("second.png");
        let bytes = b"\x89PNG\r\n\x1a\nsame-bytes";
        fs::write(&first, bytes).expect("should write file");
        fs::write(&second, bytes).expect("should write file");

        let mut assets = AssetStore::default();
        let id_a = register_image_asset(&mut assets, &first).expect("should register");
        let id_b = register_image_asset(&mut assets, &second).expect("should register");

        assert_eq!(id_a, id_b, "identical bytes should reuse one asset");
        assert_eq!(assets.index.assets.len(), 1);
    }

    #[test]
    fn remove_topic_image_clears_reference() {
        let dir = temp_dir("remove-image");
        let image_path = dir.join("photo.jpg");
        fs::write(&image_path, b"\xff\xd8\xff\xe0fake-jpeg").expect("should write file");

        let mut assets = AssetStore::default();
        let asset_id =
            register_image_asset(&mut assets, &image_path).expect("should register asset");

        let mut session = DocumentSession::create_default();
        let topic_id = first_child_topic_id(&session);
        let image = Some(TopicImage {
            asset_id,
            width: None,
            height: None,
        });

        session
            .set_topic_image(&topic_id, image.clone())
            .expect("should set image");
        assert!(topic_image_of(&session, &topic_id).is_some());

        let snapshot = session
            .set_topic_image(&topic_id, None)
            .expect("should remove image");
        assert!(topic_image_of(&session, &topic_id).is_none());
        assert_eq!(snapshot.next_undo_action.as_deref(), Some("移除主题图片"));

        // 撤销移除 → 图片引用恢复
        session.undo().expect("should undo");
        assert_eq!(topic_image_of(&session, &topic_id), image);
    }

    #[test]
    fn remove_topic_image_rejects_missing_topic() {
        let mut session = DocumentSession::create_default();

        let error = session
            .set_topic_image("missing-topic", None)
            .expect_err("missing topic should fail");

        assert!(error.contains("找不到需要编辑图片的主题"), "got {error}");
        assert!(session.history.is_empty(), "失败的命令不应入历史栈");
    }

    #[test]
    fn read_asset_data_url_encodes_bytes() {
        let mut assets = AssetStore::default();
        // 14 字节：长度非 3 的倍数，用于覆盖 Base64 尾块补 `=` 的分支
        let bytes = b"\x89PNG\r\n\x1a\npayloa";
        let asset_id = assets.register(bytes.to_vec(), "image/png", None, None);

        let data_url = encode_asset_data_url(&assets, &asset_id).expect("should encode");
        assert_eq!(
            data_url,
            format!(
                "data:image/png;base64,{}",
                crate::app::assets::encode_base64(bytes)
            )
        );

        // RFC 4648 §10 已知向量：长度非 3 倍数的尾块必须补 `=`
        let encoded = data_url
            .strip_prefix("data:image/png;base64,")
            .expect("should carry prefix");
        assert!(encoded.ends_with('='), "got {encoded}");
        assert_eq!(encoded, crate::app::assets::encode_base64(bytes));
    }

    #[test]
    fn read_asset_data_url_rejects_unknown_asset() {
        let assets = AssetStore::default();

        let error = encode_asset_data_url(&assets, "sha256-missing.png")
            .expect_err("unknown asset should fail");

        assert!(error.contains("找不到资源"), "got {error}");
    }

    #[test]
    fn mime_type_for_path_covers_common_images() {
        assert_eq!(mime_type_for_path(Path::new("a.png")), "image/png");
        assert_eq!(mime_type_for_path(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(mime_type_for_path(Path::new("a.jpeg")), "image/jpeg");
        assert_eq!(mime_type_for_path(Path::new("a.gif")), "image/gif");
        assert_eq!(mime_type_for_path(Path::new("a.webp")), "image/webp");
        assert_eq!(mime_type_for_path(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(mime_type_for_path(Path::new("a.bmp")), "image/bmp");
        assert_eq!(mime_type_for_path(Path::new("a.avif")), "image/avif");
        assert_eq!(
            mime_type_for_path(Path::new("a.unknown")),
            "application/octet-stream"
        );
        // 大写后缀与双写后缀都要归一
        assert_eq!(mime_type_for_path(Path::new("a.PNG")), "image/png");
        assert_eq!(mime_type_for_path(Path::new("a.SVG")), "image/svg+xml");
    }

    #[test]
    fn renderable_allowlist_excludes_non_displayable_images() {
        // 白名单只收浏览器可渲染类型：tiff/heic/ico/vnd.* 均不在内
        for mime in [
            "image/tiff",
            "image/heic",
            "image/x-icon",
            "image/vnd.adobe.photoshop",
            "application/pdf",
            "application/octet-stream",
        ] {
            assert!(
                !RENDERABLE_IMAGE_MIME_TYPES.contains(&mime),
                "{mime} 不应出现在可渲染白名单中"
            );
        }
    }

    #[test]
    fn topic_image_survives_save_and_reopen() {
        let dir = temp_dir("image-persistence");
        let image_path = dir.join("shot.png");
        let bytes = b"\x89PNG\r\n\x1a\npersisted-bytes";
        fs::write(&image_path, bytes).expect("should write file");

        let mut assets = AssetStore::default();
        let asset_id =
            register_image_asset(&mut assets, &image_path).expect("should register asset");

        let mut session = DocumentSession::create_default();
        let topic_id = first_child_topic_id(&session);
        session
            .set_topic_image(
                &topic_id,
                Some(TopicImage {
                    asset_id: asset_id.clone(),
                    width: None,
                    height: None,
                }),
            )
            .expect("should set image");

        let archive_path = dir.join("with-image.mgd");
        crate::app::persistence::save_document_file(&mut session, &assets, &archive_path)
            .expect("should save archive");

        let (restored_document, restored_assets) =
            crate::app::persistence::open_document_file_with_assets(&archive_path)
                .expect("should reopen archive");

        let restored_topic = find_topic(restored_document.root_topic(), &topic_id)
            .expect("topic should survive round trip");
        assert_eq!(restored_topic.image.as_ref().unwrap().asset_id, asset_id);
        assert_eq!(restored_assets.get_bytes(&asset_id), Some(bytes.as_slice()));
    }
}
