use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::editor::{apply_inverse, apply_operation, ChangeSet, DocumentEditor};

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

/// 当前文档 schema 版本。1.1.0 在 1.0.0 基础上以可选字段方式新增富内容、关系线、
/// 概要、边界、图表类型与主题引用，向后兼容 1.0.0 旧文档。
pub const CURRENT_SCHEMA_VERSION: &str = "1.1.0";

/// 扩展字段类型：应用层命名空间下的任意 JSON，不覆盖核心字段。
pub type Extensions = HashMap<String, Value>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicMarker {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicLink {
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicImage {
    pub asset_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TopicTaskStatus {
    None,
    Started,
    Completed,
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicTask {
    pub status: TopicTaskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_date_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutDirection {
    Left,
    Right,
    Up,
    Down,
}

/// 主题节点形状。对齐 XMind 节点形状选项（rounded/rect/pill/underline）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TopicShape {
    #[default]
    Rounded,
    Rect,
    Pill,
    Underline,
}

/// 主题节点级样式覆盖，优先于文档主题的层级默认值。
///
/// 颜色字段覆盖主题层级配色；形状与排印字段覆盖深度分级默认值。
/// 所有字段可选并 `#[serde(default)]`，缺省时回退到对应默认，
/// 保证 1.1.0 旧文档（仅含颜色三字段）可直接加载、往返不丢失。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TopicStyleOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<TopicShape>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicLayoutHints {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<LayoutDirection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset_x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopicSnapshot {
    pub id: String,
    pub text: String,
    pub collapsed: bool,
    pub children: Vec<TopicSnapshot>,
    /// 样式表引用，见 styles.json。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_ref: Option<String>,
    /// 节点级样式覆盖（颜色 / 形状 / 排印 / 边框粗细），优先于文档主题。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_overrides: Option<TopicStyleOverrides>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub markers: Vec<TopicMarker>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<TopicLink>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<TopicImage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<TopicTask>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_hints: Option<TopicLayoutHints>,
    /// 应用层扩展命名空间，不覆盖核心字段。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Extensions>,
    /// 未知字段原样保留（spec 16：不静默删除未知字段）。
    /// 与 `extensions` 区分：`extensions` 是规范定义的命名空间；`extra` 捕获 schema 未识别字段。
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChartType {
    Mindmap,
    Logic,
    Tree,
    Org,
    Fishbone,
    Timeline,
    Brace,
    Matrix,
    Bubble,
}

impl Default for ChartType {
    fn default() -> Self {
        ChartType::Mindmap
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LayoutBalance {
    Left,
    Right,
    Balanced,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<LayoutBalance>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub horizontal_spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vertical_spacing: Option<f64>,
}

/// 连线类型，决定父子主题之间的边线绘制方式。
/// 与 TS 侧 `EdgeType` 保持一致（serde 序列化为 lowercase）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EdgeType {
    Curve,
    Straight,
    Elbow,
}

impl Default for EdgeType {
    fn default() -> Self {
        EdgeType::Curve
    }
}

/// 画布级分支样式覆盖，影响整张画布的连线视觉。
/// 与 TS 侧 `SheetBranchStyle` 保持结构一致（camelCase 序列化）。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SheetBranchStyle {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edge_type: Option<EdgeType>,
    /// 粗细乘数（1.0 为默认）。建议范围 0.5–3.0。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thickness: Option<f32>,
    /// 分支色板，覆盖默认 8 色循环。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub color_palette: Vec<String>,
}

impl Default for SheetBranchStyle {
    fn default() -> Self {
        SheetBranchStyle {
            edge_type: None,
            thickness: None,
            color_palette: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelationshipControlPoint {
    pub x: f64,
    pub y: f64,
}

/// 关系线：两个主题之间的非父子连接，不改变树结构。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub id: String,
    pub from_topic_id: String,
    pub to_topic_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub control_points: Vec<RelationshipControlPoint>,
}

/// 概要节点：对一组兄弟主题的归纳。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SummaryNode {
    pub id: String,
    pub topic_ids: Vec<String>,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_ref: Option<String>,
}

/// 边界：框选一组主题以做视觉分组。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Boundary {
    pub id: String,
    pub topic_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SheetSnapshot {
    pub id: String,
    pub title: String,
    pub root_topic: TopicSnapshot,
    /// 图表类型，缺省为 mindmap。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chart_type: Option<ChartType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout_config: Option<LayoutConfig>,
    /// 画布级分支样式（连线类型/粗细/分支色板），缺省回退到默认。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_style: Option<SheetBranchStyle>,
    /// 浮动主题列表：独立于 rootTopic 树结构的自由节点。
    /// 每个浮动主题通过 layout_hints.offset_x/offset_y 存储世界坐标绝对位置。
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub floating_topics: Vec<TopicSnapshot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub boundaries: Vec<Boundary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub summaries: Vec<SummaryNode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Extensions>,
    /// 未知字段原样保留（spec 16：不静默删除未知字段）。
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeRef {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSnapshot {
    pub schema_version: String,
    pub document_id: String,
    pub revision: u32,
    pub active_sheet_id: String,
    pub sheets: Vec<SheetSnapshot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships: Vec<Relationship>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<ThemeRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extensions: Option<Extensions>,
    /// 未知字段原样保留（spec 16：不静默删除未知字段）。
    #[serde(flatten, default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub document_id: String,
    pub revision: u32,
    pub active_sheet_id: String,
    pub sheet_count: usize,
    pub topic_count: usize,
    pub root_topic_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSessionSnapshot {
    pub document: DocumentSnapshot,
    pub summary: DocumentSummary,
    pub can_undo: bool,
    pub can_redo: bool,
    pub next_undo_action: Option<String>,
    pub next_redo_action: Option<String>,
    pub active_topic_id: String,
    pub file_path: Option<String>,
    pub last_saved_at_ms: Option<u64>,
    pub last_autosaved_at_ms: Option<u64>,
    pub has_unsaved_changes: bool,
    pub recovered_from_autosave: bool,
    pub repair_report: Option<DocumentRepairReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRepairReport {
    pub source_path: String,
    pub destination_path: String,
    pub repaired_at_ms: u64,
    pub changes: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct DocumentSession {
    pub document: Option<DocumentSnapshot>,
    /// 撤销栈：每个条目是一个事务化 ChangeSet（紧凑操作日志），替代整文档快照。
    pub history: Vec<ChangeSet>,
    pub future: Vec<ChangeSet>,
    pub active_topic_id: Option<String>,
    pub file_path: Option<String>,
    pub last_saved_at_ms: Option<u64>,
    pub last_autosaved_at_ms: Option<u64>,
    pub has_unsaved_changes: bool,
    pub recovered_from_autosave: bool,
    pub repair_report: Option<DocumentRepairReport>,
}

impl DocumentSnapshot {
    pub fn new_default() -> Self {
        let sheet = SheetSnapshot::new("主画布");

        Self {
            schema_version: CURRENT_SCHEMA_VERSION.into(),
            document_id: create_id("doc"),
            revision: 1,
            active_sheet_id: sheet.id.clone(),
            sheets: vec![sheet],
            relationships: Vec::new(),
            settings: None,
            theme: None,
            extensions: None,
            extra: serde_json::Map::new(),
        }
    }

    /// 重新生成所有 ID（document / sheet / topic / boundary / summary / relationship），
    /// 并更新所有引用（active_sheet_id / boundary.topic_ids / summary.topic_ids /
    /// relationship.from_topic_id / relationship.to_topic_id）。
    /// 用于从模板创建新文档，确保每个文档有唯一 ID。
    pub fn regenerate_ids(self) -> Self {
        let new_document_id = create_id("doc");
        let mut topic_id_map: HashMap<String, String> = HashMap::new();
        let mut sheet_id_map: HashMap<String, String> = HashMap::new();

        let sheets: Vec<SheetSnapshot> = self
            .sheets
            .into_iter()
            .map(|sheet| {
                let new_sheet_id = create_id("sheet");
                sheet_id_map.insert(sheet.id.clone(), new_sheet_id.clone());

                let new_root =
                    clone_topic_branch_with_map(&sheet.root_topic, &mut topic_id_map);

                let boundaries = sheet
                    .boundaries
                    .into_iter()
                    .map(|mut b| {
                        b.id = create_id("bnd");
                        b.topic_ids = b
                            .topic_ids
                            .into_iter()
                            .map(|id| topic_id_map.get(&id).cloned().unwrap_or(id))
                            .collect();
                        b
                    })
                    .collect();

                let summaries = sheet
                    .summaries
                    .into_iter()
                    .map(|mut s| {
                        s.id = create_id("sum");
                        s.topic_ids = s
                            .topic_ids
                            .into_iter()
                            .map(|id| topic_id_map.get(&id).cloned().unwrap_or(id))
                            .collect();
                        s
                    })
                    .collect();

                SheetSnapshot {
                    id: new_sheet_id,
                    title: sheet.title,
                    root_topic: new_root,
                    chart_type: sheet.chart_type,
                    layout_config: sheet.layout_config,
                    branch_style: sheet.branch_style.clone(),
                    floating_topics: sheet.floating_topics.clone(),
                    boundaries,
                    summaries,
                    extensions: sheet.extensions,
                    extra: sheet.extra.clone(),
                }
            })
            .collect();

        let active_sheet_id = sheet_id_map
            .get(&self.active_sheet_id)
            .cloned()
            .unwrap_or_else(|| {
                sheets
                    .first()
                    .map(|s| s.id.clone())
                    .unwrap_or_default()
            });

        let relationships = self
            .relationships
            .into_iter()
            .map(|mut r| {
                r.id = create_id("rel");
                r.from_topic_id = topic_id_map
                    .get(&r.from_topic_id)
                    .cloned()
                    .unwrap_or(r.from_topic_id);
                r.to_topic_id = topic_id_map
                    .get(&r.to_topic_id)
                    .cloned()
                    .unwrap_or(r.to_topic_id);
                r
            })
            .collect();

        Self {
            schema_version: CURRENT_SCHEMA_VERSION.into(),
            document_id: new_document_id,
            revision: 1,
            active_sheet_id,
            sheets,
            relationships,
            settings: self.settings,
            theme: self.theme,
            extensions: self.extensions,
            extra: self.extra.clone(),
        }
    }

    pub fn summary(&self) -> DocumentSummary {
        let root_topic = self.root_topic();

        DocumentSummary {
            document_id: self.document_id.clone(),
            revision: self.revision,
            active_sheet_id: self.active_sheet_id.clone(),
            sheet_count: self.sheets.len(),
            topic_count: count_topics(root_topic),
            root_topic_text: root_topic.text.clone(),
        }
    }

    pub fn root_topic(&self) -> &TopicSnapshot {
        &self.active_sheet().root_topic
    }

    pub fn root_topic_mut(&mut self) -> &mut TopicSnapshot {
        &mut self.active_sheet_mut().root_topic
    }

    pub fn active_sheet(&self) -> &SheetSnapshot {
        self.find_sheet(&self.active_sheet_id)
            .unwrap_or_else(|| self.sheets.first().expect("document should always have at least one sheet"))
    }

    pub fn active_sheet_mut(&mut self) -> &mut SheetSnapshot {
        let active_index = self
            .sheets
            .iter()
            .position(|sheet| sheet.id == self.active_sheet_id)
            .unwrap_or(0);

        &mut self.sheets[active_index]
    }

    pub fn find_sheet(&self, sheet_id: &str) -> Option<&SheetSnapshot> {
        self.sheets.iter().find(|sheet| sheet.id == sheet_id)
    }

    pub fn find_sheet_mut(&mut self, sheet_id: &str) -> Option<&mut SheetSnapshot> {
        self.sheets.iter_mut().find(|sheet| sheet.id == sheet_id)
    }

    pub fn contains_topic(&self, topic_id: &str) -> bool {
        find_topic(self.root_topic(), topic_id).is_some()
    }
}

impl DocumentSession {
    pub fn create_default() -> Self {
        let document = DocumentSnapshot::new_default();
        Self::from_document(document)
    }

    /// 从模板文档创建新会话：重新生成所有 ID，确保唯一性。
    pub fn from_template(document: DocumentSnapshot) -> Self {
        let regenerated = document.regenerate_ids();
        Self::from_document(regenerated)
    }

    pub fn from_document(document: DocumentSnapshot) -> Self {
        Self::from_document_with_file_path(document, None, None)
    }

    pub fn from_document_with_file_path(
        document: DocumentSnapshot,
        file_path: Option<String>,
        last_saved_at_ms: Option<u64>,
    ) -> Self {
        let active_topic_id = document.root_topic().id.clone();

        Self {
            document: Some(document),
            history: Vec::new(),
            future: Vec::new(),
            active_topic_id: Some(active_topic_id),
            file_path,
            last_saved_at_ms,
            last_autosaved_at_ms: None,
            has_unsaved_changes: false,
            recovered_from_autosave: false,
            repair_report: None,
        }
    }

    pub fn mark_autosaved(&mut self, timestamp_ms: u64) {
        self.last_autosaved_at_ms = Some(timestamp_ms);
    }

    pub fn mark_saved(&mut self, file_path: String, timestamp_ms: u64) {
        self.file_path = Some(file_path);
        self.last_saved_at_ms = Some(timestamp_ms);
        self.has_unsaved_changes = false;
        self.recovered_from_autosave = false;
    }

    pub fn mark_recovered_from_autosave(&mut self) {
        self.recovered_from_autosave = true;
    }

    pub fn mark_repaired(&mut self, report: DocumentRepairReport) {
        self.repair_report = Some(report);
    }

    pub fn clear_repair_report(&mut self) -> Result<DocumentSessionSnapshot, String> {
        self.repair_report = None;

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    pub fn snapshot(&self) -> Option<DocumentSessionSnapshot> {
        let document = self.document.as_ref()?;
        let active_topic_id = self
            .active_topic_id
            .clone()
            .unwrap_or_else(|| document.root_topic().id.clone());

        Some(DocumentSessionSnapshot {
            document: document.clone(),
            summary: document.summary(),
            can_undo: !self.history.is_empty(),
            can_redo: !self.future.is_empty(),
            next_undo_action: self.history.last().map(|entry| entry.action_label.clone()),
            next_redo_action: self.future.last().map(|entry| entry.action_label.clone()),
            active_topic_id,
            file_path: self.file_path.clone(),
            last_saved_at_ms: self.last_saved_at_ms,
            last_autosaved_at_ms: self.last_autosaved_at_ms,
            has_unsaved_changes: self.has_unsaved_changes,
            recovered_from_autosave: self.recovered_from_autosave,
            repair_report: self.repair_report.clone(),
        })
    }

    pub fn select_topic(&mut self, topic_id: &str) -> Result<DocumentSessionSnapshot, String> {
        let document = self
            .document
            .as_ref()
            .ok_or_else(|| "当前没有打开的文档".to_string())?;

        if !document.contains_topic(topic_id) {
            return Err("找不到需要选中的主题".into());
        }

        self.active_topic_id = Some(topic_id.to_string());

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    pub fn select_sheet(&mut self, sheet_id: &str) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("切换画布", |editor| editor.select_sheet(sheet_id))
    }

    pub fn create_sheet(&mut self) -> Result<DocumentSessionSnapshot, String> {
        let next_title = format!(
            "画布 {}",
            self.document.as_ref().map(|d| d.sheets.len() + 1).unwrap_or(1)
        );
        self.apply_change_set("创建画布", move |editor| editor.create_sheet(&next_title))
    }

    pub fn rename_sheet(
        &mut self,
        sheet_id: &str,
        title: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let trimmed = title.trim();

        if trimmed.is_empty() {
            return Err("画布名称不能为空".into());
        }

        self.apply_change_set("重命名画布", |editor| editor.rename_sheet(sheet_id, trimmed))
    }

    pub fn delete_sheet(&mut self, sheet_id: &str) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("删除画布", |editor| editor.delete_sheet(sheet_id))
    }

    pub fn move_sheet(
        &mut self,
        sheet_id: &str,
        direction: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = if direction == "up" { "上移画布" } else { "下移画布" };
        self.apply_change_set(label, |editor| editor.move_sheet_direction(sheet_id, direction))
    }

    pub fn set_sheet_chart_type(
        &mut self,
        sheet_id: &str,
        chart_type: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("切换图表类型", |editor| {
            editor.set_sheet_chart_type(sheet_id, chart_type)
        })
    }

    pub fn set_sheet_branch_style(
        &mut self,
        sheet_id: &str,
        branch_style: Option<SheetBranchStyle>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("设置分支样式", |editor| {
            editor.set_sheet_branch_style(sheet_id, branch_style)
        })
    }

    pub fn create_child_topic(&mut self, parent_id: &str) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("创建子主题", |editor| {
            editor.create_child_topic(parent_id, "新建子主题")
        })
    }

    pub fn create_sibling_topic(
        &mut self,
        topic_id: &str,
        position: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let resolved = position.unwrap_or("after");
        let label = if resolved == "before" {
            "前插同级主题"
        } else {
            "创建同级主题"
        };
        self.apply_change_set(label, |editor| {
            editor.create_sibling_topic(topic_id, "新建同级主题", resolved)
        })
    }

    pub fn create_parent_topic(
        &mut self,
        topic_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("插入父主题", |editor| {
            editor.create_parent_topic(topic_id, "新建父主题")
        })
    }

    /// 创建浮动主题：在活动画布追加一个不参与树布局的独立主题。
    /// 对应 XMind 双击空白创建浮动主题。
    pub fn create_floating_topic(
        &mut self,
        text: &str,
        offset_x: f64,
        offset_y: f64,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("创建浮动主题", |editor| {
            editor.create_floating_topic(text, offset_x, offset_y)
        })
    }

    pub fn rename_topic(
        &mut self,
        topic_id: &str,
        text: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let trimmed = text.trim().to_string();

        if trimmed.is_empty() {
            return Err("主题文本不能为空".into());
        }

        self.apply_change_set("重命名主题", |editor| {
            editor.rename_topic(topic_id, &trimmed)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn delete_topic(&mut self, topic_id: &str) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("删除主题", |editor| editor.delete_topic(topic_id))
    }

    pub fn delete_topics(
        &mut self,
        topic_ids: &[String],
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("删除 {} 个主题", topic_ids.len()));
        self.apply_change_set(&label, |editor| editor.delete_topics(topic_ids))
    }

    pub fn move_topic(
        &mut self,
        topic_id: &str,
        target_parent_id: &str,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label.unwrap_or("移动主题");
        self.apply_change_set(label, |editor| {
            editor.move_topic_to_parent(topic_id, target_parent_id)
        })
    }

    pub fn move_topics(
        &mut self,
        topic_ids: &[String],
        target_parent_id: &str,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("批量移动 {} 个主题", topic_ids.len()));
        self.apply_change_set(&label, |editor| {
            editor.move_topics_to_parent(topic_ids, target_parent_id)
        })
    }

    pub fn move_topic_in_parent(
        &mut self,
        topic_id: &str,
        direction: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = if direction == "up" { "上移主题" } else { "下移主题" };
        self.apply_change_set(label, |editor| editor.move_topic_in_parent(topic_id, direction))
    }

    pub fn move_topic_to_sheet(
        &mut self,
        topic_id: &str,
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label.unwrap_or("移动主题到其他画布");
        self.apply_change_set(label, |editor| {
            editor.move_topic_to_sheet_parent(topic_id, target_sheet_id, target_parent_id)
        })
    }

    pub fn move_topics_to_sheet(
        &mut self,
        topic_ids: &[String],
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("批量移动 {} 个主题到其他画布", topic_ids.len()));
        self.apply_change_set(&label, |editor| {
            editor.move_topics_to_sheet_parent(topic_ids, target_sheet_id, target_parent_id)
        })
    }

    pub fn copy_topic_to_sheet(
        &mut self,
        topic_id: &str,
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label.unwrap_or("复制主题到其他画布");
        self.apply_change_set(label, |editor| {
            editor.copy_topic_to_sheet_parent(topic_id, target_sheet_id, target_parent_id)
        })
    }

    pub fn copy_topics_to_sheet(
        &mut self,
        topic_ids: &[String],
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
        action_label: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = action_label
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("批量复制 {} 个主题到其他画布", topic_ids.len()));
        self.apply_change_set(&label, |editor| {
            editor.copy_topics_to_sheet_parent(topic_ids, target_sheet_id, target_parent_id)
        })
    }

    pub fn toggle_topic_collapsed(
        &mut self,
        topic_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("切换主题折叠状态", |editor| {
            editor.toggle_topic_collapsed(topic_id)
        })
    }

    pub fn set_topic_notes(
        &mut self,
        topic_id: &str,
        notes: Option<String>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑备注", |editor| {
            editor.set_topic_notes(topic_id, notes)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_link(
        &mut self,
        topic_id: &str,
        link: Option<TopicLink>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑链接", |editor| {
            editor.set_topic_link(topic_id, link)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_markers(
        &mut self,
        topic_id: &str,
        markers: Vec<TopicMarker>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑标记", |editor| {
            editor.set_topic_markers(topic_id, markers)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_labels(
        &mut self,
        topic_id: &str,
        labels: Vec<String>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑标签", |editor| {
            editor.set_topic_labels(topic_id, labels)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_task(
        &mut self,
        topic_id: &str,
        task: Option<TopicTask>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑任务", |editor| {
            editor.set_topic_task(topic_id, task)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_style_ref(
        &mut self,
        topic_id: &str,
        style_ref: Option<String>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑样式", |editor| {
            editor.set_topic_style_ref(topic_id, style_ref)?;
            Ok(topic_id.to_string())
        })
    }

    pub fn set_topic_style_overrides(
        &mut self,
        topic_id: &str,
        style_overrides: Option<TopicStyleOverrides>,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("编辑样式", |editor| {
            editor.set_topic_style_overrides(topic_id, style_overrides)?;
            Ok(topic_id.to_string())
        })
    }

    /// 设置主题图片（`image` 为 Some）或移除主题图片（`image` 为 None）。
    /// 撤销标签据操作方向自动取「设置主题图片」/「移除主题图片」。
    pub fn set_topic_image(
        &mut self,
        topic_id: &str,
        image: Option<TopicImage>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let label = if image.is_some() {
            "设置主题图片"
        } else {
            "移除主题图片"
        };
        self.apply_change_set(label, |editor| {
            editor.set_topic_image(topic_id, image)?;
            Ok(topic_id.to_string())
        })
    }

    /// 切换文档主题。`theme_id` 为空或 None 表示清除主题（回退到默认 classic-blue）。
    pub fn set_document_theme(
        &mut self,
        theme_id: Option<&str>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("切换文档主题", |editor| {
            editor.set_document_theme(theme_id)?;
            Ok(active_topic_id.clone().unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    /// 写入文档级设置键值（如 `canvas.showGrid`）。
    ///
    /// 视图偏好类设置不走撤销栈：`value` 为 `None` 表示删除该键。
    pub fn set_document_setting(
        &mut self,
        key: &str,
        value: Option<serde_json::Value>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let key = key.trim();
        if key.is_empty() {
            return Err("设置键不能为空".into());
        }

        let document = self
            .document
            .as_mut()
            .ok_or_else(|| "当前没有打开的文档".to_string())?;

        // settings 是自由键值对象；非对象的历史数据视为损坏并重置。
        let mut settings = match document.settings.take() {
            Some(serde_json::Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        };

        match value {
            Some(value) => settings.insert(key.to_string(), value),
            None => settings.remove(key),
        };
        document.settings = Some(serde_json::Value::Object(settings));
        document.revision += 1;
        self.has_unsaved_changes = true;
        self.recovered_from_autosave = false;

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    // ---- 关系线 / 边界 / 概要 ----

    pub fn create_relationship(
        &mut self,
        from_topic_id: &str,
        to_topic_id: &str,
        label: Option<String>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("创建关系线", |editor| {
            editor.create_relationship(from_topic_id, to_topic_id, label)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn delete_relationship(
        &mut self,
        relationship_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("删除关系线", |editor| {
            editor.delete_relationship(relationship_id)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn create_boundary(
        &mut self,
        sheet_id: &str,
        topic_ids: Vec<String>,
        label: Option<String>,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("创建边界", |editor| {
            editor.create_boundary(sheet_id, topic_ids, label)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn delete_boundary(
        &mut self,
        sheet_id: &str,
        boundary_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("删除边界", |editor| {
            editor.delete_boundary(sheet_id, boundary_id)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn create_summary(
        &mut self,
        sheet_id: &str,
        topic_ids: Vec<String>,
        label: String,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("创建概要", |editor| {
            editor.create_summary(sheet_id, topic_ids, label)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn delete_summary(
        &mut self,
        sheet_id: &str,
        summary_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        let active_topic_id = self.active_topic_id.clone();
        self.apply_change_set("删除概要", |editor| {
            editor.delete_summary(sheet_id, summary_id)?;
            Ok(active_topic_id.unwrap_or_else(|| editor.root_topic_id()))
        })
    }

    pub fn paste_topics(
        &mut self,
        topics: &[TopicSnapshot],
        target_parent_id: &str,
    ) -> Result<DocumentSessionSnapshot, String> {
        self.apply_change_set("粘贴主题", |editor| {
            editor.paste_topics_as_children(topics, target_parent_id)
        })
    }

    pub fn undo(&mut self) -> Result<DocumentSessionSnapshot, String> {
        let change_set = self
            .history
            .pop()
            .ok_or_else(|| "没有可撤销的操作".to_string())?;
        let document = self
            .document
            .as_mut()
            .ok_or_else(|| "当前没有打开的文档".to_string())?;
        apply_inverse(document, &change_set.ops);
        self.future.push(change_set);
        self.has_unsaved_changes = true;
        self.recovered_from_autosave = false;
        self.ensure_active_topic();

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    pub fn redo(&mut self) -> Result<DocumentSessionSnapshot, String> {
        let change_set = self
            .future
            .pop()
            .ok_or_else(|| "没有可重做的操作".to_string())?;
        let document = self
            .document
            .as_mut()
            .ok_or_else(|| "当前没有打开的文档".to_string())?;
        for op in &change_set.ops {
            apply_operation(document, op);
        }
        self.history.push(change_set);
        self.has_unsaved_changes = true;
        self.recovered_from_autosave = false;
        self.ensure_active_topic();

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    /// 执行一个事务化命令：在编辑器上运行 `action`，成功则把操作日志提交为 ChangeSet 入历史栈，
    /// 失败则按逆序应用逆操作回滚，保证文档不被部分变更污染。
    fn apply_change_set<F>(
        &mut self,
        action_label: &str,
        action: F,
    ) -> Result<DocumentSessionSnapshot, String>
    where
        F: FnOnce(&mut DocumentEditor) -> Result<String, String>,
    {
        let mut document = self
            .document
            .take()
            .ok_or_else(|| "当前没有打开的文档".to_string())?;
        let mut editor = DocumentEditor::new(&mut document);
        let active_topic_id = match action(&mut editor) {
            Ok(id) => id,
            Err(err) => {
                let ops = editor.into_ops();
                if !ops.is_empty() {
                    apply_inverse(&mut document, &ops);
                }
                self.document = Some(document);
                return Err(err);
            }
        };
        let ops = editor.into_ops();

        if !ops.is_empty() {
            document.revision += 1;
            self.history.push(ChangeSet {
                action_label: action_label.to_string(),
                ops,
            });
            self.future.clear();
            self.has_unsaved_changes = true;
            self.recovered_from_autosave = false;
        }

        self.active_topic_id = Some(active_topic_id);
        self.document = Some(document);

        self.snapshot()
            .ok_or_else(|| "当前没有可用的文档状态".to_string())
    }

    fn ensure_active_topic(&mut self) {
        if let Some(document) = self.document.as_ref() {
            match self.active_topic_id.as_ref() {
                Some(topic_id) if document.contains_topic(topic_id) => {}
                _ => self.active_topic_id = Some(document.root_topic().id.clone()),
            }
        }
    }
}

impl TopicSnapshot {
    pub(crate) fn new(text: &str) -> Self {
        Self {
            id: create_id("topic"),
            text: text.to_string(),
            collapsed: false,
            children: Vec::new(),
            style_ref: None,
            style_overrides: None,
            markers: Vec::new(),
            labels: Vec::new(),
            notes: None,
            link: None,
            image: None,
            task: None,
            layout_hints: None,
            extensions: None,
            extra: serde_json::Map::new(),
        }
    }
}

impl SheetSnapshot {
    pub(crate) fn new(title: &str) -> Self {
        Self {
            id: create_id("sheet"),
            title: title.to_string(),
            root_topic: TopicSnapshot {
                id: create_id("topic"),
                text: "中心主题".into(),
                collapsed: false,
                children: vec![
                    TopicSnapshot::new("关键洞察"),
                    TopicSnapshot::new("行动项"),
                    TopicSnapshot::new("待验证假设"),
                ],
                style_ref: None,
                style_overrides: None,
                markers: Vec::new(),
                labels: Vec::new(),
                notes: None,
                link: None,
                image: None,
                task: None,
                layout_hints: None,
                extensions: None,
                extra: serde_json::Map::new(),
            },
            chart_type: None,
            layout_config: None,
            branch_style: None,
            floating_topics: Vec::new(),
            boundaries: Vec::new(),
            summaries: Vec::new(),
            extensions: None,
            extra: serde_json::Map::new(),
        }
    }

    /// 返回画布的有效图表类型，缺省回退为 Mindmap。
    pub fn effective_chart_type(&self) -> ChartType {
        self.chart_type.unwrap_or_default()
    }
}

fn count_topics(topic: &TopicSnapshot) -> usize {
    1 + topic.children.iter().map(count_topics).sum::<usize>()
}

pub(crate) fn find_topic<'a>(topic: &'a TopicSnapshot, topic_id: &str) -> Option<&'a TopicSnapshot> {
    if topic.id == topic_id {
        return Some(topic);
    }

    topic
        .children
        .iter()
        .find_map(|child| find_topic(child, topic_id))
}

pub(crate) fn find_topic_mut<'a>(topic: &'a mut TopicSnapshot, topic_id: &str) -> Option<&'a mut TopicSnapshot> {
    if topic.id == topic_id {
        return Some(topic);
    }

    for child in &mut topic.children {
        if let Some(match_topic) = find_topic_mut(child, topic_id) {
            return Some(match_topic);
        }
    }

    None
}

pub(crate) fn find_parent_id_and_index(topic: &TopicSnapshot, child_id: &str) -> Option<(String, usize)> {
    for (index, child) in topic.children.iter().enumerate() {
        if child.id == child_id {
            return Some((topic.id.clone(), index));
        }

        if let Some(result) = find_parent_id_and_index(child, child_id) {
            return Some(result);
        }
    }

    None
}

pub(crate) fn contains_topic(topic: &TopicSnapshot, target_id: &str) -> bool {
    if topic.id == target_id {
        return true;
    }

    topic
        .children
        .iter()
        .any(|child| contains_topic(child, target_id))
}

pub(crate) fn normalize_topic_ids_for_delete(
    root_topic: &TopicSnapshot,
    topic_ids: &[String],
) -> Result<Vec<String>, String> {
    let mut normalized_topic_ids: Vec<String> = Vec::new();

    for topic_id in topic_ids {
        if topic_id == &root_topic.id {
            return Err("根主题不能删除".into());
        }

        if find_topic(root_topic, topic_id).is_none() {
            continue;
        }

        if normalized_topic_ids
            .iter()
            .any(|selected_id| contains_topic(find_topic(root_topic, selected_id).unwrap(), topic_id))
        {
            continue;
        }

        normalized_topic_ids.retain(|selected_id| {
            find_topic(root_topic, topic_id)
                .map(|topic| !contains_topic(topic, selected_id))
                .unwrap_or(true)
        });
        normalized_topic_ids.push(topic_id.clone());
    }

    if normalized_topic_ids.is_empty() {
        return Err("没有可删除的主题".into());
    }

    Ok(normalized_topic_ids)
}

pub(crate) fn normalize_topic_ids_for_batch(
    root_topic: &TopicSnapshot,
    topic_ids: &[String],
    root_error: &str,
    empty_error: &str,
) -> Result<Vec<String>, String> {
    let mut normalized_topic_ids: Vec<String> = Vec::new();

    for topic_id in topic_ids {
        if topic_id == &root_topic.id {
            return Err(root_error.into());
        }

        let Some(topic) = find_topic(root_topic, topic_id) else {
            continue;
        };

        if normalized_topic_ids.iter().any(|selected_id| selected_id == topic_id) {
            continue;
        }

        if normalized_topic_ids.iter().any(|selected_id| {
            find_topic(root_topic, selected_id)
                .map(|selected_topic| contains_topic(selected_topic, topic_id))
                .unwrap_or(false)
        }) {
            continue;
        }

        normalized_topic_ids.retain(|selected_id| !contains_topic(topic, selected_id));
        normalized_topic_ids.push(topic_id.clone());
    }

    if normalized_topic_ids.is_empty() {
        return Err(empty_error.into());
    }

    Ok(normalized_topic_ids)
}

pub(crate) fn clone_topic_branch(topic: &TopicSnapshot) -> TopicSnapshot {
    TopicSnapshot {
        id: create_id("topic"),
        text: topic.text.clone(),
        collapsed: topic.collapsed,
        children: topic.children.iter().map(clone_topic_branch).collect(),
        style_ref: topic.style_ref.clone(),
        style_overrides: topic.style_overrides.clone(),
        markers: topic.markers.clone(),
        labels: topic.labels.clone(),
        notes: topic.notes.clone(),
        link: topic.link.clone(),
        image: topic.image.clone(),
        task: topic.task.clone(),
        layout_hints: topic.layout_hints.clone(),
        extensions: topic.extensions.clone(),
        extra: topic.extra.clone(),
    }
}

/// 克隆主题分支并记录 old_id → new_id 映射，用于 regenerate_ids。
fn clone_topic_branch_with_map(
    topic: &TopicSnapshot,
    id_map: &mut HashMap<String, String>,
) -> TopicSnapshot {
    let new_id = create_id("topic");
    id_map.insert(topic.id.clone(), new_id.clone());

    TopicSnapshot {
        id: new_id,
        text: topic.text.clone(),
        collapsed: topic.collapsed,
        children: topic
            .children
            .iter()
            .map(|child| clone_topic_branch_with_map(child, id_map))
            .collect(),
        style_ref: topic.style_ref.clone(),
        style_overrides: topic.style_overrides.clone(),
        markers: topic.markers.clone(),
        labels: topic.labels.clone(),
        notes: topic.notes.clone(),
        link: topic.link.clone(),
        image: topic.image.clone(),
        task: topic.task.clone(),
        layout_hints: topic.layout_hints.clone(),
        extensions: topic.extensions.clone(),
        extra: topic.extra.clone(),
    }
}

pub fn create_id(prefix: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_micros())
        .unwrap_or(0);
    let sequence = ID_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!("{prefix}_{timestamp}_{sequence}")
}

#[cfg(test)]
mod tests {
    use super::{
        Boundary, DocumentRepairReport, DocumentSession, DocumentSnapshot, Relationship,
        SummaryNode, TopicSnapshot,
    };

    #[test]
    fn create_child_topic_updates_history_and_selection() {
        let mut session = DocumentSession::create_default();
        let root_topic_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .id
            .clone();

        let snapshot = session
            .create_child_topic(&root_topic_id)
            .expect("child topic should be created");

        assert_eq!(snapshot.summary.topic_count, 5);
        assert!(snapshot.can_undo);
        assert_eq!(
            snapshot.active_topic_id,
            snapshot.document.root_topic().children[3].id
        );
    }

    #[test]
    fn set_document_setting_writes_and_removes_keys_without_undo() {
        let mut session = DocumentSession::create_default();

        let snapshot = session
            .set_document_setting("canvas.showGrid", Some(serde_json::json!(true)))
            .expect("setting should be written");
        assert_eq!(
            snapshot.document.settings.as_ref().and_then(|s| s.get("canvas.showGrid")),
            Some(&serde_json::json!(true))
        );

        // 视图偏好不入撤销栈：can_undo 仍为 false。
        assert!(!snapshot.can_undo);
        let before_revision = session
            .document
            .as_ref()
            .expect("document should exist")
            .revision;
        assert!(before_revision >= 2);

        // value=None 删除键。
        let snapshot = session
            .set_document_setting("canvas.showGrid", None)
            .expect("setting should be removed");
        assert!(snapshot
            .document
            .settings
            .as_ref()
            .and_then(|s| s.get("canvas.showGrid"))
            .is_none());

        // 空键报错。
        let error = session
            .set_document_setting("   ", Some(serde_json::json!(1)))
            .expect_err("empty key should fail");
        assert!(error.contains("设置键不能为空"));
    }

    #[test]
    fn undo_and_redo_restore_document_revisions() {
        let mut session = DocumentSession::create_default();
        let root_topic_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .id
            .clone();

        let created = session
            .create_child_topic(&root_topic_id)
            .expect("child topic should be created");
        let undone = session.undo().expect("undo should succeed");
        let redone = session.redo().expect("redo should succeed");

        assert_eq!(created.summary.topic_count, 5);
        assert_eq!(undone.summary.topic_count, 4);
        assert_eq!(redone.summary.topic_count, 5);
        assert!(redone.can_undo);
    }

    #[test]
    fn move_topic_reparents_branch_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let source_topic_id = root_topic.children[0].id.clone();
        let target_parent_id = root_topic.children[1].id.clone();

        let moved = session
            .move_topic(&source_topic_id, &target_parent_id, None)
            .expect("move should succeed");
        let target_parent = super::find_topic(moved.document.root_topic(), &target_parent_id)
            .expect("target parent should exist");
        let undone = session.undo().expect("undo should succeed");
        let restored_target =
            super::find_topic(undone.document.root_topic(), &target_parent_id)
                .expect("target parent should exist after undo");

        assert_eq!(moved.active_topic_id, source_topic_id);
        assert_eq!(target_parent.children.len(), 1);
        assert_eq!(target_parent.children[0].text, "关键洞察");
        assert!(restored_target.children.is_empty());
    }

    #[test]
    fn move_topic_in_parent_reorders_siblings_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let moving_topic_id = root_topic.children[2].id.clone();

        let moved = session
            .move_topic_in_parent(&moving_topic_id, "up")
            .expect("reorder should succeed");
        let reordered_children = &moved.document.root_topic().children;
        let undone = session.undo().expect("undo should succeed");
        let restored_children = &undone.document.root_topic().children;

        assert_eq!(moved.active_topic_id, moving_topic_id);
        assert_eq!(reordered_children[1].id, moving_topic_id);
        assert_eq!(reordered_children[2].text, "行动项");
        assert_eq!(restored_children[1].text, "行动项");
        assert_eq!(restored_children[2].id, moving_topic_id);
    }

    #[test]
    fn move_topic_to_sheet_moves_branch_and_activates_destination_sheet() {
        let mut session = DocumentSession::create_default();
        let first_sheet_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .sheets[0]
            .id
            .clone();
        let source_topic_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .children[0]
            .id
            .clone();
        let second_sheet = session.create_sheet().expect("sheet should be created");
        let target_sheet_id = second_sheet.summary.active_sheet_id.clone();

        session
            .select_sheet(&first_sheet_id)
            .expect("first sheet should be reselected");

        let moved = session
            .move_topic_to_sheet(&source_topic_id, &target_sheet_id, None, None)
            .expect("topic should move across sheets");
        let destination_sheet = moved
            .document
            .find_sheet(&target_sheet_id)
            .expect("destination sheet should exist");

        assert_eq!(moved.summary.active_sheet_id, target_sheet_id);
        assert_eq!(moved.active_topic_id, source_topic_id);
        assert!(destination_sheet
            .root_topic
            .children
            .iter()
            .any(|child| child.id == source_topic_id));
    }

    #[test]
    fn move_topic_to_sheet_can_target_specific_parent() {
        let mut session = DocumentSession::create_default();
        let first_sheet_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .sheets[0]
            .id
            .clone();
        let source_topic_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .children[0]
            .id
            .clone();
        let second_sheet = session.create_sheet().expect("sheet should be created");
        let target_sheet_id = second_sheet.summary.active_sheet_id.clone();
        let target_root_id = session
            .document
            .as_ref()
            .and_then(|document| document.find_sheet(&target_sheet_id))
            .expect("target sheet should exist")
            .root_topic
            .id
            .clone();
        let target_parent_id = session
            .create_child_topic(&target_root_id)
            .expect("target parent should be created")
            .active_topic_id;

        session
            .select_sheet(&first_sheet_id)
            .expect("first sheet should be reselected");

        let moved = session
            .move_topic_to_sheet(&source_topic_id, &target_sheet_id, Some(&target_parent_id), None)
            .expect("topic should move under target parent");
        let destination_sheet = moved
            .document
            .find_sheet(&target_sheet_id)
            .expect("destination sheet should exist");
        let target_parent = super::find_topic(&destination_sheet.root_topic, &target_parent_id)
            .expect("target parent should exist");

        assert!(target_parent
            .children
            .iter()
            .any(|child| child.id == source_topic_id));
    }

    #[test]
    fn move_topics_to_parent_moves_multiple_branches_in_one_command() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let target_parent_id = root_topic.children[2].id.clone();
        let topic_ids = vec![root_topic.children[0].id.clone(), root_topic.children[1].id.clone()];

        let moved = session
            .move_topics(&topic_ids, &target_parent_id, None)
            .expect("batch move should succeed");
        let target_parent = super::find_topic(moved.document.root_topic(), &target_parent_id)
            .expect("target parent should exist");

        assert_eq!(target_parent.children.len(), 2);
        assert_eq!(target_parent.children[0].id, topic_ids[0]);
        assert_eq!(target_parent.children[1].id, topic_ids[1]);
        assert_eq!(moved.active_topic_id, topic_ids[1]);
    }

    #[test]
    fn move_topics_to_sheet_moves_multiple_branches_in_one_command() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let second_sheet = session.create_sheet().expect("second sheet should be created");
        let target_sheet_id = second_sheet.summary.active_sheet_id.clone();

        session
            .select_sheet(&session.document.as_ref().unwrap().sheets[0].id.clone())
            .expect("should switch back to source sheet");

        let moved = session
            .move_topics_to_sheet(
                &[root_topic.children[0].id.clone(), root_topic.children[1].id.clone()],
                &target_sheet_id,
                None,
                None,
            )
            .expect("batch move to sheet should succeed");
        let destination_sheet = moved
            .document
            .find_sheet(&target_sheet_id)
            .expect("destination sheet should exist");

        assert!(destination_sheet
            .root_topic
            .children
            .iter()
            .any(|child| child.id == root_topic.children[0].id));
        assert!(destination_sheet
            .root_topic
            .children
            .iter()
            .any(|child| child.id == root_topic.children[1].id));
        assert_eq!(moved.active_topic_id, root_topic.children[1].id);
    }

    #[test]
    fn copy_topic_to_sheet_clones_branch_under_target_parent() {
        let mut session = DocumentSession::create_default();
        let first_sheet_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .sheets[0]
            .id
            .clone();
        let source_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .children[0]
            .clone();
        let second_sheet = session.create_sheet().expect("sheet should be created");
        let target_sheet_id = second_sheet.summary.active_sheet_id.clone();
        let target_root_id = session
            .document
            .as_ref()
            .and_then(|document| document.find_sheet(&target_sheet_id))
            .expect("target sheet should exist")
            .root_topic
            .id
            .clone();
        let target_parent_id = session
            .create_child_topic(&target_root_id)
            .expect("target parent should be created")
            .active_topic_id;

        session
            .select_sheet(&first_sheet_id)
            .expect("first sheet should be reselected");

        let copied = session
            .copy_topic_to_sheet(&source_topic.id, &target_sheet_id, Some(&target_parent_id), None)
            .expect("topic should be copied under target parent");
        let source_sheet = copied
            .document
            .find_sheet(&first_sheet_id)
            .expect("source sheet should exist");
        let destination_sheet = copied
            .document
            .find_sheet(&target_sheet_id)
            .expect("destination sheet should exist");
        let target_parent = super::find_topic(&destination_sheet.root_topic, &target_parent_id)
            .expect("target parent should exist");
        let copied_topic = target_parent
            .children
            .last()
            .expect("copied topic should exist");

        assert!(source_sheet
            .root_topic
            .children
            .iter()
            .any(|child| child.id == source_topic.id));
        assert_eq!(copied_topic.text, source_topic.text);
        assert_ne!(copied_topic.id, source_topic.id);
        assert_eq!(copied.active_topic_id, copied_topic.id);
    }

    #[test]
    fn copy_topics_to_sheet_clones_multiple_branches_under_target_parent() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let second_sheet = session.create_sheet().expect("second sheet should be created");
        let target_sheet_id = second_sheet.summary.active_sheet_id.clone();
        let target_root_id = second_sheet
            .document
            .find_sheet(&target_sheet_id)
            .expect("target sheet should exist")
            .root_topic
            .id
            .clone();
        let bucket_created = session
            .create_child_topic(&target_root_id)
            .expect("bucket should be created");
        let target_parent_id = bucket_created.active_topic_id.clone();

        session
            .select_sheet(&session.document.as_ref().unwrap().sheets[0].id.clone())
            .expect("should switch back to source sheet");

        let copied = session
            .copy_topics_to_sheet(
                &[root_topic.children[0].id.clone(), root_topic.children[1].id.clone()],
                &target_sheet_id,
                Some(&target_parent_id),
                None,
            )
            .expect("batch copy to sheet should succeed");
        let destination_sheet = copied
            .document
            .find_sheet(&target_sheet_id)
            .expect("destination sheet should exist");
        let target_parent = super::find_topic(&destination_sheet.root_topic, &target_parent_id)
            .expect("target parent should exist");

        assert_eq!(target_parent.children.len(), 2);
        assert_eq!(target_parent.children[0].text, root_topic.children[0].text);
        assert_eq!(target_parent.children[1].text, root_topic.children[1].text);
    }

    #[test]
    fn delete_topics_removes_multiple_branches_in_one_command() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let topic_ids = vec![root_topic.children[0].id.clone(), root_topic.children[2].id.clone()];

        let deleted = session
            .delete_topics(&topic_ids, None)
            .expect("batch delete should succeed");
        let undone = session.undo().expect("undo should succeed");

        assert_eq!(deleted.summary.topic_count, 2);
        assert_eq!(deleted.document.root_topic().children.len(), 1);
        assert_eq!(deleted.active_topic_id, deleted.document.root_topic().id);
        assert_eq!(undone.summary.topic_count, 4);
    }

    #[test]
    fn toggle_topic_collapsed_updates_visibility_state_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let topic_id = root_topic.children[0].id.clone();

        session
            .create_child_topic(&topic_id)
            .expect("child topic should be created before collapsing");

        let collapsed = session
            .toggle_topic_collapsed(&topic_id)
            .expect("collapse should succeed");
        let collapsed_topic = super::find_topic(collapsed.document.root_topic(), &topic_id)
            .expect("topic should exist after collapse");
        let undone = session.undo().expect("undo should succeed");
        let restored_topic = super::find_topic(undone.document.root_topic(), &topic_id)
            .expect("topic should exist after undo");

        assert!(collapsed_topic.collapsed);
        assert!(!restored_topic.collapsed);
        assert_eq!(collapsed.active_topic_id, topic_id);
    }

    #[test]
    fn paste_topics_clones_branch_with_new_ids_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let source_topic_id = root_topic.children[0].id.clone();
        let target_parent_id = root_topic.children[1].id.clone();

        session
            .create_child_topic(&source_topic_id)
            .expect("child topic should be created");

        let source_topic = super::find_topic(
            session
                .document
                .as_ref()
                .expect("document should exist")
                .root_topic(),
            &source_topic_id,
        )
        .expect("source topic should exist")
        .clone();
        let pasted = session
            .paste_topics(&[source_topic], &target_parent_id)
            .expect("paste should succeed");
        let target_parent = super::find_topic(pasted.document.root_topic(), &target_parent_id)
            .expect("target parent should exist");
        let pasted_topic = target_parent
            .children
            .last()
            .expect("pasted topic should exist");
        let undone = session.undo().expect("undo should succeed");
        let restored_target = super::find_topic(undone.document.root_topic(), &target_parent_id)
            .expect("target parent should exist after undo");

        assert_eq!(target_parent.children.len(), 1);
        assert_eq!(pasted_topic.text, "关键洞察");
        assert_ne!(pasted_topic.id, source_topic_id);
        assert_eq!(pasted_topic.children.len(), 1);
        assert!(restored_target.children.is_empty());
    }

    #[test]
    fn create_select_rename_and_delete_sheet_updates_active_sheet() {
        let mut session = DocumentSession::create_default();
        let first_sheet_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .active_sheet_id
            .clone();

        let created = session.create_sheet().expect("sheet should be created");
        let second_sheet_id = created.summary.active_sheet_id.clone();
        let renamed = session
            .rename_sheet(&second_sheet_id, "拆解画布")
            .expect("sheet should be renamed");
        let selected = session
            .select_sheet(&first_sheet_id)
            .expect("sheet should be selected");
        let deleted = session
            .delete_sheet(&second_sheet_id)
            .expect("sheet should be deleted");

        assert_eq!(created.summary.sheet_count, 2);
        assert_eq!(renamed.document.active_sheet().title, "拆解画布");
        assert_eq!(selected.summary.active_sheet_id, first_sheet_id);
        assert_eq!(deleted.summary.sheet_count, 1);
    }

    #[test]
    fn move_sheet_reorders_document_sheets() {
        let mut session = DocumentSession::create_default();
        let first_sheet_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .sheets[0]
            .id
            .clone();

        let second = session.create_sheet().expect("second sheet should be created");
        let second_sheet_id = second.summary.active_sheet_id.clone();
        let third = session.create_sheet().expect("third sheet should be created");
        let third_sheet_id = third.summary.active_sheet_id.clone();
        let moved_up = session
            .move_sheet(&third_sheet_id, "up")
            .expect("sheet should move up");
        let moved_down = session
            .move_sheet(&third_sheet_id, "down")
            .expect("sheet should move down");

        assert_eq!(
            moved_up
                .document
                .sheets
                .iter()
                .map(|sheet| sheet.id.as_str())
                .collect::<Vec<_>>(),
            vec![first_sheet_id.as_str(), third_sheet_id.as_str(), second_sheet_id.as_str()]
        );
        assert_eq!(
            moved_down
                .document
                .sheets
                .iter()
                .map(|sheet| sheet.id.as_str())
                .collect::<Vec<_>>(),
            vec![first_sheet_id.as_str(), second_sheet_id.as_str(), third_sheet_id.as_str()]
        );
    }

    #[test]
    fn clear_repair_report_removes_repair_summary_without_changing_document() {
        let mut session = DocumentSession::create_default();
        let original_document_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .document_id
            .clone();

        session.mark_repaired(DocumentRepairReport {
            source_path: "/tmp/broken.mgd".into(),
            destination_path: "/tmp/broken-fixed.mgd".into(),
            repaired_at_ms: 1_726_000_000_000,
            changes: vec!["已重新指定有效的活动画布".into()],
        });

        let cleared = session
            .clear_repair_report()
            .expect("repair report should be cleared");

        assert!(cleared.repair_report.is_none());
        assert_eq!(cleared.document.document_id, original_document_id);
    }

    #[test]
    fn regenerate_ids_produces_unique_ids_and_updates_references() {
        // 构建一个包含 boundary/summary/relationship 的文档
        let mut document = DocumentSnapshot::new_default();
        let sheet = &mut document.sheets[0];
        let root_id = sheet.root_topic.id.clone();
        let child_a_id = create_id_str("topic");
        let child_b_id = create_id_str("topic");
        sheet.root_topic.children.push(TopicSnapshot {
            id: child_a_id.clone(),
            text: "A".into(),
            collapsed: false,
            children: Vec::new(),
            style_ref: None,
            style_overrides: None,
            markers: Vec::new(),
            labels: Vec::new(),
            notes: None,
            link: None,
            image: None,
            task: None,
            layout_hints: None,
            extensions: None,
            extra: serde_json::Map::new(),
        });
        sheet.root_topic.children.push(TopicSnapshot {
            id: child_b_id.clone(),
            text: "B".into(),
            collapsed: false,
            children: Vec::new(),
            style_ref: None,
            style_overrides: None,
            markers: Vec::new(),
            labels: Vec::new(),
            notes: None,
            link: None,
            image: None,
            task: None,
            layout_hints: None,
            extensions: None,
            extra: serde_json::Map::new(),
        });

        // 添加 boundary/summary/relationship
        sheet.boundaries.push(Boundary {
            id: create_id_str("bnd"),
            topic_ids: vec![child_a_id.clone(), child_b_id.clone()],
            label: Some("分组".into()),
            style_ref: None,
        });
        sheet.summaries.push(SummaryNode {
            id: create_id_str("sum"),
            topic_ids: vec![child_a_id.clone(), child_b_id.clone()],
            label: "总结".into(),
            style_ref: None,
        });
        document.relationships.push(Relationship {
            id: create_id_str("rel"),
            from_topic_id: child_a_id.clone(),
            to_topic_id: child_b_id.clone(),
            label: Some("依赖".into()),
            style_ref: None,
            control_points: Vec::new(),
        });

        let old_doc_id = document.document_id.clone();
        let old_sheet_id = document.sheets[0].id.clone();
        let old_root_id = root_id.clone();

        let regenerated = document.regenerate_ids();

        // document_id 应改变
        assert_ne!(regenerated.document_id, old_doc_id);
        // revision 应重置为 1
        assert_eq!(regenerated.revision, 1);

        // sheet_id 应改变
        assert_ne!(regenerated.sheets[0].id, old_sheet_id);
        // active_sheet_id 应指向新 sheet_id
        assert_eq!(regenerated.active_sheet_id, regenerated.sheets[0].id);

        // root_topic id 应改变
        assert_ne!(regenerated.sheets[0].root_topic.id, old_root_id);

        // 子主题数量保持不变（new_default 有 3 个 + 新增 2 个 = 5）
        assert_eq!(regenerated.sheets[0].root_topic.children.len(), 5);

        // boundary topic_ids 应更新为新主题 ID
        let new_child_ids: Vec<String> = regenerated.sheets[0]
            .root_topic
            .children
            .iter()
            .map(|t| t.id.clone())
            .collect();
        let boundary = &regenerated.sheets[0].boundaries[0];
        assert!(new_child_ids.contains(&boundary.topic_ids[0]));
        assert!(new_child_ids.contains(&boundary.topic_ids[1]));

        // summary topic_ids 应更新
        let summary = &regenerated.sheets[0].summaries[0];
        assert!(new_child_ids.contains(&summary.topic_ids[0]));
        assert!(new_child_ids.contains(&summary.topic_ids[1]));

        // relationship from/to 应更新
        let rel = &regenerated.relationships[0];
        assert!(new_child_ids.contains(&rel.from_topic_id));
        assert!(new_child_ids.contains(&rel.to_topic_id));

        // 旧 ID 不应出现在新文档中
        assert!(!boundary.topic_ids.contains(&child_a_id));
        assert!(!boundary.topic_ids.contains(&child_b_id));
    }

    #[test]
    fn create_sibling_topic_before_inserts_in_front_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let target_id = root_topic.children[1].id.clone();

        let created = session
            .create_sibling_topic(&target_id, Some("before"))
            .expect("前插同级应成功");
        assert_eq!(created.summary.topic_count, 5);
        assert!(created.can_undo);

        let root = created.document.root_topic();
        assert_eq!(root.children.len(), 4);
        // 新主题占据 target 原位置(1)，target 顺延到 2
        assert_ne!(root.children[1].id, target_id);
        assert_eq!(root.children[2].id, target_id);

        let undone = session.undo().expect("undo should succeed");
        assert_eq!(undone.summary.topic_count, 4);
        assert_eq!(undone.document.root_topic().children.len(), 3);
    }

    #[test]
    fn create_parent_topic_wraps_topic_and_supports_undo() {
        let mut session = DocumentSession::create_default();
        let root_topic = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .clone();
        let target_id = root_topic.children[0].id.clone();

        let created = session
            .create_parent_topic(&target_id)
            .expect("插入父主题应成功");
        // 新父主题 +1，原 target 不变
        assert_eq!(created.summary.topic_count, 5);
        assert!(created.can_undo);

        let root = created.document.root_topic();
        assert_eq!(root.children.len(), 3);
        // 原位置(0)被新父主题占据，target 成为其子主题
        let new_parent = &root.children[0];
        assert_ne!(new_parent.id, target_id);
        assert_eq!(new_parent.children.len(), 1);
        assert_eq!(new_parent.children[0].id, target_id);

        let undone = session.undo().expect("undo should succeed");
        assert_eq!(undone.summary.topic_count, 4);
        assert_eq!(undone.document.root_topic().children[0].id, target_id);
    }

    #[test]
    fn create_parent_topic_rejects_root_topic() {
        let mut session = DocumentSession::create_default();
        let root_topic_id = session
            .document
            .as_ref()
            .expect("document should exist")
            .root_topic()
            .id
            .clone();
        assert!(session.create_parent_topic(&root_topic_id).is_err());
    }

    /// 测试辅助：直接调用 create_id，避免与 DocumentSnapshot::create_id 混淆。
    fn create_id_str(prefix: &str) -> String {
        super::create_id(prefix)
    }
}
