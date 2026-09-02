use crate::app::assets::{AssetIndex, AssetStore};
use crate::domain::document::{DocumentSession, DocumentSnapshot, TopicSnapshot};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const FORMAT_VERSION: &str = "1.1.0";
const MIMETYPE: &str = "application/vnd.mindgrid.document";
const RECOVERY_FILE_NAME: &str = "autosave-recovery.mgd";
static REPAIR_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Zip Bomb 防护：解压后总字节数上限（256 MB）。
const ZIP_BOMB_MAX_UNCOMPRESSED_BYTES: u64 = 256 * 1024 * 1024;
/// Zip Bomb 防护：压缩比上限（100:1）。
const ZIP_BOMB_MAX_COMPRESSION_RATIO: u64 = 100;
/// Zip Bomb 防护：单条目解压后字节数上限（64 MB）。
const ZIP_BOMB_MAX_ENTRY_BYTES: u64 = 64 * 1024 * 1024;
/// Zip Bomb 防护：条目数量上限。
const ZIP_BOMB_MAX_ENTRIES: usize = 10_000;
/// 应用版本（写入 metadata.json）。
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// 文档级元数据（metadata.json），与 manifest.json（格式级）分离。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub created_at_ms: u64,
    pub modified_at_ms: u64,
    pub app_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

impl DocumentMetadata {
    /// 从文档快照推导默认元数据。
    pub fn from_document(document: &DocumentSnapshot, timestamp_ms: u64) -> Self {
        let title = document
            .sheets
            .first()
            .map(|sheet| sheet.title.clone())
            .unwrap_or_else(|| "未命名文档".to_string());
        Self {
            title,
            author: None,
            created_at_ms: timestamp_ms,
            modified_at_ms: timestamp_ms,
            app_version: APP_VERSION.to_string(),
            description: None,
        }
    }
}

/// .mgd 归档完整内容：文档 + 资源 + 元数据 + 样式。
#[derive(Debug, Clone)]
pub struct MgdContents {
    pub document: DocumentSnapshot,
    pub assets: AssetStore,
    pub metadata: DocumentMetadata,
    /// styles.json 内容（样式定义）。None 时不写入 styles.json。
    pub styles: Option<Value>,
}

impl MgdContents {
    /// 从文档快照构建最小有效内容（空资源、默认元数据、无样式）。
    pub fn from_document(document: DocumentSnapshot, timestamp_ms: u64) -> Self {
        let metadata = DocumentMetadata::from_document(&document, timestamp_ms);
        Self {
            document,
            assets: AssetStore::default(),
            metadata,
            styles: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestSnapshot {
    format_version: String,
    mimetype: String,
    generated_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct FormatVersion {
    major: u64,
    minor: u64,
    patch: u64,
}

#[derive(Debug, Clone, Default)]
pub struct RepairStats {
    pub schema_version_rewritten: bool,
    pub document_id_regenerated: bool,
    pub revision_reset: bool,
    pub active_sheet_reassigned: bool,
    pub sheet_ids_regenerated: usize,
    pub sheet_titles_filled: usize,
    pub topic_ids_regenerated: usize,
    pub topic_texts_filled: usize,
}

#[derive(Debug, Clone)]
pub struct RepairOutcome {
    pub document: DocumentSnapshot,
    pub repaired_at_ms: u64,
    pub changes: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoadMode {
    Strict,
    Repair,
}

pub fn persist_recovery_snapshot<R: Runtime>(
    app: &AppHandle<R>,
    session: &mut DocumentSession,
) -> Result<(), String> {
    let document = session
        .document
        .as_ref()
        .ok_or_else(|| "当前没有打开的文档".to_string())?;
    let recovery_path = recovery_snapshot_path(app)?;
    let timestamp_ms = current_timestamp_ms();

    write_document_archive(document, &recovery_path, timestamp_ms)?;
    session.mark_autosaved(timestamp_ms);

    Ok(())
}

pub fn try_restore_recovery_snapshot<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Option<DocumentSnapshot>, String> {
    let recovery_path = recovery_snapshot_path(app)?;

    if !recovery_path.exists() {
        return Ok(None);
    }

    read_document_archive(&recovery_path).map(Some)
}

pub fn open_document_file(path: &Path) -> Result<DocumentSnapshot, String> {
    let mut repair_stats = RepairStats::default();

    read_document_archive_with_mode(path, LoadMode::Strict, &mut repair_stats)
}

pub fn save_document_file(session: &mut DocumentSession, path: &Path) -> Result<(), String> {
    let document = session
        .document
        .as_ref()
        .ok_or_else(|| "当前没有打开的文档".to_string())?;
    let timestamp_ms = current_timestamp_ms();

    write_document_archive(document, path, timestamp_ms)?;
    session.mark_saved(path.to_string_lossy().to_string(), timestamp_ms);

    Ok(())
}

pub fn export_recovery_copy<R: Runtime>(
    app: &AppHandle<R>,
    session: &DocumentSession,
    path: &Path,
) -> Result<(), String> {
    let document = if recovery_snapshot_path(app)?.exists() {
        read_document_archive(&recovery_snapshot_path(app)?)?
    } else {
        session
            .document
            .clone()
            .ok_or_else(|| "当前没有可导出的恢复内容".to_string())?
    };

    write_document_archive(&document, path, current_timestamp_ms())
}

fn recovery_snapshot_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法解析应用数据目录: {error}"))?;

    Ok(app_data_dir.join("recovery").join(RECOVERY_FILE_NAME))
}

pub fn write_document_archive(
    document: &DocumentSnapshot,
    path: &Path,
    timestamp_ms: u64,
) -> Result<(), String> {
    let contents = MgdContents::from_document(document.clone(), timestamp_ms);
    let temp_path = path.with_extension("tmp");
    write_archive_to_temp(&contents, &temp_path, timestamp_ms)?;
    // 简单保存不做 Level 4 校验（资源引用 + Hash），用于恢复快照与无资源场景。
    atomic_replace(&temp_path, path)
}

/// 完整原子保存流程（spec 11）：
/// Document Snapshot → Domain Validation → Serialize → Collect Assets →
/// Write Temp ZIP → Validate Temp ZIP → Flush/fsync → Atomic Replace → fsync Parent。
pub fn write_document_archive_full(
    contents: &MgdContents,
    path: &Path,
    timestamp_ms: u64,
) -> Result<(), String> {
    // Domain Validation (Level 0-3)
    validate_document_snapshot(&contents.document)?;

    let temp_path = path.with_extension("tmp");
    write_archive_to_temp(contents, &temp_path, timestamp_ms)?;

    // Validate Temp ZIP (Level 0-4)
    validate_archive_integrity(&temp_path)
        .map_err(|error| format!("临时文档校验失败: {error}"))?;

    atomic_replace(&temp_path, path)
}

/// 将内容写入临时 ZIP 文件并 fsync（spec 11 流程的 Write Temp ZIP + Flush/fsync 步骤）。
/// 不做原子替换，由调用方在验证通过后执行 `atomic_replace`。
fn write_archive_to_temp(
    contents: &MgdContents,
    temp_path: &Path,
    timestamp_ms: u64,
) -> Result<(), String> {
    // GC 未被引用的资源
    let mut assets = contents.assets.clone();
    let _removed = assets.garbage_collect(&contents.document);

    // Level 4 Hash 自检：保存前确认所有资源字节流与索引一致
    if let Err(hash_errors) = assets.verify_all_hashes() {
        return Err(format!("资源哈希校验失败，中止保存: {}", hash_errors.join("; ")));
    }

    if let Some(parent) = temp_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建目录: {error}"))?;
    }

    let file = File::create(temp_path).map_err(|error| format!("无法创建临时文档: {error}"))?;
    let mut writer = ZipWriter::new(file);
    let stored_options = FileOptions::default().compression_method(CompressionMethod::Stored);
    let deflated_options = FileOptions::default().compression_method(CompressionMethod::Deflated);
    let manifest = ManifestSnapshot {
        format_version: FORMAT_VERSION.to_string(),
        mimetype: MIMETYPE.to_string(),
        generated_at_ms: timestamp_ms,
    };

    // mimetype（Stored，首条目，与 OOXML/EPUB 约定一致）
    writer
        .start_file("mimetype", stored_options)
        .map_err(|error| format!("无法写入 mimetype: {error}"))?;
    writer
        .write_all(MIMETYPE.as_bytes())
        .map_err(|error| format!("无法写入 mimetype 内容: {error}"))?;

    // manifest.json（格式级元数据）
    writer
        .start_file("manifest.json", deflated_options)
        .map_err(|error| format!("无法写入 manifest.json: {error}"))?;
    writer
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|error| format!("无法序列化 manifest: {error}"))?
                .as_bytes(),
        )
        .map_err(|error| format!("无法写入 manifest 内容: {error}"))?;

    // document.json
    writer
        .start_file("document.json", deflated_options)
        .map_err(|error| format!("无法写入 document.json: {error}"))?;
    writer
        .write_all(
            serde_json::to_string_pretty(&contents.document)
                .map_err(|error| format!("无法序列化文档: {error}"))?
                .as_bytes(),
        )
        .map_err(|error| format!("无法写入 document.json 内容: {error}"))?;

    // metadata.json（文档级元数据）
    writer
        .start_file("metadata.json", deflated_options)
        .map_err(|error| format!("无法写入 metadata.json: {error}"))?;
    writer
        .write_all(
            serde_json::to_string_pretty(&contents.metadata)
                .map_err(|error| format!("无法序列化 metadata: {error}"))?
                .as_bytes(),
        )
        .map_err(|error| format!("无法写入 metadata 内容: {error}"))?;

    // styles.json（可选：样式定义）
    if let Some(styles) = &contents.styles {
        writer
            .start_file("styles.json", deflated_options)
            .map_err(|error| format!("无法写入 styles.json: {error}"))?;
        writer
            .write_all(
                serde_json::to_string_pretty(styles)
                    .map_err(|error| format!("无法序列化 styles: {error}"))?
                    .as_bytes(),
            )
            .map_err(|error| format!("无法写入 styles.json 内容: {error}"))?;
    }

    // assets/index.json + assets/<subdir>/<asset_id>
    assets.write_to_zip(&mut writer, deflated_options)?;

    // extensions/ 目录占位（空目录条目，标明扩展区存在）
    writer
        .start_file("extensions/.gitkeep", deflated_options)
        .map_err(|error| format!("无法写入 extensions 占位: {error}"))?;
    writer
        .write_all(b"")
        .map_err(|error| format!("无法写入 extensions 占位内容: {error}"))?;

    // Flush/fsync 临时文件
    let file = writer
        .finish()
        .map_err(|error| format!("无法完成文档写入: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法刷新临时文档: {error}"))?;

    Ok(())
}

/// 原子替换：rename temp → final + fsync 父目录（spec 11 流程的 Atomic Replace + fsync Parent）。
fn atomic_replace(temp_path: &Path, final_path: &Path) -> Result<(), String> {
    fs::rename(temp_path, final_path).map_err(|error| format!("无法替换文档: {error}"))?;

    // fsync Parent 目录
    if let Some(parent) = final_path.parent() {
        if let Ok(parent_dir) = File::open(parent) {
            let _ = parent_dir.sync_all();
        }
    }

    Ok(())
}

/// 旁路锁文件（spec 13）：辅助提示文档正在被编辑，不作为绝对真相。
/// 锁文件为 `<path>.lock`，包含 PID 与时间戳。打开时检查、关闭时释放（best-effort）。
#[derive(Debug)]
pub struct DocumentFileLock {
    lock_path: PathBuf,
}

impl DocumentFileLock {
    /// 检查目标文档是否存在旁路锁文件，返回锁内容（若存在）。
    /// 调用方可据此提示用户"可能被其他实例占用"，但不阻止打开。
    pub fn check_existing(document_path: &Path) -> Option<String> {
        let lock_path = document_path.with_extension("mgd.lock");
        fs::read_to_string(&lock_path).ok()
    }

    /// 尝试获取旁路锁：写入 `<path>.lock`，记录 PID 与时间戳。Best-effort，失败不阻塞。
    pub fn try_acquire(document_path: &Path) -> Self {
        let lock_path = document_path.with_extension("mgd.lock");
        let lock_content = format!(
            "{{\"pid\":{},\"timestamp\":{},\"process\":\"MindGrid\"}}",
            std::process::id(),
            current_timestamp_ms()
        );
        let _ = fs::write(&lock_path, lock_content);
        DocumentFileLock { lock_path }
    }

    /// 释放旁路锁：删除锁文件。Best-effort，失败不阻塞。
    pub fn release(&self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

impl Drop for DocumentFileLock {
    fn drop(&mut self) {
        self.release();
    }
}

pub fn read_document_archive(path: &Path) -> Result<DocumentSnapshot, String> {
    let mut repair_stats = RepairStats::default();

    read_document_archive_with_mode(path, LoadMode::Strict, &mut repair_stats)
}

pub fn repair_document_file_with_report(
    source_path: &Path,
    destination_path: &Path,
) -> Result<RepairOutcome, String> {
    let mut repair_stats = RepairStats::default();
    let repaired_document =
        read_document_archive_with_mode(source_path, LoadMode::Repair, &mut repair_stats)?;
    let timestamp_ms = current_timestamp_ms();

    write_document_archive(&repaired_document, destination_path, timestamp_ms)?;

    Ok(RepairOutcome {
        document: repaired_document,
        repaired_at_ms: timestamp_ms,
        changes: repair_stats.into_messages(),
    })
}

fn read_document_archive_with_mode(
    path: &Path,
    load_mode: LoadMode,
    repair_stats: &mut RepairStats,
) -> Result<DocumentSnapshot, String> {
    let file = File::open(path).map_err(|error| format!("无法打开文档: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("文档容器无效: {error}"))?;

    // Zip Bomb 防护：条目数量上限
    if archive.len() > ZIP_BOMB_MAX_ENTRIES {
        return Err(format!(
            "文档条目数 {} 超过上限 {}，疑似 Zip Bomb",
            archive.len(),
            ZIP_BOMB_MAX_ENTRIES
        ));
    }

    let mut entry_names = HashSet::new();
    let mut total_uncompressed: u64 = 0;

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("无法读取文档条目: {error}"))?;
        let name = entry.name().to_string();

        // Zip Slip 防护
        if name.starts_with('/') || name.contains("..") {
            return Err("文档容器包含非法路径".into());
        }

        if !entry_names.insert(name.clone()) {
            return Err("文档容器包含重复条目".into());
        }

        // Zip Bomb 防护：单条目大小 + 累计大小 + 压缩比
        let uncompressed = entry.size();
        let compressed = entry.compressed_size();
        if uncompressed > ZIP_BOMB_MAX_ENTRY_BYTES {
            return Err(format!(
                "条目 {name} 解压后 {uncompressed} 字节超过单条目上限 {ZIP_BOMB_MAX_ENTRY_BYTES}"
            ));
        }
        total_uncompressed = total_uncompressed.saturating_add(uncompressed);
        if total_uncompressed > ZIP_BOMB_MAX_UNCOMPRESSED_BYTES {
            return Err(format!(
                "文档解压后总大小超过上限 {ZIP_BOMB_MAX_UNCOMPRESSED_BYTES} 字节，疑似 Zip Bomb"
            ));
        }
        if compressed > 0 && uncompressed / compressed > ZIP_BOMB_MAX_COMPRESSION_RATIO {
            return Err(format!(
                "条目 {name} 压缩比 {}:{} 超过上限 {}，疑似 Zip Bomb",
                uncompressed,
                compressed,
                ZIP_BOMB_MAX_COMPRESSION_RATIO
            ));
        }
    }

    if !entry_names.contains("mimetype")
        || !entry_names.contains("manifest.json")
        || !entry_names.contains("document.json")
    {
        return Err("文档缺少必要条目".into());
    }

    let mut mimetype = String::new();
    archive
        .by_name("mimetype")
        .map_err(|error| format!("无法读取 mimetype: {error}"))?
        .read_to_string(&mut mimetype)
        .map_err(|error| format!("无法读取 mimetype 内容: {error}"))?;

    if mimetype.trim() != MIMETYPE {
        return Err("文档 mimetype 不受支持".into());
    }

    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|error| format!("无法读取 manifest.json: {error}"))?
        .read_to_string(&mut manifest_json)
        .map_err(|error| format!("无法读取 manifest.json 内容: {error}"))?;
    let manifest: ManifestSnapshot =
        serde_json::from_str(&manifest_json).map_err(|error| format!("manifest 无效: {error}"))?;

    if manifest.mimetype.trim() != MIMETYPE {
        return Err("manifest 中的 mimetype 不受支持".into());
    }

    let manifest_format_version = parse_format_version(&manifest.format_version)?;
    ensure_supported_format_version(manifest_format_version)?;

    let mut document_json = String::new();
    archive
        .by_name("document.json")
        .map_err(|error| format!("无法读取 document.json: {error}"))?
        .read_to_string(&mut document_json)
        .map_err(|error| format!("无法读取 document.json 内容: {error}"))?;

    let document_value: Value =
        serde_json::from_str(&document_json).map_err(|error| format!("文档内容无效: {error}"))?;
    let document = migrate_document_value(
        document_value,
        manifest_format_version,
        load_mode,
        repair_stats,
    )?;

    validate_document_snapshot(&document)?;

    Ok(document)
}

/// 读取完整 .mgd 归档内容：文档 + 资源 + 元数据 + 样式。
/// 在 `read_document_archive` 基础上额外加载可选的 metadata.json / styles.json / assets/。
pub fn read_document_archive_full(path: &Path) -> Result<MgdContents, String> {
    // Level 0-3：容器、语法、结构、语义校验（由 read_document_archive 完成）
    let document = read_document_archive(path)?;
    let timestamp_ms = current_timestamp_ms();

    // 重新打开归档读取可选条目
    let file = File::open(path).map_err(|error| format!("无法打开文档: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|error| format!("文档容器无效: {error}"))?;

    // metadata.json（可选：旧文档可能没有）
    let metadata = match archive.by_name("metadata.json") {
        Ok(mut entry) => {
            let mut json = String::new();
            entry
                .read_to_string(&mut json)
                .map_err(|error| format!("无法读取 metadata.json: {error}"))?;
            serde_json::from_str(&json)
                .map_err(|error| format!("metadata.json 无效: {error}"))?
        }
        Err(_) => DocumentMetadata::from_document(&document, timestamp_ms),
    };

    // styles.json（可选）
    let styles = match archive.by_name("styles.json") {
        Ok(mut entry) => {
            let mut json = String::new();
            entry
                .read_to_string(&mut json)
                .map_err(|error| format!("无法读取 styles.json: {error}"))?;
            Some(
                serde_json::from_str(&json)
                    .map_err(|error| format!("styles.json 无效: {error}"))?,
            )
        }
        Err(_) => None,
    };

    // assets/index.json + 资源文件（可选）
    let assets = AssetStore::load_from_zip(&mut archive)?;

    // Level 4 Hash 校验：验证所有资源字节流与索引 SHA-256 一致
    if let Err(hash_errors) = assets.verify_all_hashes() {
        return Err(format!("资源哈希校验失败: {}", hash_errors.join("; ")));
    }

    // 语义校验：文档引用的 asset_id 必须在索引中存在
    let referenced = AssetIndex::collect_referenced_asset_ids(&document);
    for asset_id in &referenced {
        if assets.index.find(asset_id).is_none() {
            return Err(format!("文档引用了不存在的资源: {asset_id}"));
        }
    }

    Ok(MgdContents {
        document,
        assets,
        metadata,
        styles,
    })
}

/// 完整性校验 Level 0-4（spec 14）：
/// - Level 0：容器（ZIP 有效、必要条目存在）
/// - Level 1：语法（JSON 可解析）
/// - Level 2：结构（必填字段存在）
/// - Level 3：语义（ID 唯一、引用有效）
/// - Level 4：Hash（资源 SHA-256 校验）
///
/// 正常保存至少通过 Level 3；`write_document_archive_full` 保存前调用此函数验证临时文件。
pub fn validate_archive_integrity(path: &Path) -> Result<(), String> {
    read_document_archive_full(path)?;
    Ok(())
}

pub fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_format_version(value: &str) -> Result<FormatVersion, String> {
    let mut parts = value.trim().split('.');
    let major = parts
        .next()
        .ok_or_else(|| "格式版本缺少 major".to_string())?
        .parse::<u64>()
        .map_err(|_| format!("无法解析格式版本: {value}"))?;
    let minor = parts
        .next()
        .ok_or_else(|| "格式版本缺少 minor".to_string())?
        .parse::<u64>()
        .map_err(|_| format!("无法解析格式版本: {value}"))?;
    let patch = parts
        .next()
        .ok_or_else(|| "格式版本缺少 patch".to_string())?
        .parse::<u64>()
        .map_err(|_| format!("无法解析格式版本: {value}"))?;

    if parts.next().is_some() {
        return Err(format!("无法解析格式版本: {value}"));
    }

    Ok(FormatVersion {
        major,
        minor,
        patch,
    })
}

fn ensure_supported_format_version(version: FormatVersion) -> Result<(), String> {
    // 接受内部 0.x 迁移文档与已发布的 1.0.0 / 1.1.0；其余视为不兼容的未来版本。
    if version.major == 0 {
        return Ok(());
    }

    if version.major == 1 && version.minor <= 1 {
        return Ok(());
    }

    Err(format!(
        "当前版本仅支持 .mgd 格式 1.0.0/1.1.0 和内部 0.x 迁移文档，收到 {}.{}.{}",
        version.major, version.minor, version.patch
    ))
}

fn migrate_document_value(
    mut document: Value,
    format_version: FormatVersion,
    load_mode: LoadMode,
    repair_stats: &mut RepairStats,
) -> Result<DocumentSnapshot, String> {
    let object = document
        .as_object_mut()
        .ok_or_else(|| "document.json 顶层结构无效".to_string())?;

    if format_version.major == 0 {
        object
            .entry("schemaVersion")
            .or_insert_with(|| Value::String(FORMAT_VERSION.to_string()));
        object
            .entry("revision")
            .or_insert_with(|| Value::Number(1_u64.into()));
    }

    if load_mode == LoadMode::Repair {
        normalize_document_metadata(object, repair_stats);
    }

    let first_sheet_id = {
        let sheets = object
            .get_mut("sheets")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "document.sheets 无效".to_string())?;

        if sheets.is_empty() {
            return Err("文档至少需要一个 Sheet".into());
        }

        let mut seen_sheet_ids = HashSet::new();
        let mut seen_topic_ids = HashSet::new();

        for (index, sheet) in sheets.iter_mut().enumerate() {
            let sheet_object = sheet
                .as_object_mut()
                .ok_or_else(|| "sheet 结构无效".to_string())?;

            if format_version.major == 0 || load_mode == LoadMode::Repair {
                sheet_object
                    .entry("title")
                    .or_insert_with(|| Value::String(format!("画布 {}", index + 1)));
            }

            if load_mode == LoadMode::Repair {
                if repair_identifier_field(sheet_object, "id", "sheet", &mut seen_sheet_ids) {
                    repair_stats.sheet_ids_regenerated += 1;
                }
                if repair_string_field(sheet_object, "title", || format!("画布 {}", index + 1)) {
                    repair_stats.sheet_titles_filled += 1;
                }
            }

            let root_topic = sheet_object
                .get_mut("rootTopic")
                .ok_or_else(|| "sheet.rootTopic 缺失".to_string())?;
            normalize_topic_value(root_topic, load_mode, &mut seen_topic_ids, repair_stats)?;
        }

        sheets
            .first()
            .and_then(Value::as_object)
            .and_then(|sheet| sheet.get("id"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "文档缺少有效的 Sheet ID".to_string())?
    };

    let active_sheet_id = object
        .get("activeSheetId")
        .and_then(Value::as_str)
        .filter(|sheet_id| {
            object
                .get("sheets")
                .and_then(Value::as_array)
                .map(|sheets| {
                    sheets.iter().any(|sheet| {
                        sheet.as_object().and_then(|value| value.get("id")).and_then(Value::as_str)
                            == Some(*sheet_id)
                    })
                })
                .unwrap_or(false)
        })
        .map(str::to_string)
        .unwrap_or(first_sheet_id);
    if object
        .get("activeSheetId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .as_deref()
        != Some(active_sheet_id.as_str())
        && load_mode == LoadMode::Repair
    {
        repair_stats.active_sheet_reassigned = true;
    }
    object.insert("activeSheetId".into(), Value::String(active_sheet_id));

    let schema_version = object
        .get("schemaVersion")
        .and_then(Value::as_str)
        .ok_or_else(|| "文档缺少 schemaVersion".to_string())?;
    let schema_format_version = parse_format_version(schema_version)?;
    ensure_supported_format_version(schema_format_version)?;

    // 1.1.0 相对 1.0.0 仅以可选字段方式新增内容，无需数据改写；
    // 任何受支持版本都在内存中迁移到当前 schema，保存时写入新格式。
    if schema_version != FORMAT_VERSION {
        object.insert("schemaVersion".into(), Value::String(FORMAT_VERSION.to_string()));
    }

    serde_json::from_value(document).map_err(|error| format!("文档内容无效: {error}"))
}

fn normalize_document_metadata(
    object: &mut serde_json::Map<String, Value>,
    repair_stats: &mut RepairStats,
) {
    if !matches!(object.get("documentId"), Some(Value::String(value)) if !value.trim().is_empty()) {
        object.insert("documentId".into(), Value::String(create_repair_id("doc")));
        repair_stats.document_id_regenerated = true;
    }

    if !matches!(object.get("revision"), Some(Value::Number(_))) {
        object.insert("revision".into(), Value::Number(1_u64.into()));
        repair_stats.revision_reset = true;
    }

    if object
        .get("schemaVersion")
        .and_then(Value::as_str)
        != Some(FORMAT_VERSION)
    {
        repair_stats.schema_version_rewritten = true;
    }

    object.insert("schemaVersion".into(), Value::String(FORMAT_VERSION.to_string()));
}

fn normalize_topic_value(
    topic: &mut Value,
    load_mode: LoadMode,
    seen_topic_ids: &mut HashSet<String>,
    repair_stats: &mut RepairStats,
) -> Result<(), String> {
    let topic_object = topic
        .as_object_mut()
        .ok_or_else(|| "topic 结构无效".to_string())?;

    if load_mode == LoadMode::Repair {
        if repair_identifier_field(topic_object, "id", "topic", seen_topic_ids) {
            repair_stats.topic_ids_regenerated += 1;
        }
        if repair_string_field(topic_object, "text", || "未命名主题".to_string()) {
            repair_stats.topic_texts_filled += 1;
        }
    }

    topic_object
        .entry("collapsed")
        .or_insert_with(|| Value::Bool(false));

    let children = topic_object
        .entry("children")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| "topic.children 无效".to_string())?;

    for child in children {
        normalize_topic_value(child, load_mode, seen_topic_ids, repair_stats)?;
    }

    Ok(())
}

fn repair_identifier_field(
    object: &mut serde_json::Map<String, Value>,
    field: &str,
    prefix: &str,
    seen_ids: &mut HashSet<String>,
) -> bool {
    let next_id = object
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .filter(|value| !seen_ids.contains(*value))
        .map(str::to_string)
        .unwrap_or_else(|| create_repair_id(prefix));
    let changed = object.get(field).and_then(Value::as_str) != Some(next_id.as_str());

    seen_ids.insert(next_id.clone());
    object.insert(field.into(), Value::String(next_id));

    changed
}

fn repair_string_field<F>(
    object: &mut serde_json::Map<String, Value>,
    field: &str,
    fallback: F,
) -> bool
where
    F: FnOnce() -> String,
{
    let next_value = object
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(fallback);
    let changed = object.get(field).and_then(Value::as_str) != Some(next_value.as_str());

    object.insert(field.into(), Value::String(next_value));

    changed
}

fn create_repair_id(prefix: &str) -> String {
    format!(
        "{}_repair_{:x}_{:x}",
        prefix,
        current_timestamp_ms(),
        REPAIR_ID_COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

impl RepairStats {
    fn into_messages(self) -> Vec<String> {
        let mut messages = Vec::new();

        if self.schema_version_rewritten {
            messages.push("已统一文档 schemaVersion 到 1.1.0".to_string());
        }
        if self.document_id_regenerated {
            messages.push("已重新生成文档 ID".to_string());
        }
        if self.revision_reset {
            messages.push("已重置损坏的文档 revision".to_string());
        }
        if self.active_sheet_reassigned {
            messages.push("已重新指定有效的活动画布".to_string());
        }
        if self.sheet_ids_regenerated > 0 {
            messages.push(format!("已重建 {} 个画布 ID", self.sheet_ids_regenerated));
        }
        if self.sheet_titles_filled > 0 {
            messages.push(format!("已补齐 {} 个画布标题", self.sheet_titles_filled));
        }
        if self.topic_ids_regenerated > 0 {
            messages.push(format!("已重建 {} 个主题 ID", self.topic_ids_regenerated));
        }
        if self.topic_texts_filled > 0 {
            messages.push(format!("已补齐 {} 个主题文本", self.topic_texts_filled));
        }

        if messages.is_empty() {
            messages.push("未检测到结构问题，已重新生成兼容副本".to_string());
        }

        messages
    }
}

fn validate_document_snapshot(document: &DocumentSnapshot) -> Result<(), String> {
    if document.document_id.trim().is_empty() {
        return Err("文档 documentId 不能为空".into());
    }

    if document.sheets.is_empty() {
        return Err("文档至少需要一个 Sheet".into());
    }

    let mut sheet_ids = HashSet::new();
    let mut has_active_sheet = false;
    let mut topic_ids = HashSet::new();

    for sheet in &document.sheets {
        if !sheet_ids.insert(sheet.id.clone()) {
            return Err(format!("检测到重复 Sheet ID: {}", sheet.id));
        }

        if sheet.id == document.active_sheet_id {
            has_active_sheet = true;
        }

        validate_topic_tree(&sheet.root_topic, &mut topic_ids)?;
    }

    if !has_active_sheet {
        return Err("activeSheetId 没有对应的 Sheet".into());
    }

    Ok(())
}

fn validate_topic_tree(
    topic: &TopicSnapshot,
    topic_ids: &mut HashSet<String>,
) -> Result<(), String> {
    if topic.id.trim().is_empty() {
        return Err("主题 ID 不能为空".into());
    }

    if !topic_ids.insert(topic.id.clone()) {
        return Err(format!("检测到重复 Topic ID: {}", topic.id));
    }

    for child in &topic.children {
        validate_topic_tree(child, topic_ids)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        read_document_archive, read_document_archive_full, repair_document_file_with_report,
        write_document_archive, write_document_archive_full, validate_archive_integrity,
        DocumentMetadata, ManifestSnapshot, MgdContents, FORMAT_VERSION, MIMETYPE,
    };
    use crate::app::assets::AssetStore;
    use crate::domain::document::{
        ChartType, DocumentSnapshot, Relationship, TopicImage, TopicLink,
        TopicMarker, TopicTask, TopicTaskStatus,
    };
    use serde_json::json;
    use std::fs::File;
    use std::io::Write;
    use zip::write::FileOptions;
    use zip::{CompressionMethod, ZipWriter};

    fn write_raw_archive(
        path: &std::path::Path,
        manifest: serde_json::Value,
        document: serde_json::Value,
    ) {
        let file = File::create(path).expect("archive should be created");
        let mut writer = ZipWriter::new(file);
        let stored_options = FileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated_options = FileOptions::default().compression_method(CompressionMethod::Deflated);

        writer
            .start_file("mimetype", stored_options)
            .expect("mimetype entry should exist");
        writer
            .write_all(MIMETYPE.as_bytes())
            .expect("mimetype should be written");
        writer
            .start_file("manifest.json", deflated_options)
            .expect("manifest entry should exist");
        writer
            .write_all(
                serde_json::to_string_pretty(&manifest)
                    .expect("manifest should serialize")
                    .as_bytes(),
            )
            .expect("manifest should be written");
        writer
            .start_file("document.json", deflated_options)
            .expect("document entry should exist");
        writer
            .write_all(
                serde_json::to_string_pretty(&document)
                    .expect("document should serialize")
                    .as_bytes(),
            )
            .expect("document should be written");
        writer.finish().expect("archive should finish");
    }

    #[test]
    fn document_archive_round_trip_preserves_document() {
        let document = DocumentSnapshot::new_default();
        let temp_path = std::env::temp_dir().join(format!(
            "mindgrid-persistence-test-{}.mgd",
            document.document_id
        ));

        write_document_archive(&document, &temp_path, 1_234).expect("archive should be written");
        let restored =
            read_document_archive(&temp_path).expect("archive should be restored");

        assert_eq!(restored, document);

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn document_archive_round_trip_preserves_rich_topic_fields() {
        let mut document = DocumentSnapshot::new_default();
        let root = &mut document.sheets[0].root_topic;
        root.style_ref = Some("style/level-1".into());
        root.markers = vec![TopicMarker {
            id: "priority-1".into(),
            label: Some("高优先级".into()),
        }];
        root.labels = vec!["重点".into(), "Q3".into()];
        root.notes = Some("这是备注内容".into());
        root.link = Some(TopicLink {
            url: "https://example.com".into(),
            title: Some("示例".into()),
        });
        root.task = Some(TopicTask {
            status: TopicTaskStatus::Started,
            start_date_ms: Some(1_690_000_000_000),
            due_date_ms: Some(1_700_000_000_000),
            priority: Some(2),
        });

        document.sheets[0].chart_type = Some(ChartType::Logic);
        document.relationships = vec![Relationship {
            id: "rel_1".into(),
            from_topic_id: document.sheets[0].root_topic.id.clone(),
            to_topic_id: document.sheets[0].root_topic.children[0].id.clone(),
            label: Some("关联".into()),
            style_ref: None,
            control_points: Vec::new(),
        }];

        let temp_path = std::env::temp_dir().join(format!(
            "mindgrid-rich-round-trip-{}.mgd",
            document.document_id
        ));

        write_document_archive(&document, &temp_path, 5_678).expect("archive should be written");
        let restored = read_document_archive(&temp_path).expect("archive should be restored");

        assert_eq!(restored, document);
        assert_eq!(restored.schema_version, FORMAT_VERSION);
        assert_eq!(restored.sheets[0].chart_type, Some(ChartType::Logic));
        assert_eq!(restored.sheets[0].effective_chart_type(), ChartType::Logic);
        assert_eq!(restored.sheets[0].root_topic.markers.len(), 1);
        assert_eq!(restored.sheets[0].root_topic.task.as_ref().unwrap().status, TopicTaskStatus::Started);
        assert_eq!(restored.relationships.len(), 1);

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn archive_round_trip_preserves_assets_and_metadata() {
        let mut document = DocumentSnapshot::new_default();
        let mut assets = AssetStore::default();

        // 注册一张真实图片资源
        let image_bytes = b"\x89PNG\r\n\x1a\nfake-png-body".to_vec();
        let asset_id = assets.register(image_bytes.clone(), "image/png", Some(320), Some(240));

        // 主题引用该资源
        document.sheets[0].root_topic.image = Some(TopicImage {
            asset_id: asset_id.clone(),
            width: Some(320),
            height: Some(240),
        });

        let metadata = DocumentMetadata {
            title: "资源测试文档".into(),
            author: Some("测试".into()),
            created_at_ms: 1_000,
            modified_at_ms: 2_000,
            app_version: "0.1.0".into(),
            description: Some("验证资源与元数据往返".into()),
        };

        let contents = MgdContents {
            document: document.clone(),
            assets: assets.clone(),
            metadata: metadata.clone(),
            styles: Some(json!({ "themes": [] })),
        };

        let temp_path = std::env::temp_dir().join(format!(
            "mindgrid-assets-round-trip-{}.mgd",
            document.document_id
        ));

        write_document_archive_full(&contents, &temp_path, 5_678)
            .expect("full archive should be written");

        // 完整读取并验证
        let restored = read_document_archive_full(&temp_path)
            .expect("full archive should be read");

        assert_eq!(restored.document, document);
        assert_eq!(restored.metadata, metadata);
        assert_eq!(restored.styles, Some(json!({ "themes": [] })));
        assert_eq!(restored.assets.index.assets.len(), 1);
        assert_eq!(restored.assets.index.assets[0].asset_id, asset_id);
        assert_eq!(restored.assets.get_bytes(&asset_id), Some(image_bytes.as_slice()));

        // Level 0-4 完整性校验通过
        validate_archive_integrity(&temp_path).expect("integrity check should pass");

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn archive_rejects_dangling_asset_reference() {
        let mut document = DocumentSnapshot::new_default();
        // 引用一个不存在的资源
        document.sheets[0].root_topic.image = Some(TopicImage {
            asset_id: "sha256-nonexistent.png".into(),
            width: None,
            height: None,
        });

        let contents = MgdContents::from_document(document, 1_234);

        let temp_path = std::env::temp_dir().join("mindgrid-dangling-asset-test.mgd");

        let error = write_document_archive_full(&contents, &temp_path, 1_234)
            .expect_err("should reject dangling asset reference");

        assert!(error.contains("引用了不存在的资源") || error.contains("临时文档校验失败"));

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn migrates_1_0_0_schema_to_current_on_load() {
        let temp_path = std::env::temp_dir().join("mindgrid-1-0-0-migration-test.mgd");
        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: "1.0.0".into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        })
        .expect("manifest should serialize");
        let document = json!({
            "schemaVersion": "1.0.0",
            "documentId": "legacy_1_0_0",
            "revision": 7,
            "activeSheetId": "sheet_1",
            "sheets": [{
                "id": "sheet_1",
                "title": "主画布",
                "rootTopic": {
                    "id": "topic_root",
                    "text": "中心主题",
                    "collapsed": false,
                    "children": []
                }
            }]
        });

        write_raw_archive(&temp_path, manifest, document);

        let restored = read_document_archive(&temp_path).expect("1.0.0 archive should load and migrate");

        assert_eq!(restored.schema_version, FORMAT_VERSION);
        assert_eq!(restored.schema_version, "1.1.0");
        assert_eq!(restored.document_id, "legacy_1_0_0");
        assert_eq!(restored.revision, 7);
        // 新增字段以默认值回填，不破坏旧文档结构。
        assert!(restored.relationships.is_empty());
        assert!(restored.sheets[0].chart_type.is_none());
        assert_eq!(restored.sheets[0].effective_chart_type(), ChartType::Mindmap);
        assert!(restored.sheets[0].root_topic.markers.is_empty());

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn reads_internal_legacy_archive_by_migrating_missing_fields() {
        let temp_path = std::env::temp_dir().join("mindgrid-legacy-migration-test.mgd");
        let manifest = json!({
            "formatVersion": "0.9.0",
            "mimetype": MIMETYPE,
            "generatedAtMs": 1234
        });
        let document = json!({
            "schemaVersion": "0.9.0",
            "documentId": "legacy_doc",
            "revision": 1,
            "sheets": [{
                "id": "sheet_legacy",
                "rootTopic": {
                    "id": "topic_root",
                    "text": "旧文档",
                    "children": [{
                        "id": "topic_child",
                        "text": "旧子主题",
                        "children": []
                    }]
                }
            }]
        });

        write_raw_archive(&temp_path, manifest, document);

        let restored =
            read_document_archive(&temp_path).expect("legacy archive should be migrated");

        assert_eq!(restored.schema_version, FORMAT_VERSION);
        assert_eq!(restored.active_sheet_id, "sheet_legacy");
        assert!(!restored.sheets[0].root_topic.collapsed);
        assert_eq!(restored.sheets[0].title, "画布 1");

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn rejects_unsupported_future_format_versions() {
        let temp_path = std::env::temp_dir().join("mindgrid-future-format-test.mgd");
        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: "2.0.0".into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        })
        .expect("manifest should serialize");
        let document = json!({
            "schemaVersion": "2.0.0",
            "documentId": "future_doc",
            "revision": 1,
            "activeSheetId": "sheet_1",
            "sheets": [{
                "id": "sheet_1",
                "title": "主画布",
                "rootTopic": {
                    "id": "topic_root",
                    "text": "未来文档",
                    "collapsed": false,
                    "children": []
                }
            }]
        });

        write_raw_archive(&temp_path, manifest, document);

        let error = read_document_archive(&temp_path).expect_err("future format should be rejected");

        assert!(error.contains("当前版本仅支持 .mgd 格式 1.0.0/1.1.0"));

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn rejects_duplicate_topic_ids_in_document_tree() {
        let temp_path = std::env::temp_dir().join("mindgrid-duplicate-topic-test.mgd");
        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: FORMAT_VERSION.into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        })
        .expect("manifest should serialize");
        let document = json!({
            "schemaVersion": FORMAT_VERSION,
            "documentId": "dup_doc",
            "revision": 1,
            "activeSheetId": "sheet_1",
            "sheets": [{
                "id": "sheet_1",
                "title": "主画布",
                "rootTopic": {
                    "id": "topic_root",
                    "text": "中心主题",
                    "collapsed": false,
                    "children": [{
                        "id": "topic_dup",
                        "text": "A",
                        "collapsed": false,
                        "children": []
                    }, {
                        "id": "topic_dup",
                        "text": "B",
                        "collapsed": false,
                        "children": []
                    }]
                }
            }]
        });

        write_raw_archive(&temp_path, manifest, document);

        let error = read_document_archive(&temp_path).expect_err("duplicate topic ids should fail");

        assert!(error.contains("重复 Topic ID"));

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn repairs_duplicate_ids_and_invalid_active_sheet_into_a_new_archive() {
        let source_path = std::env::temp_dir().join("mindgrid-repair-source-test.mgd");
        let destination_path = std::env::temp_dir().join("mindgrid-repair-destination-test.mgd");
        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: FORMAT_VERSION.into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        })
        .expect("manifest should serialize");
        let document = json!({
            "schemaVersion": FORMAT_VERSION,
            "documentId": "",
            "revision": "broken",
            "activeSheetId": "missing_sheet",
            "sheets": [{
                "id": "sheet_dup",
                "title": "",
                "rootTopic": {
                    "id": "topic_root",
                    "text": "",
                    "collapsed": false,
                    "children": [{
                        "id": "topic_dup",
                        "text": "A",
                        "collapsed": false,
                        "children": []
                    }, {
                        "id": "topic_dup",
                        "text": "B",
                        "collapsed": false,
                        "children": []
                    }]
                }
            }, {
                "id": "sheet_dup",
                "title": "备用画布",
                "rootTopic": {
                    "id": "",
                    "text": "根主题",
                    "collapsed": false,
                    "children": []
                }
            }]
        });

        write_raw_archive(&source_path, manifest, document);

        let repair_outcome = repair_document_file_with_report(&source_path, &destination_path)
            .expect("repair should produce a new readable archive");
        let restored = read_document_archive(&destination_path)
            .expect("repaired archive should pass strict loading");

        assert_eq!(restored, repair_outcome.document);
        assert_eq!(restored.active_sheet_id, restored.sheets[0].id);
        assert!(!restored.document_id.trim().is_empty());
        assert_eq!(restored.sheets[0].title, "画布 1");
        assert_eq!(restored.sheets[0].root_topic.text, "未命名主题");
        assert_ne!(restored.sheets[0].id, restored.sheets[1].id);
        assert_ne!(
            restored.sheets[0].root_topic.children[0].id,
            restored.sheets[0].root_topic.children[1].id
        );
        assert!(!restored.sheets[1].root_topic.id.trim().is_empty());
        assert!(repair_outcome
            .changes
            .iter()
            .any(|item| item.contains("已重新指定有效的活动画布")));
        assert!(repair_outcome
            .changes
            .iter()
            .any(|item| item.contains("已重建 1 个画布 ID")));
        assert!(repair_outcome
            .changes
            .iter()
            .any(|item| item.contains("已重建 2 个主题 ID")));

        let _ = std::fs::remove_file(source_path);
        let _ = std::fs::remove_file(destination_path);
    }

    #[test]
    fn preserves_unknown_fields_through_round_trip() {
        let temp_path = std::env::temp_dir().join("mindgrid-unknown-fields-test.mgd");
        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: FORMAT_VERSION.into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        })
        .expect("manifest should serialize");
        // document / sheet / topic 各携带一个 schema 未识别字段，验证 spec 16 不静默删除。
        let document = json!({
            "schemaVersion": FORMAT_VERSION,
            "documentId": "unknown_doc",
            "revision": 1,
            "activeSheetId": "sheet_1",
            "documentFutureField": { "nested": true },
            "sheets": [{
                "id": "sheet_1",
                "title": "主画布",
                "sheetFutureField": 42,
                "rootTopic": {
                    "id": "topic_root",
                    "text": "中心主题",
                    "collapsed": false,
                    "children": [{
                        "id": "topic_child",
                        "text": "子主题",
                        "collapsed": false,
                        "children": [],
                        "topicFutureField": "preserved"
                    }]
                }
            }]
        });

        write_raw_archive(&temp_path, manifest, document);

        let restored = read_document_archive(&temp_path)
            .expect("archive with unknown fields should load");

        // 未知字段被 extra 捕获并原样保留
        assert_eq!(
            restored.extra.get("documentFutureField"),
            Some(&json!({ "nested": true }))
        );
        assert_eq!(
            restored.sheets[0].extra.get("sheetFutureField"),
            Some(&json!(42))
        );
        assert_eq!(
            restored.sheets[0]
                .root_topic
                .children[0]
                .extra
                .get("topicFutureField"),
            Some(&json!("preserved"))
        );

        // 二次写入后仍然保留
        let temp_path_2 = std::env::temp_dir().join("mindgrid-unknown-fields-test-2.mgd");
        write_document_archive(&restored, &temp_path_2, 9_999)
            .expect("second write should succeed");
        let restored_2 = read_document_archive(&temp_path_2)
            .expect("second read should succeed");
        assert_eq!(
            restored_2.extra.get("documentFutureField"),
            Some(&json!({ "nested": true }))
        );
        assert_eq!(
            restored_2.sheets[0]
                .root_topic
                .children[0]
                .extra
                .get("topicFutureField"),
            Some(&json!("preserved"))
        );

        let _ = std::fs::remove_file(temp_path);
        let _ = std::fs::remove_file(temp_path_2);
    }

    #[test]
    fn rejects_zip_bomb_with_extreme_compression_ratio() {
        let temp_path = std::env::temp_dir().join("mindgrid-zip-bomb-test.mgd");
        let file = File::create(&temp_path).expect("archive should be created");
        let mut writer = ZipWriter::new(file);
        let stored_options = FileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated_options = FileOptions::default().compression_method(CompressionMethod::Deflated);

        // 必要条目
        writer.start_file("mimetype", stored_options).expect("mimetype entry");
        writer.write_all(MIMETYPE.as_bytes()).expect("mimetype written");

        let manifest = serde_json::to_value(ManifestSnapshot {
            format_version: FORMAT_VERSION.into(),
            mimetype: MIMETYPE.into(),
            generated_at_ms: 1234,
        }).expect("manifest serialize");
        writer.start_file("manifest.json", deflated_options).expect("manifest entry");
        writer.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes()).expect("manifest written");

        let document = json!({
            "schemaVersion": FORMAT_VERSION,
            "documentId": "bomb_doc",
            "revision": 1,
            "activeSheetId": "sheet_1",
            "sheets": [{
                "id": "sheet_1",
                "title": "主画布",
                "rootTopic": { "id": "topic_root", "text": "炸弹", "collapsed": false, "children": [] }
            }]
        });
        writer.start_file("document.json", deflated_options).expect("document entry");
        writer.write_all(serde_json::to_string_pretty(&document).unwrap().as_bytes()).expect("document written");

        // 高压缩比条目：200KB 全零 → deflate 后约 200 字节，压缩比 >> 100
        let bomb_payload = vec![0u8; 200_000];
        writer.start_file("bomb.dat", deflated_options).expect("bomb entry");
        writer.write_all(&bomb_payload).expect("bomb written");

        writer.finish().expect("archive finish");

        let error = read_document_archive(&temp_path).expect_err("zip bomb should be rejected");
        assert!(error.contains("Zip Bomb"), "expected zip bomb error, got: {error}");

        let _ = std::fs::remove_file(temp_path);
    }
}
