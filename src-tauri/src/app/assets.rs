//! 资源管理模块（.mgd spec 7：Assets）。
//!
//! 图片与附件不使用 Base64 内嵌 document.json，而是通过 Asset ID 引用 `assets/` 目录下的
//! 独立文件。Asset ID 形如 `sha256-<digest>.<ext>`，使用 SHA-256 做去重与完整性校验
//! （Level 4 Hash）。保存前执行 GC，移除文档不再引用的资源，避免 .mgd 膨胀。

use crate::domain::document::{DocumentSnapshot, TopicSnapshot};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, Write};

/// 资源类别，决定在 `assets/` 下的子目录。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetKind {
    Image,
    Icon,
    Attachment,
    /// 主题语音备注（录制的音频）。
    ///
    /// ⚠️ **刻意不从 MIME 推**：`from_mime_type` 里 `audio/*` 仍归 `Attachment`，
    /// 因为"附了一个 mp3"和"录了一段语音"是两件事，落错目录会让资源区看起来莫名其妙。
    /// 语音备注由命令层用 `register_with_kind` 显式指定 kind。
    VoiceNote,
}

impl AssetKind {
    /// 在 `assets/` 下的子目录名。
    pub fn subdirectory(&self) -> &'static str {
        match self {
            AssetKind::Image => "images",
            AssetKind::Icon => "icons",
            AssetKind::Attachment => "attachments",
            AssetKind::VoiceNote => "voice-notes",
        }
    }

    /// 从 MIME 类型推断资源类别。
    pub fn from_mime_type(mime_type: &str) -> AssetKind {
        if mime_type.starts_with("image/") {
            AssetKind::Image
        } else if mime_type == "image/svg+xml" {
            AssetKind::Icon
        } else {
            AssetKind::Attachment
        }
    }
}

/// 单条资源元数据，对应 `assets/index.json` 中的一项。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssetEntry {
    /// 资源 ID，形如 `sha256-<digest>.<ext>`。
    pub asset_id: String,
    /// SHA-256 十六进制摘要（不含 `sha256-` 前缀与扩展名）。
    pub sha256: String,
    /// 资源类别。
    pub kind: AssetKind,
    /// 原始字节数。
    pub byte_size: u64,
    /// MIME 类型，如 `image/png`。
    pub mime_type: String,
    /// 图片宽度（仅图片资源）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    /// 图片高度（仅图片资源）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

impl AssetEntry {
    /// 资源在 ZIP 内的存储路径，如 `assets/images/sha256-abc.png`。
    pub fn zip_path(&self) -> String {
        format!("assets/{}/{}", self.kind.subdirectory(), self.asset_id)
    }
}

/// 资源索引，对应 `assets/index.json`。
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndex {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub assets: Vec<AssetEntry>,
}

impl AssetIndex {
    /// 按 asset_id 查找资源条目。
    pub fn find(&self, asset_id: &str) -> Option<&AssetEntry> {
        self.assets.iter().find(|a| a.asset_id == asset_id)
    }

    /// 按 SHA-256 查找资源条目（去重判定）。
    pub fn find_by_sha256(&self, sha256: &str) -> Option<&AssetEntry> {
        self.assets.iter().find(|a| a.sha256 == sha256)
    }

    /// 计算原始字节的 SHA-256 十六进制摘要。
    pub fn compute_sha256(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        hex::encode(hasher.finalize())
    }

    /// 从 SHA-256 摘要与扩展名构建 asset_id。
    pub fn build_asset_id(sha256: &str, extension: &str) -> String {
        format!("sha256-{sha256}.{extension}")
    }

    /// 从 MIME 类型推断扩展名（小写，不含点）。
    pub fn extension_for_mime_type(mime_type: &str) -> &'static str {
        // MIME 可能带参数（`audio/webm;codecs=opus`），按分号前的主体匹配
        let base = mime_type.split(';').next().unwrap_or(mime_type).trim();
        match base {
            "image/png" => "png",
            "image/jpeg" => "jpg",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/svg+xml" => "svg",
            "image/bmp" => "bmp",
            "application/pdf" => "pdf",
            // 录音：与 `lib/document/voice-note.ts` 的 `voiceNoteFileExtension` 同一口径。
            // 扩展名只影响资源区里的文件名与"导出后用系统播放器能不能打开"。
            "audio/webm" => "webm",
            "audio/mp4" | "audio/m4a" | "audio/x-m4a" => "m4a",
            "audio/ogg" => "ogg",
            "audio/mpeg" => "mp3",
            "audio/wav" | "audio/x-wav" => "wav",
            _ => "bin",
        }
    }

    /// 扫描文档树，收集所有被引用的 asset_id
    /// （来自 topic.image / topic.attachment / topic.voice_note）。
    /// 用于 GC 与引用计数验证。
    ///
    /// ⚠️ **浮动主题也要扫**（曾经漏过）：它们在 `rootTopic` 树之外，
    /// 漏掉的话"给浮动主题配了图"的用户在**保存**时会被 GC 把图当垃圾删掉，
    /// 而且要等下次打开文件才发现（与附件那轮踩的是同一类坑）。
    /// ⚠️ **新增带资源的主题字段时，`collect_topic_asset_ids` 必须同步加一处**，
    /// 漏掉就是"保存后录音消失"。
    pub fn collect_referenced_asset_ids(document: &DocumentSnapshot) -> HashSet<String> {
        let mut ids = HashSet::new();
        for sheet in &document.sheets {
            collect_topic_asset_ids(&sheet.root_topic, &mut ids);
            for topic in &sheet.floating_topics {
                collect_topic_asset_ids(topic, &mut ids);
            }
        }
        ids
    }

    /// GC：移除索引中未被 `referenced` 集合引用的资源，返回被移除的条目。
    /// 调用方应同步删除 ZIP 内对应的资源文件。
    pub fn garbage_collect(
        &mut self,
        referenced: &HashSet<String>,
    ) -> Vec<AssetEntry> {
        let (keep, remove): (Vec<_>, Vec<_>) =
            self.assets.drain(..).partition(|a| referenced.contains(&a.asset_id));
        self.assets = keep;
        remove
    }

    /// Level 4 Hash 校验：验证给定字节流的 SHA-256 与条目记录的摘要一致。
    pub fn verify_hash(entry: &AssetEntry, bytes: &[u8]) -> Result<(), String> {
        let actual = Self::compute_sha256(bytes);
        if actual == entry.sha256 {
            Ok(())
        } else {
            Err(format!(
                "资源 {} 的 SHA-256 校验失败：期望 {}，实际 {}",
                entry.asset_id, entry.sha256, actual
            ))
        }
    }
}

/// 内存资源存储：索引 + 字节缓冲。保存时写入 .mgd，加载时从 .mgd 读出。
#[derive(Debug, Clone, Default)]
pub struct AssetStore {
    pub index: AssetIndex,
    /// asset_id → 原始字节。
    pub blobs: HashMap<String, Vec<u8>>,
}

impl AssetStore {
    /// 注册一个新资源：计算 SHA-256，若已存在相同摘要则复用（去重），否则新增。
    /// 返回资源 ID（可能是新增的或复用已有的）。
    pub fn register(
        &mut self,
        bytes: Vec<u8>,
        mime_type: &str,
        width: Option<u32>,
        height: Option<u32>,
    ) -> String {
        let kind = AssetKind::from_mime_type(mime_type);
        self.register_with_kind(bytes, mime_type, kind, width, height)
    }

    /// 与 `register` 相同，但**显式指定 kind**（语音备注用它，
    /// 因为 `audio/*` 从 MIME 推出来的默认类别是附件，见 `AssetKind::VoiceNote` 的说明）。
    ///
    /// ⚠️ 去重是按**内容**的：若同一份字节先以附件身份登记过，这里会复用那一条
    /// （kind 仍是 Attachment）。资源本身照样能被正确解析（读取只认 asset_id），
    /// 只是它在资源区里的目录不是 `voice-notes/`。这是内容寻址的固有取舍，不是缺陷。
    pub fn register_with_kind(
        &mut self,
        bytes: Vec<u8>,
        mime_type: &str,
        kind: AssetKind,
        width: Option<u32>,
        height: Option<u32>,
    ) -> String {
        let sha256 = AssetIndex::compute_sha256(&bytes);

        // 去重：相同内容复用已有条目
        if let Some(existing) = self.index.find_by_sha256(&sha256) {
            return existing.asset_id.clone();
        }

        let extension = AssetIndex::extension_for_mime_type(mime_type);
        let asset_id = AssetIndex::build_asset_id(&sha256, extension);
        let byte_size = bytes.len() as u64;

        let entry = AssetEntry {
            asset_id: asset_id.clone(),
            sha256,
            kind,
            byte_size,
            mime_type: mime_type.to_string(),
            width,
            height,
        };

        self.index.assets.push(entry);
        self.blobs.insert(asset_id.clone(), bytes);
        asset_id
    }

    /// 读取资源字节。
    pub fn get_bytes(&self, asset_id: &str) -> Option<&[u8]> {
        self.blobs.get(asset_id).map(Vec::as_slice)
    }

    /// 执行 GC：移除未被文档引用的资源，返回被移除的 asset_id 列表。
    pub fn garbage_collect(&mut self, document: &DocumentSnapshot) -> Vec<String> {
        let referenced = AssetIndex::collect_referenced_asset_ids(document);
        let removed = self.index.garbage_collect(&referenced);
        let removed_ids: Vec<String> = removed.iter().map(|e| e.asset_id.clone()).collect();
        for id in &removed_ids {
            self.blobs.remove(id);
        }
        removed_ids
    }

    /// Level 4 Hash 校验：验证所有资源的字节流与索引记录的 SHA-256 一致。
    /// 用于保存前自检与加载后校验。
    pub fn verify_all_hashes(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        for entry in &self.index.assets {
            match self.blobs.get(&entry.asset_id) {
                Some(bytes) => {
                    if let Err(message) = AssetIndex::verify_hash(entry, bytes) {
                        errors.push(message);
                    }
                }
                None => {
                    errors.push(format!("资源 {} 的字节流缺失", entry.asset_id));
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// 从 ZIP 归档加载资源索引与字节流。
    /// 读取 `assets/index.json` 以及 `assets/<subdir>/<asset_id>` 文件。
    pub fn load_from_zip<R: Read + Seek>(
        archive: &mut zip::ZipArchive<R>,
    ) -> Result<Self, String> {
        let mut store = AssetStore::default();

        // 读取 assets/index.json（可选：旧文档可能没有资源）
        let index_json = match archive.by_name("assets/index.json") {
            Ok(mut entry) => {
                let mut json = String::new();
                entry
                    .read_to_string(&mut json)
                    .map_err(|error| format!("无法读取 assets/index.json: {error}"))?;
                json
            }
            Err(_) => return Ok(store),
        };

        store.index = serde_json::from_str(&index_json)
            .map_err(|error| format!("assets/index.json 无效: {error}"))?;

        // 逐个加载资源字节
        for entry in &store.index.assets {
            let path = entry.zip_path();
            let mut zip_entry = archive
                .by_name(&path)
                .map_err(|error| format!("无法读取资源 {path}: {error}"))?;
            let mut bytes = Vec::new();
            zip_entry
                .read_to_end(&mut bytes)
                .map_err(|error| format!("无法读取资源内容 {path}: {error}"))?;
            store.blobs.insert(entry.asset_id.clone(), bytes);
        }

        Ok(store)
    }

    /// 将资源索引与字节流写入 ZIP 归档。
    pub fn write_to_zip<W: Write + Seek>(
        &self,
        writer: &mut zip::ZipWriter<W>,
        options: zip::write::FileOptions,
    ) -> Result<(), String> {
        // 先写 index.json（即使为空也写入，标明资源区结构）
        writer
            .start_file("assets/index.json", options)
            .map_err(|error| format!("无法写入 assets/index.json: {error}"))?;
        let index_json = serde_json::to_string_pretty(&self.index)
            .map_err(|error| format!("无法序列化 assets/index.json: {error}"))?;
        writer
            .write_all(index_json.as_bytes())
            .map_err(|error| format!("无法写入 assets/index.json 内容: {error}"))?;

        // 写入各资源文件
        for entry in &self.index.assets {
            let path = entry.zip_path();
            let bytes = self.blobs.get(&entry.asset_id).ok_or_else(|| {
                format!("资源 {} 的字节流缺失，无法写入", entry.asset_id)
            })?;

            writer
                .start_file(&path, options)
                .map_err(|error| format!("无法写入资源 {path}: {error}"))?;
            writer
                .write_all(bytes)
                .map_err(|error| format!("无法写入资源内容 {path}: {error}"))?;
        }

        Ok(())
    }
}

/// 标准 Base64 字母表（RFC 4648 §4），仅用于 data URL 的单向编码。
const BASE64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// 将字节流编码为标准 Base64 字符串（RFC 4648 标准字母表，带 `=` 填充）。
///
/// 不引入 `base64` crate：离线构建环境无法保证依赖可拉取，而 data URL
/// 只需要单向编码，实现成本可控且已有单测覆盖。
pub fn encode_base64(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        // 不足 3 字节的尾块，缺失位补 0，对应输出位用 `=` 填充。
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let group = (b0 << 16) | (b1 << 8) | b2;

        encoded.push(BASE64_ALPHABET[((group >> 18) & 0x3f) as usize] as char);
        encoded.push(BASE64_ALPHABET[((group >> 12) & 0x3f) as usize] as char);
        encoded.push(if chunk.len() > 1 {
            BASE64_ALPHABET[((group >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        encoded.push(if chunk.len() > 2 {
            BASE64_ALPHABET[(group & 0x3f) as usize] as char
        } else {
            '='
        });
    }

    encoded
}

/// Base64 字符 → 6 位值。非字母表字符（含 `=`、空白）返回 None。
fn base64_value(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// 解码标准 Base64（容忍空白与 `=` 填充）。
///
/// 与 `encode_base64` 相对：录音在 WebView 里是 `Blob`，落库时统一走
/// `data:` URL，于是 Rust 侧需要能解开它。同样不引 `base64` crate，理由见上。
pub fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut group: u32 = 0;
    let mut count: usize = 0;

    for byte in input.bytes() {
        // 填充之后没有有效数据，直接收尾
        if byte == b'=' {
            break;
        }
        if byte.is_ascii_whitespace() {
            continue;
        }
        let value = base64_value(byte)
            .ok_or_else(|| format!("Base64 含有非法字符：{}", byte as char))?;
        group = (group << 6) | value as u32;
        count += 1;
        if count == 4 {
            out.push(((group >> 16) & 0xff) as u8);
            out.push(((group >> 8) & 0xff) as u8);
            out.push((group & 0xff) as u8);
            group = 0;
            count = 0;
        }
    }

    // 尾块：2 字符 → 1 字节，3 字符 → 2 字节；1 字符不合法
    match count {
        0 => {}
        2 => {
            group <<= 12;
            out.push(((group >> 16) & 0xff) as u8);
        }
        3 => {
            group <<= 6;
            out.push(((group >> 16) & 0xff) as u8);
            out.push(((group >> 8) & 0xff) as u8);
        }
        _ => return Err("Base64 长度不合法".to_string()),
    }

    Ok(out)
}

/// 解析 `data:<mime>[;参数];base64,<payload>`，返回 (mime, 字节)。
///
/// 只接受 base64 形式：录音走的就是它。这里**不做 MIME 白名单**——
/// 白名单放在命令层（语音备注只认 `audio/*`），因为"能解出字节"与
/// "这个字节是不是我们想要的东西"是两件事。
pub fn parse_base64_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let rest = data_url
        .strip_prefix("data:")
        .ok_or_else(|| "不是合法的 data URL".to_string())?;
    let comma = rest
        .find(',')
        .ok_or_else(|| "data URL 缺少数据段".to_string())?;
    let header = &rest[..comma];
    let payload = &rest[comma + 1..];

    if !header.ends_with(";base64") {
        return Err("只支持 base64 编码的 data URL".to_string());
    }
    // 去掉末尾的 `;base64`；保留可能的编解码参数（如 `audio/webm;codecs=opus`）
    let mime = header.trim_end_matches(";base64").trim();
    if mime.is_empty() {
        return Err("data URL 缺少 MIME 类型".to_string());
    }

    let bytes = decode_base64(payload)?;
    Ok((mime.to_string(), bytes))
}

/// 将资源字节流编码为可直接用于 `<img src>` 的 data URL。
/// 形如 `data:image/png;base64,iVBORw0...`。
pub fn encode_asset_data_url(mime_type: &str, bytes: &[u8]) -> String {
    format!("data:{mime_type};base64,{}", encode_base64(bytes))
}

/// 递归收集主题树中所有 image.asset_id 引用。
fn collect_topic_asset_ids(topic: &TopicSnapshot, ids: &mut HashSet<String>) {
    if let Some(image) = &topic.image {
        if !image.asset_id.is_empty() {
            ids.insert(image.asset_id.clone());
        }
    }
    // 附件也是被引用的资源：漏掉这一支，保存前的 GC 会把用户附件**当成垃圾删掉**
    // ——而且删除发生在保存路径上，用户下次打开文件才会发现附件没了。
    if let Some(attachment) = &topic.attachment {
        if !attachment.asset_id.is_empty() {
            ids.insert(attachment.asset_id.clone());
        }
    }
    // 语音备注同理：漏掉这一支 = 用户一保存，录的那段音就没了。
    if let Some(voice_note) = &topic.voice_note {
        if !voice_note.asset_id.is_empty() {
            ids.insert(voice_note.asset_id.clone());
        }
    }
    for child in &topic.children {
        collect_topic_asset_ids(child, ids);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::document::{TopicImage, TopicSnapshot};

    #[test]
    fn compute_sha256_matches_known_vector() {
        // "hello" 的 SHA-256 = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        let digest = AssetIndex::compute_sha256(b"hello");
        assert_eq!(
            digest,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn build_asset_id_format() {
        let id = AssetIndex::build_asset_id("abc123", "png");
        assert_eq!(id, "sha256-abc123.png");
    }

    #[test]
    fn extension_for_common_mime_types() {
        assert_eq!(AssetIndex::extension_for_mime_type("image/png"), "png");
        assert_eq!(AssetIndex::extension_for_mime_type("image/jpeg"), "jpg");
        assert_eq!(AssetIndex::extension_for_mime_type("image/svg+xml"), "svg");
        assert_eq!(AssetIndex::extension_for_mime_type("application/pdf"), "pdf");
        assert_eq!(AssetIndex::extension_for_mime_type("unknown/type"), "bin");
    }

    #[test]
    fn asset_kind_from_mime_type() {
        assert_eq!(AssetKind::from_mime_type("image/png"), AssetKind::Image);
        assert_eq!(
            AssetKind::from_mime_type("application/pdf"),
            AssetKind::Attachment
        );
    }

    #[test]
    fn asset_zip_path_includes_kind_subdirectory() {
        let entry = AssetEntry {
            asset_id: "sha256-abc.png".into(),
            sha256: "abc".into(),
            kind: AssetKind::Image,
            byte_size: 100,
            mime_type: "image/png".into(),
            width: Some(10),
            height: Some(20),
        };
        assert_eq!(entry.zip_path(), "assets/images/sha256-abc.png");
    }

    #[test]
    fn register_deduplicates_identical_content() {
        let mut store = AssetStore::default();
        let bytes = b"\x89PNG\r\n\x1a\nfake-png-data".to_vec();

        let id1 = store.register(bytes.clone(), "image/png", Some(100), Some(50));
        let id2 = store.register(bytes, "image/png", Some(100), Some(50));

        assert_eq!(id1, id2, "identical content should dedup to same asset_id");
        assert_eq!(store.index.assets.len(), 1);
        assert_eq!(store.blobs.len(), 1);
    }

    #[test]
    fn register_distinct_content_creates_separate_entries() {
        let mut store = AssetStore::default();

        let id1 = store.register(vec![1, 2, 3], "image/png", None, None);
        let id2 = store.register(vec![4, 5, 6], "image/png", None, None);

        assert_ne!(id1, id2);
        assert_eq!(store.index.assets.len(), 2);
    }

    #[test]
    fn collect_referenced_asset_ids_includes_attachments() {
        // 附件必须在"被引用"集合里：漏掉它，保存前的 GC 会把用户附件当成垃圾删掉，
        // 而用户要到下次打开文件才会发现。
        let mut document = crate::domain::document::DocumentSnapshot::new_default();
        document.sheets[0].root_topic.attachment = Some(crate::domain::document::TopicAttachment {
            asset_id: "sha256-attachment.bin".to_string(),
            name: "方案.pdf".to_string(),
            mime_type: Some("application/pdf".to_string()),
            byte_size: Some(7),
        });

        let ids = AssetIndex::collect_referenced_asset_ids(&document);

        assert!(ids.contains("sha256-attachment.bin"));
    }

    #[test]
    fn garbage_collect_keeps_voice_note_assets() {
        // 语音备注是"新增持久化字段"的典型：漏掉 GC 引用扫描这一处，
        // 用户一保存录音就没了（而且资源区里也查不到，因为是被 GC 主动清掉的）。
        let mut store = AssetStore::default();
        let asset_id = store.register_with_kind(
            b"opus-bytes".to_vec(),
            "audio/webm;codecs=opus",
            AssetKind::VoiceNote,
            None,
            None,
        );

        let mut document = crate::domain::document::DocumentSnapshot::new_default();
        document.sheets[0].root_topic.voice_note =
            Some(crate::domain::document::TopicVoiceNote {
                asset_id: asset_id.clone(),
                mime_type: "audio/webm;codecs=opus".to_string(),
                byte_size: Some(10),
                duration_ms: Some(1200),
            });

        let ids = AssetIndex::collect_referenced_asset_ids(&document);
        assert!(ids.contains(&asset_id));

        let removed = store.garbage_collect(&document);
        assert!(removed.is_empty(), "被语音备注引用的资源不该被回收");
        assert_eq!(store.index.assets.len(), 1);
    }

    #[test]
    fn voice_note_assets_land_in_their_own_subdirectory() {
        let mut store = AssetStore::default();
        let asset_id = store.register_with_kind(
            b"opus-bytes".to_vec(),
            "audio/webm",
            AssetKind::VoiceNote,
            None,
            None,
        );
        let entry = store
            .index
            .assets
            .iter()
            .find(|e| e.asset_id == asset_id)
            .expect("entry should exist");
        assert_eq!(entry.kind.subdirectory(), "voice-notes");
        // 扩展名要跟着 MIME 走：落在资源区里的文件名得能看出是什么
        assert!(asset_id.ends_with(".webm"), "实际：{asset_id}");
    }

    #[test]
    fn audio_attachments_still_go_to_attachments() {
        // 刻意的分工：`audio/*` 从 MIME 推出来的默认类别仍是**附件**
        // （"附了一个 mp3" ≠ "录了一段语音"），语音备注靠 register_with_kind 显式指定。
        assert_eq!(AssetKind::from_mime_type("audio/mpeg"), AssetKind::Attachment);
        assert_eq!(AssetKind::from_mime_type("audio/webm"), AssetKind::Attachment);
    }

    #[test]
    fn base64_round_trips_and_parses_data_urls() {
        // 录音在 WebView 里是 Blob → 统一以 data URL 落库，所以 Rust 侧必须能解开。
        // 覆盖三种尾块长度（编码的填充分支）与带编解码参数的 MIME。
        for probe in [&b"a"[..], &b"ab"[..], &b"abc"[..], &b"abcd"[..], &b""[..]] {
            let encoded = encode_base64(probe);
            let decoded = decode_base64(&encoded).expect("decode should succeed");
            assert_eq!(decoded, probe, "往返失败：{probe:?}");
        }

        let (mime, bytes) =
            parse_base64_data_url("data:audio/webm;codecs=opus;base64,aGVsbG8=").expect("parse");
        assert_eq!(mime, "audio/webm;codecs=opus");
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn base64_and_data_url_reject_broken_input() {
        // 坏输入要**报错**而不是解出一段垃圾：录音数据一旦错了，
        // 用户拿到的是一个点开没声音的附件，比直接失败更难排查。
        assert!(decode_base64("a").is_err(), "单字符不是合法尾块");
        assert!(decode_base64("!!!!").is_err(), "非字母表字符");
        assert!(parse_base64_data_url("audio/webm;base64,AAAA").is_err(), "缺 data: 前缀");
        assert!(parse_base64_data_url("data:audio/webm,AAAA").is_err(), "非 base64 形式");
        assert!(parse_base64_data_url("data:;base64,AAAA").is_err(), "缺 MIME");
    }

    #[test]
    fn garbage_collect_keeps_attachment_assets() {
        let mut store = AssetStore::default();
        let asset_id = store.register(b"pdf-bytes".to_vec(), "application/pdf", None, None);
        assert_eq!(store.index.assets.len(), 1);

        let mut document = crate::domain::document::DocumentSnapshot::new_default();
        document.sheets[0].root_topic.attachment = Some(crate::domain::document::TopicAttachment {
            asset_id: asset_id.clone(),
            name: "方案.pdf".to_string(),
            mime_type: Some("application/pdf".to_string()),
            byte_size: Some(9),
        });

        // garbage_collect 自己会扫描文档收集引用，这里直接传文档
        let removed = store.garbage_collect(&document);

        assert!(removed.is_empty(), "被附件引用的资源不该被回收");
        assert_eq!(store.index.assets.len(), 1);
    }

    #[test]
    fn garbage_collect_removes_unreferenced_assets() {
        let mut store = AssetStore::default();
        let id_referenced = store.register(vec![1, 2, 3], "image/png", None, None);
        let id_orphan = store.register(vec![4, 5, 6], "image/png", None, None);

        let mut document = DocumentSnapshot::new_default();
        document.sheets[0].root_topic.image = Some(TopicImage {
            asset_id: id_referenced.clone(),
            width: None,
            height: None,
        });

        let removed = store.garbage_collect(&document);
        assert_eq!(removed, vec![id_orphan.clone()]);
        assert_eq!(store.index.assets.len(), 1);
        assert!(store.blobs.contains_key(&id_referenced));
        assert!(!store.blobs.contains_key(&id_orphan));
    }

    #[test]
    fn collect_referenced_asset_ids_traverses_full_tree() {
        let mut document = DocumentSnapshot::new_default();
        let root = &mut document.sheets[0].root_topic;
        root.image = Some(TopicImage {
            asset_id: "asset-root".into(),
            width: None,
            height: None,
        });
        root.children.push(TopicSnapshot {
            id: "child".into(),
            text: "child".into(),
            collapsed: false,
            children: vec![TopicSnapshot {
                id: "grandchild".into(),
                text: "grand".into(),
                collapsed: false,
                children: vec![],
                style_ref: None,
                style_overrides: None,
                markers: vec![],
                stickers: vec![],
                callout: None,
                labels: vec![],
                notes: None,
                link: None,
                image: Some(TopicImage {
                    asset_id: "asset-grandchild".into(),
                    width: None,
                    height: None,
                }),
                task: None,
                attachment: None,
                voice_note: None,
                layout_hints: None,
                structure: None,
                extensions: None,
                extra: serde_json::Map::new(),
            }],
            style_ref: None,
            style_overrides: None,
            markers: vec![],
            stickers: vec![],
            callout: None,
            labels: vec![],
            notes: None,
            link: None,
            image: None,
            task: None,
            attachment: None,
            voice_note: None,
            layout_hints: None,
            structure: None,
            extensions: None,
            extra: serde_json::Map::new(),
        });

        let referenced = AssetIndex::collect_referenced_asset_ids(&document);
        assert!(referenced.contains("asset-root"));
        assert!(referenced.contains("asset-grandchild"));
        assert_eq!(referenced.len(), 2);
    }

    #[test]
    fn verify_all_hashes_passes_for_consistent_store() {
        let mut store = AssetStore::default();
        store.register(vec![1, 2, 3], "image/png", None, None);
        store.register(vec![4, 5, 6], "image/png", None, None);

        assert!(store.verify_all_hashes().is_ok());
    }

    #[test]
    fn verify_all_hashes_detects_corruption() {
        let mut store = AssetStore::default();
        let id = store.register(vec![1, 2, 3], "image/png", None, None);

        // 篡改字节流
        *store.blobs.get_mut(&id).unwrap() = vec![9, 9, 9];

        let result = store.verify_all_hashes();
        assert!(result.is_err());
        let errors = result.unwrap_err();
        assert!(errors.iter().any(|e| e.contains("SHA-256 校验失败")));
    }

    #[test]
    fn encode_base64_handles_known_vectors() {
        // RFC 4648 §10 测试向量
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foob"), "Zm9vYg==");
        assert_eq!(encode_base64(b"fooba"), "Zm9vYmE=");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn encode_base64_handles_project_name_vector() {
        // "MindGrid" -> TWluZEdyaWQ=（8 字节，非 3 倍数，尾部 1 个 '='）
        assert_eq!(encode_base64(b"MindGrid"), "TWluZEdyaWQ=");
    }

    #[test]
    fn encode_base64_pads_partial_trailing_chunks() {
        // 长度 mod 3 == 1 -> 两个 '='；== 2 -> 一个 '='
        let single = encode_base64(&[0x00]);
        assert_eq!(single, "AA==");
        assert_eq!(single.len() % 4, 0);

        let double = encode_base64(&[0x00, 0xff]);
        assert_eq!(double, "AP8=");
        assert!(double.ends_with('='));

        let triple = encode_base64(&[0x00, 0xff, 0x10]);
        assert_eq!(triple, "AP8Q");
        assert!(!triple.contains('='));
    }

    #[test]
    fn encode_base64_covers_all_byte_values() {
        // 0..=255 全字节值，验证无 panic 且输出符合 Base64 字符集与长度规则
        let all: Vec<u8> = (0..=255u8).collect();
        let encoded = encode_base64(&all);
        assert_eq!(encoded.len(), all.len().div_ceil(3) * 4);
        assert!(encoded
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '='));
        assert_eq!(encoded, encode_base64(&all), "编码必须是纯函数");
    }

    #[test]
    fn encode_asset_data_url_uses_mime_and_base64_payload() {
        let bytes = b"\x89PNG\r\n\x1a\nfake".to_vec();
        let url = encode_asset_data_url("image/png", &bytes);
        assert!(url.starts_with("data:image/png;base64,"));
        assert_eq!(url, format!("data:image/png;base64,{}", encode_base64(&bytes)));

        let svg_url = encode_asset_data_url("image/svg+xml", b"<svg/>");
        assert_eq!(svg_url, "data:image/svg+xml;base64,PHN2Zy8+");
    }

    #[test]
    fn asset_index_round_trips_through_json() {
        let mut index = AssetIndex::default();
        index.assets.push(AssetEntry {
            asset_id: "sha256-abc.png".into(),
            sha256: "abc".into(),
            kind: AssetKind::Image,
            byte_size: 1024,
            mime_type: "image/png".into(),
            width: Some(800),
            height: Some(600),
        });

        let json = serde_json::to_string_pretty(&index).expect("should serialize");
        let restored: AssetIndex =
            serde_json::from_str(&json).expect("should deserialize");
        assert_eq!(restored, index);
    }

    #[test]
    fn collect_referenced_asset_ids_includes_floating_topics() {
        // 浮动主题在 rootTopic 树之外。漏掉的话，给浮动主题配了图的用户在
        // **保存**时会被 GC 把图当垃圾删掉，而且要等下次打开文件才发现
        let mut document = DocumentSnapshot::new_default();
        let mut floating = TopicSnapshot::new("浮动主题");
        floating.image = Some(TopicImage {
            asset_id: "asset_float_image".into(),
            width: None,
            height: None,
        });
        document.sheets[0].floating_topics = vec![floating];

        let ids = AssetIndex::collect_referenced_asset_ids(&document);

        assert!(ids.contains("asset_float_image"));
    }
}
