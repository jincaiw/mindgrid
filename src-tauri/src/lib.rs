pub mod app;
pub mod domain;

#[cfg(desktop)]
use tauri::Emitter;
use crate::app::assets::AssetStore;
use crate::domain::document::DocumentSession;
use std::sync::Mutex;

pub struct AppState {
    pub document_session: Mutex<DocumentSession>,
    /// 进程内资源存储：主题图片等二进制资源，保存时随 document.json 一起写入 .mgd。
    pub asset_store: Mutex<AssetStore>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            document_session: Mutex::new(DocumentSession::default()),
            asset_store: Mutex::new(AssetStore::default()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            app::commands::create_document,
            app::commands::create_document_from_template,
            app::commands::get_document_state,
            app::commands::open_document_file,
            app::commands::save_document_file,
            app::commands::save_document_to_current_file,
            app::commands::export_recovery_copy,
            app::commands::export_markdown_file,
            app::commands::import_markdown_file,
            app::commands::export_opml_file,
            app::commands::import_opml_file,
            app::commands::import_docx_file,
            app::commands::set_document_setting,
            app::commands::export_png_file,
            app::commands::export_pdf_file,
            app::commands::export_svg_file,
            app::commands::repair_document_file,
            app::commands::clear_repair_report,
            app::commands::select_sheet,
            app::commands::create_sheet,
            app::commands::rename_sheet,
            app::commands::delete_sheet,
            app::commands::move_sheet,
            app::commands::set_sheet_chart_type,
            app::commands::set_sheet_branch_style,
            app::commands::select_topic,
            app::commands::create_child_topic,
            app::commands::create_sibling_topic,
            app::commands::create_parent_topic,
            app::commands::create_floating_topic,
            app::commands::rename_topic,
            app::commands::delete_topic,
            app::commands::delete_topics,
            app::commands::toggle_topic_collapsed,
            app::commands::set_topic_notes,
            app::commands::set_topic_link,
            app::commands::set_topic_markers,
            app::commands::set_topic_labels,
            app::commands::set_topic_task,
            app::commands::set_topic_style_ref,
            app::commands::set_topic_style_overrides,
            app::commands::set_topic_image,
            app::commands::remove_topic_image,
            app::commands::read_asset_data_url,
            app::commands::set_document_theme,
            app::commands::create_relationship,
            app::commands::delete_relationship,
            app::commands::create_boundary,
            app::commands::delete_boundary,
            app::commands::create_summary,
            app::commands::delete_summary,
            app::commands::move_topic,
            app::commands::move_topics,
            app::commands::move_topic_in_parent,
            app::commands::move_topic_to_sheet,
            app::commands::move_topics_to_sheet,
            app::commands::copy_topic_to_sheet,
            app::commands::copy_topics_to_sheet,
            app::commands::paste_topics,
            app::commands::undo_document_command,
            app::commands::redo_document_command
        ])
        .setup(|app| {
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_process::init())?;

            // 日志插件：debug 构建启用 Info 级别，release 构建启用 Warn 级别。
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .build(),
            )?;

            // 自动更新插件：端点与公钥从 tauri.conf.json plugins.updater 读取。
            // 未配置端点时 check() 返回错误，前端优雅降级（仅隐藏"检查更新"入口）。
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

            // 原生菜单栏（对标 XMind 的 7 个顶层菜单）。仅桌面端：
            // 菜单点击只负责把 id 以事件转发给前端，业务逻辑统一在前端，
            // 与工具栏 / 快捷键走同一条命令路径。
            #[cfg(desktop)]
            {
                let menu = crate::app::menu::build_menu(app.handle())?;
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    let action_id = event.id().as_ref().to_string();
                    let _ = app.emit(crate::app::menu::MENU_ACTION_EVENT, action_id);
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
