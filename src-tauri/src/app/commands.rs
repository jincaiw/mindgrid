use crate::domain::document::{
    DocumentRepairReport, DocumentSession, DocumentSessionSnapshot, DocumentSnapshot, TopicLink,
    TopicMarker, TopicStyleOverrides, TopicTask,
};
use crate::AppState;
use tauri::{AppHandle, Runtime, State};

fn snapshot_document_session(session: &DocumentSession) -> Result<DocumentSessionSnapshot, String> {
    session
        .snapshot()
        .ok_or_else(|| "unable to build document snapshot".to_string())
}

fn persist_recovery_and_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    session: &mut DocumentSession,
) -> Result<DocumentSessionSnapshot, String> {
    crate::app::persistence::persist_recovery_snapshot(app, session)?;
    snapshot_document_session(session)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    let restored_document = crate::app::persistence::try_restore_recovery_snapshot(&app)?;

    if let Some(document) = restored_document {
        let mut guard = state
            .document_session
            .lock()
            .map_err(|_| "unable to acquire document state".to_string())?;

        *guard = DocumentSession::from_document(document);
        guard.mark_recovered_from_autosave();

        return persist_recovery_and_snapshot(&app, &mut guard).map(Some);
    }

    Ok(None)
}

#[tauri::command]
pub fn open_document_file(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<DocumentSessionSnapshot, String> {
    let document = crate::app::persistence::open_document_file(std::path::Path::new(&path))?;
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    *guard = DocumentSession::from_document_with_file_path(
        document,
        Some(path),
        Some(crate::app::persistence::current_timestamp_ms()),
    );

    persist_recovery_and_snapshot(&app, &mut guard)
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

    crate::app::persistence::save_document_file(&mut guard, std::path::Path::new(&path))?;

    persist_recovery_and_snapshot(&app, &mut guard)
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

    crate::app::persistence::save_document_file(&mut guard, std::path::Path::new(&file_path))?;

    persist_recovery_and_snapshot(&app, &mut guard)
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

    crate::app::persistence::export_recovery_copy(&app, &guard, std::path::Path::new(&path))
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
}

#[tauri::command]
pub fn create_sibling_topic(
    app: AppHandle,
    state: State<'_, AppState>,
    topic_id: String,
) -> Result<DocumentSessionSnapshot, String> {
    let mut guard = state
        .document_session
        .lock()
        .map_err(|_| "unable to acquire document state".to_string())?;

    guard.create_sibling_topic(&topic_id)?;

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
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

    persist_recovery_and_snapshot(&app, &mut guard)
}
