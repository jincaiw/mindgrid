//! Command / ChangeSet 系统。
//!
//! 替代旧的快照级历史：每次编辑命令产出一组自包含、可逆的原子操作（`Operation`），
//! 组成一个 `ChangeSet`。历史栈只保存 `ChangeSet`（紧凑），撤销逆序应用每个操作的逆操作，
//! 重做正向重放。批量命令（多选删除 / 跨画布移动等）在一个 `ChangeSet` 内事务化，
//! 任一原子操作失败时整体回滚（按逆序应用已记录操作的逆操作）。
//!
//! 这使历史内存占用从 O(文档大小) 降到 O(变更大小)，是 10k 节点规模下可编辑的前提。

use crate::domain::document::{
    clone_topic_branch, contains_topic, create_id, find_parent_id_and_index, find_topic,
    find_topic_mut, normalize_topic_ids_for_batch, normalize_topic_ids_for_delete, Boundary,
    ChartType, DocumentSnapshot, Relationship, SheetBranchStyle, SheetSnapshot,
    SummaryNode, ThemeRef, TopicImage, TopicLink, TopicLayoutHints, TopicMarker,
    TopicSnapshot, TopicStyleOverrides, TopicTask,
};

/// 主题字段级变更（正向 old→new，逆操作只需交换 old/new）。
#[derive(Debug, Clone, PartialEq)]
pub enum TopicFieldChange {
    Text { old: String, new: String },
    Collapsed { old: bool, new: bool },
    /// 备注（富文本，当前以纯字符串存储）。
    Notes { old: Option<String>, new: Option<String> },
    /// 超链接。
    Link { old: Option<TopicLink>, new: Option<TopicLink> },
    /// 标记列表（整体替换）。
    Markers { old: Vec<TopicMarker>, new: Vec<TopicMarker> },
    /// 标签列表（整体替换）。
    Labels { old: Vec<String>, new: Vec<String> },
    /// 任务属性。
    Task { old: Option<TopicTask>, new: Option<TopicTask> },
    /// 样式表引用。
    StyleRef { old: Option<String>, new: Option<String> },
    /// 节点级样式覆盖（fill / textColor / borderColor）。
    StyleOverrides {
        old: Option<TopicStyleOverrides>,
        new: Option<TopicStyleOverrides>,
    },
    /// 主题图片（引用 assets/ 下的资源，None 表示移除图片）。
    Image {
        old: Option<TopicImage>,
        new: Option<TopicImage>,
    },
}

/// 原子操作：自包含、可逆。每个操作记录足够信息以正向应用与逆向回滚。
#[derive(Debug, Clone, PartialEq)]
pub enum Operation {
    /// 主题字段变更（文本 / 折叠状态，未来扩展样式等）。
    SetTopicField {
        sheet_id: String,
        topic_id: String,
        change: TopicFieldChange,
    },
    /// 在 parent 的 index 处插入子主题。逆操作为 RemoveTopic。
    InsertTopic {
        sheet_id: String,
        parent_id: String,
        index: usize,
        topic: TopicSnapshot,
    },
    /// 移除 parent 的 index 处子主题。逆操作为 InsertTopic。
    RemoveTopic {
        sheet_id: String,
        parent_id: String,
        index: usize,
        topic: TopicSnapshot,
    },
    /// 同一画布内移动主题（跨父或同父重排）。逆操作交换 from/to。
    MoveTopic {
        sheet_id: String,
        topic_id: String,
        from_parent_id: String,
        from_index: usize,
        to_parent_id: String,
        to_index: usize,
    },
    /// 跨画布移动主题。逆操作交换 from/to。
    MoveTopicAcrossSheets {
        topic_id: String,
        from_sheet_id: String,
        from_parent_id: String,
        from_index: usize,
        to_sheet_id: String,
        to_parent_id: String,
        to_index: usize,
    },
    /// 在 index 处插入画布。逆操作为 RemoveSheet。
    InsertSheet { index: usize, sheet: SheetSnapshot },
    /// 移除 index 处画布。逆操作为 InsertSheet。
    RemoveSheet { index: usize, sheet: SheetSnapshot },
    /// 重排画布。逆操作交换 from/to。
    MoveSheet { from_index: usize, to_index: usize },
    /// 活动画布变更。逆操作交换 old/new。
    SetActiveSheet { old_id: String, new_id: String },
    /// 画布标题变更。逆操作交换 old/new。
    SetSheetTitle {
        sheet_id: String,
        old_title: String,
        new_title: String,
    },
    /// 画布图表类型变更。逆操作交换 old/new。None 表示回退到默认 mindmap。
    SetSheetChartType {
        sheet_id: String,
        old_chart_type: Option<ChartType>,
        new_chart_type: Option<ChartType>,
    },
    /// 画布分支样式变更。逆操作交换 old/new。None 表示回退到默认（curve + 默认线宽 + 8 色循环）。
    SetSheetBranchStyle {
        sheet_id: String,
        old_branch_style: Option<SheetBranchStyle>,
        new_branch_style: Option<SheetBranchStyle>,
    },
    /// 在画布的 floating_topics 列表末尾插入浮动主题。逆操作为 RemoveFloatingTopic。
    InsertFloatingTopic { sheet_id: String, topic: TopicSnapshot },
    /// 从画布的 floating_topics 列表移除浮动主题。逆操作为 InsertFloatingTopic。
    RemoveFloatingTopic { sheet_id: String, topic: TopicSnapshot },
    /// 在文档级 relationships 列表末尾插入关系线。逆操作为 RemoveRelationship。
    InsertRelationship { relationship: Relationship },
    /// 从文档级 relationships 列表移除关系线。逆操作为 InsertRelationship。
    RemoveRelationship { relationship: Relationship },
    /// 在画布的 boundaries 列表末尾插入边界。逆操作为 RemoveBoundary。
    InsertBoundary { sheet_id: String, boundary: Boundary },
    /// 从画布的 boundaries 列表移除边界。逆操作为 InsertBoundary。
    RemoveBoundary { sheet_id: String, boundary: Boundary },
    /// 在画布的 summaries 列表末尾插入概要。逆操作为 RemoveSummary。
    InsertSummary { sheet_id: String, summary: SummaryNode },
    /// 从画布的 summaries 列表移除概要。逆操作为 InsertSummary。
    RemoveSummary { sheet_id: String, summary: SummaryNode },
    /// 文档主题切换。逆操作交换 old/new。None 表示清除主题（回退到默认）。
    SetDocumentTheme {
        old_theme: Option<ThemeRef>,
        new_theme: Option<ThemeRef>,
    },
}

/// 一个编辑命令产生的事务化变更集合。
#[derive(Debug, Clone, PartialEq)]
pub struct ChangeSet {
    pub action_label: String,
    pub ops: Vec<Operation>,
}

impl ChangeSet {
    pub fn is_empty(&self) -> bool {
        self.ops.is_empty()
    }
}

/// 返回操作的逆操作。逆操作应用于文档后可精确撤销正向操作。
pub fn invert_operation(op: &Operation) -> Operation {
    match op {
        Operation::SetTopicField { sheet_id, topic_id, change } => {
            let inverted = match change {
                TopicFieldChange::Text { old, new } => TopicFieldChange::Text {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Collapsed { old, new } => TopicFieldChange::Collapsed {
                    old: *new,
                    new: *old,
                },
                TopicFieldChange::Notes { old, new } => TopicFieldChange::Notes {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Link { old, new } => TopicFieldChange::Link {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Markers { old, new } => TopicFieldChange::Markers {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Labels { old, new } => TopicFieldChange::Labels {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Task { old, new } => TopicFieldChange::Task {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::StyleRef { old, new } => TopicFieldChange::StyleRef {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::StyleOverrides { old, new } => TopicFieldChange::StyleOverrides {
                    old: new.clone(),
                    new: old.clone(),
                },
                TopicFieldChange::Image { old, new } => TopicFieldChange::Image {
                    old: new.clone(),
                    new: old.clone(),
                },
            };
            Operation::SetTopicField {
                sheet_id: sheet_id.clone(),
                topic_id: topic_id.clone(),
                change: inverted,
            }
        }
        Operation::InsertTopic { sheet_id, parent_id, index, topic } => Operation::RemoveTopic {
            sheet_id: sheet_id.clone(),
            parent_id: parent_id.clone(),
            index: *index,
            topic: topic.clone(),
        },
        Operation::RemoveTopic { sheet_id, parent_id, index, topic } => Operation::InsertTopic {
            sheet_id: sheet_id.clone(),
            parent_id: parent_id.clone(),
            index: *index,
            topic: topic.clone(),
        },
        Operation::MoveTopic { sheet_id, topic_id, from_parent_id, from_index, to_parent_id, to_index } => {
            Operation::MoveTopic {
                sheet_id: sheet_id.clone(),
                topic_id: topic_id.clone(),
                from_parent_id: to_parent_id.clone(),
                from_index: *to_index,
                to_parent_id: from_parent_id.clone(),
                to_index: *from_index,
            }
        }
        Operation::MoveTopicAcrossSheets {
            topic_id,
            from_sheet_id,
            from_parent_id,
            from_index,
            to_sheet_id,
            to_parent_id,
            to_index,
        } => Operation::MoveTopicAcrossSheets {
            topic_id: topic_id.clone(),
            from_sheet_id: to_sheet_id.clone(),
            from_parent_id: to_parent_id.clone(),
            from_index: *to_index,
            to_sheet_id: from_sheet_id.clone(),
            to_parent_id: from_parent_id.clone(),
            to_index: *from_index,
        },
        Operation::InsertSheet { index, sheet } => Operation::RemoveSheet {
            index: *index,
            sheet: sheet.clone(),
        },
        Operation::RemoveSheet { index, sheet } => Operation::InsertSheet {
            index: *index,
            sheet: sheet.clone(),
        },
        Operation::MoveSheet { from_index, to_index } => Operation::MoveSheet {
            from_index: *to_index,
            to_index: *from_index,
        },
        Operation::SetActiveSheet { old_id, new_id } => Operation::SetActiveSheet {
            old_id: new_id.clone(),
            new_id: old_id.clone(),
        },
        Operation::SetSheetTitle { sheet_id, old_title, new_title } => Operation::SetSheetTitle {
            sheet_id: sheet_id.clone(),
            old_title: new_title.clone(),
            new_title: old_title.clone(),
        },
        Operation::SetSheetChartType { sheet_id, old_chart_type, new_chart_type } => {
            Operation::SetSheetChartType {
                sheet_id: sheet_id.clone(),
                old_chart_type: *new_chart_type,
                new_chart_type: *old_chart_type,
            }
        }
        Operation::SetSheetBranchStyle {
            sheet_id,
            old_branch_style,
            new_branch_style,
        } => Operation::SetSheetBranchStyle {
            sheet_id: sheet_id.clone(),
            old_branch_style: new_branch_style.clone(),
            new_branch_style: old_branch_style.clone(),
        },
        Operation::InsertFloatingTopic { sheet_id, topic } => Operation::RemoveFloatingTopic {
            sheet_id: sheet_id.clone(),
            topic: topic.clone(),
        },
        Operation::RemoveFloatingTopic { sheet_id, topic } => Operation::InsertFloatingTopic {
            sheet_id: sheet_id.clone(),
            topic: topic.clone(),
        },
        Operation::InsertRelationship { relationship } => Operation::RemoveRelationship {
            relationship: relationship.clone(),
        },
        Operation::RemoveRelationship { relationship } => Operation::InsertRelationship {
            relationship: relationship.clone(),
        },
        Operation::InsertBoundary { sheet_id, boundary } => Operation::RemoveBoundary {
            sheet_id: sheet_id.clone(),
            boundary: boundary.clone(),
        },
        Operation::RemoveBoundary { sheet_id, boundary } => Operation::InsertBoundary {
            sheet_id: sheet_id.clone(),
            boundary: boundary.clone(),
        },
        Operation::InsertSummary { sheet_id, summary } => Operation::RemoveSummary {
            sheet_id: sheet_id.clone(),
            summary: summary.clone(),
        },
        Operation::RemoveSummary { sheet_id, summary } => Operation::InsertSummary {
            sheet_id: sheet_id.clone(),
            summary: summary.clone(),
        },
        Operation::SetDocumentTheme { old_theme, new_theme } => Operation::SetDocumentTheme {
            old_theme: new_theme.clone(),
            new_theme: old_theme.clone(),
        },
    }
}

// ----------------------------------------------------------------------------
// 低层共享 mutator：editor 正向执行与 apply_operation（undo/redo）共用同一实现，
// 保证正/逆向应用语义一致。
// ----------------------------------------------------------------------------

fn do_set_topic_field(document: &mut DocumentSnapshot, sheet_id: &str, topic_id: &str, change: &TopicFieldChange) {
    let Some(sheet) = document.find_sheet_mut(sheet_id) else { return };
    // 先查树，再查浮动主题
    let topic = if let Some(t) = find_topic_mut(&mut sheet.root_topic, topic_id) {
        t
    } else if let Some(t) = sheet.floating_topics.iter_mut().find(|t| t.id == topic_id) {
        t
    } else {
        return;
    };
    match change {
        TopicFieldChange::Text { new, .. } => topic.text = new.clone(),
        TopicFieldChange::Collapsed { new, .. } => topic.collapsed = *new,
        TopicFieldChange::Notes { new, .. } => topic.notes = new.clone(),
        TopicFieldChange::Link { new, .. } => topic.link = new.clone(),
        TopicFieldChange::Markers { new, .. } => topic.markers = new.clone(),
        TopicFieldChange::Labels { new, .. } => topic.labels = new.clone(),
        TopicFieldChange::Task { new, .. } => topic.task = new.clone(),
        TopicFieldChange::StyleRef { new, .. } => topic.style_ref = new.clone(),
        TopicFieldChange::StyleOverrides { new, .. } => topic.style_overrides = new.clone(),
        TopicFieldChange::Image { new, .. } => topic.image = new.clone(),
    }
}

fn do_insert_topic(document: &mut DocumentSnapshot, sheet_id: &str, parent_id: &str, index: usize, topic: TopicSnapshot) {
    let Some(sheet) = document.find_sheet_mut(sheet_id) else { return };
    let Some(parent) = find_topic_mut(&mut sheet.root_topic, parent_id) else { return };
    parent.children.insert(index.min(parent.children.len()), topic);
}

fn do_remove_topic(document: &mut DocumentSnapshot, sheet_id: &str, parent_id: &str, index: usize) -> Option<TopicSnapshot> {
    let sheet = document.find_sheet_mut(sheet_id)?;
    let parent = find_topic_mut(&mut sheet.root_topic, parent_id)?;
    if index < parent.children.len() {
        Some(parent.children.remove(index))
    } else {
        None
    }
}

/// 同一画布内移动：从 from_parent@from_index 取出，插入到 to_parent@to_index。
fn do_move_within_sheet(
    document: &mut DocumentSnapshot,
    sheet_id: &str,
    from_parent_id: &str,
    from_index: usize,
    to_parent_id: &str,
    to_index: usize,
) {
    let moved = {
        let Some(sheet) = document.find_sheet_mut(sheet_id) else { return };
        let Some(parent) = find_topic_mut(&mut sheet.root_topic, from_parent_id) else { return };
        if from_index >= parent.children.len() {
            return;
        }
        parent.children.remove(from_index)
    };
    let Some(sheet) = document.find_sheet_mut(sheet_id) else { return };
    let Some(parent) = find_topic_mut(&mut sheet.root_topic, to_parent_id) else { return };
    parent.children.insert(to_index.min(parent.children.len()), moved);
}

/// 跨画布移动：从源画布取出，插入目标画布。
fn do_move_across_sheets(
    document: &mut DocumentSnapshot,
    from_sheet_id: &str,
    from_parent_id: &str,
    from_index: usize,
    to_sheet_id: &str,
    to_parent_id: &str,
    to_index: usize,
) {
    let moved = {
        let Some(sheet) = document.find_sheet_mut(from_sheet_id) else { return };
        let Some(parent) = find_topic_mut(&mut sheet.root_topic, from_parent_id) else { return };
        if from_index >= parent.children.len() {
            return;
        }
        parent.children.remove(from_index)
    };
    let Some(sheet) = document.find_sheet_mut(to_sheet_id) else { return };
    let Some(parent) = find_topic_mut(&mut sheet.root_topic, to_parent_id) else { return };
    parent.children.insert(to_index.min(parent.children.len()), moved);
}

fn do_insert_sheet(document: &mut DocumentSnapshot, index: usize, sheet: SheetSnapshot) {
    document.sheets.insert(index.min(document.sheets.len()), sheet);
}

fn do_remove_sheet(document: &mut DocumentSnapshot, index: usize) -> Option<SheetSnapshot> {
    if index < document.sheets.len() {
        Some(document.sheets.remove(index))
    } else {
        None
    }
}

fn do_move_sheet(document: &mut DocumentSnapshot, from_index: usize, to_index: usize) {
    if from_index >= document.sheets.len() {
        return;
    }
    let sheet = document.sheets.remove(from_index);
    document.sheets.insert(to_index.min(document.sheets.len()), sheet);
}

fn do_set_active_sheet(document: &mut DocumentSnapshot, id: &str) {
    document.active_sheet_id = id.to_string();
}

fn do_set_sheet_title(document: &mut DocumentSnapshot, sheet_id: &str, title: &str) {
    if let Some(sheet) = document.find_sheet_mut(sheet_id) {
        sheet.title = title.to_string();
    }
}

fn do_set_sheet_chart_type(
    document: &mut DocumentSnapshot,
    sheet_id: &str,
    chart_type: Option<ChartType>,
) {
    if let Some(sheet) = document.find_sheet_mut(sheet_id) {
        sheet.chart_type = chart_type;
    }
}

fn do_set_sheet_branch_style(
    document: &mut DocumentSnapshot,
    sheet_id: &str,
    branch_style: Option<SheetBranchStyle>,
) {
    if let Some(sheet) = document.find_sheet_mut(sheet_id) {
        sheet.branch_style = branch_style;
    }
}

/// 正向应用一个操作。用于 redo（以及 editor 执行后回放校验）。
pub fn apply_operation(document: &mut DocumentSnapshot, op: &Operation) {
    match op {
        Operation::SetTopicField { sheet_id, topic_id, change } => {
            do_set_topic_field(document, sheet_id, topic_id, change)
        }
        Operation::InsertTopic { sheet_id, parent_id, index, topic } => {
            do_insert_topic(document, sheet_id, parent_id, *index, topic.clone())
        }
        Operation::RemoveTopic { sheet_id, parent_id, index, .. } => {
            let _ = do_remove_topic(document, sheet_id, parent_id, *index);
        }
        Operation::MoveTopic { sheet_id, from_parent_id, from_index, to_parent_id, to_index, .. } => {
            do_move_within_sheet(document, sheet_id, from_parent_id, *from_index, to_parent_id, *to_index)
        }
        Operation::MoveTopicAcrossSheets {
            from_sheet_id,
            from_parent_id,
            from_index,
            to_sheet_id,
            to_parent_id,
            to_index,
            ..
        } => do_move_across_sheets(
            document,
            from_sheet_id,
            from_parent_id,
            *from_index,
            to_sheet_id,
            to_parent_id,
            *to_index,
        ),
        Operation::InsertSheet { index, sheet } => do_insert_sheet(document, *index, sheet.clone()),
        Operation::RemoveSheet { index, .. } => {
            let _ = do_remove_sheet(document, *index);
        }
        Operation::MoveSheet { from_index, to_index } => do_move_sheet(document, *from_index, *to_index),
        Operation::SetActiveSheet { new_id, .. } => do_set_active_sheet(document, new_id),
        Operation::SetSheetTitle { sheet_id, new_title, .. } => {
            do_set_sheet_title(document, sheet_id, new_title)
        }
        Operation::SetSheetChartType { sheet_id, new_chart_type, .. } => {
            do_set_sheet_chart_type(document, sheet_id, *new_chart_type)
        }
        Operation::SetSheetBranchStyle { sheet_id, new_branch_style, .. } => {
            do_set_sheet_branch_style(document, sheet_id, new_branch_style.clone())
        }
        Operation::InsertFloatingTopic { sheet_id, topic } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                sheet.floating_topics.push(topic.clone());
            }
        }
        Operation::RemoveFloatingTopic { sheet_id, topic } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                if let Some(pos) = sheet.floating_topics.iter().position(|t| t.id == topic.id) {
                    sheet.floating_topics.remove(pos);
                }
            }
        }
        Operation::InsertRelationship { relationship } => {
            document.relationships.push(relationship.clone());
        }
        Operation::RemoveRelationship { relationship } => {
            if let Some(pos) = document.relationships.iter().position(|r| r.id == relationship.id) {
                document.relationships.remove(pos);
            }
        }
        Operation::InsertBoundary { sheet_id, boundary } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                sheet.boundaries.push(boundary.clone());
            }
        }
        Operation::RemoveBoundary { sheet_id, boundary } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                if let Some(pos) = sheet.boundaries.iter().position(|b| b.id == boundary.id) {
                    sheet.boundaries.remove(pos);
                }
            }
        }
        Operation::InsertSummary { sheet_id, summary } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                sheet.summaries.push(summary.clone());
            }
        }
        Operation::RemoveSummary { sheet_id, summary } => {
            if let Some(sheet) = document.find_sheet_mut(sheet_id) {
                if let Some(pos) = sheet.summaries.iter().position(|s| s.id == summary.id) {
                    sheet.summaries.remove(pos);
                }
            }
        }
        Operation::SetDocumentTheme { new_theme, .. } => {
            document.theme = new_theme.clone();
        }
    }
}

/// 逆序应用一组操作的逆操作，用于撤销一个 ChangeSet。
pub fn apply_inverse(document: &mut DocumentSnapshot, ops: &[Operation]) {
    for op in ops.iter().rev() {
        let inverse = invert_operation(op);
        apply_operation(document, &inverse);
    }
}

// ----------------------------------------------------------------------------
// DocumentEditor：在 &mut DocumentSnapshot 上执行高层命令，同时记录操作日志。
// ----------------------------------------------------------------------------

pub struct DocumentEditor<'a> {
    document: &'a mut DocumentSnapshot,
    ops: Vec<Operation>,
}

impl<'a> DocumentEditor<'a> {
    pub fn new(document: &'a mut DocumentSnapshot) -> Self {
        Self { document, ops: Vec::new() }
    }

    pub fn into_ops(self) -> Vec<Operation> {
        self.ops
    }

    fn record(&mut self, op: Operation) {
        self.ops.push(op);
    }

    fn active_sheet_id(&self) -> String {
        self.document.active_sheet_id.clone()
    }

    /// 返回当前活动画布的根主题 id。供 DocumentSession 在不改变活动主题的命令中复用。
    pub fn root_topic_id(&self) -> String {
        self.document.root_topic().id.clone()
    }

    // ---- 低层原语：执行 + 记录 ----

    fn set_topic_text(&mut self, sheet_id: &str, topic_id: &str, new_text: String) {
        let change = {
            let Some(sheet) = self.document.find_sheet_mut(sheet_id) else { return };
            // 先查树，再查浮动主题
            if let Some(topic) = find_topic_mut(&mut sheet.root_topic, topic_id) {
                let old = topic.text.clone();
                if old == new_text {
                    return;
                }
                topic.text = new_text.clone();
                TopicFieldChange::Text { old, new: new_text }
            } else if let Some(topic) = sheet
                .floating_topics
                .iter_mut()
                .find(|t| t.id == topic_id)
            {
                let old = topic.text.clone();
                if old == new_text {
                    return;
                }
                topic.text = new_text.clone();
                TopicFieldChange::Text { old, new: new_text }
            } else {
                return;
            }
        };
        self.record(Operation::SetTopicField {
            sheet_id: sheet_id.to_string(),
            topic_id: topic_id.to_string(),
            change,
        });
    }

    fn set_topic_collapsed(&mut self, sheet_id: &str, topic_id: &str, new_collapsed: bool) {
        let change = {
            let Some(sheet) = self.document.find_sheet_mut(sheet_id) else { return };
            let Some(topic) = find_topic_mut(&mut sheet.root_topic, topic_id) else { return };
            let old = topic.collapsed;
            if old == new_collapsed {
                return;
            }
            topic.collapsed = new_collapsed;
            TopicFieldChange::Collapsed { old, new: new_collapsed }
        };
        self.record(Operation::SetTopicField {
            sheet_id: sheet_id.to_string(),
            topic_id: topic_id.to_string(),
            change,
        });
    }

    /// 通用富字段写入：读取旧值、比较、应用、记录。值相同时静默跳过。
    fn set_topic_rich_field<F, T>(
        &mut self,
        sheet_id: &str,
        topic_id: &str,
        new_value: T,
        read_old: F,
        build_change: impl FnOnce(T, T) -> TopicFieldChange,
        apply: impl FnOnce(&mut TopicSnapshot, T),
    ) where
        F: FnOnce(&mut TopicSnapshot) -> T,
        T: PartialEq + Clone,
    {
        let change = {
            let Some(sheet) = self.document.find_sheet_mut(sheet_id) else { return };
            // 先查树，再查浮动主题
            let topic = if let Some(t) = find_topic_mut(&mut sheet.root_topic, topic_id) {
                t
            } else if let Some(t) = sheet.floating_topics.iter_mut().find(|t| t.id == topic_id) {
                t
            } else {
                return;
            };
            let old = read_old(topic);
            if old == new_value {
                return;
            }
            apply(topic, new_value.clone());
            build_change(new_value, old)
        };
        self.record(Operation::SetTopicField {
            sheet_id: sheet_id.to_string(),
            topic_id: topic_id.to_string(),
            change,
        });
    }

    fn set_topic_notes_raw(&mut self, sheet_id: &str, topic_id: &str, new_notes: Option<String>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_notes,
            |t| t.notes.clone(),
            |new, old| TopicFieldChange::Notes { old, new },
            |t, v| t.notes = v,
        );
    }

    fn set_topic_link_raw(&mut self, sheet_id: &str, topic_id: &str, new_link: Option<TopicLink>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_link,
            |t| t.link.clone(),
            |new, old| TopicFieldChange::Link { old, new },
            |t, v| t.link = v,
        );
    }

    fn set_topic_markers_raw(&mut self, sheet_id: &str, topic_id: &str, new_markers: Vec<TopicMarker>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_markers,
            |t| t.markers.clone(),
            |new, old| TopicFieldChange::Markers { old, new },
            |t, v| t.markers = v,
        );
    }

    fn set_topic_labels_raw(&mut self, sheet_id: &str, topic_id: &str, new_labels: Vec<String>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_labels,
            |t| t.labels.clone(),
            |new, old| TopicFieldChange::Labels { old, new },
            |t, v| t.labels = v,
        );
    }

    fn set_topic_task_raw(&mut self, sheet_id: &str, topic_id: &str, new_task: Option<TopicTask>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_task,
            |t| t.task.clone(),
            |new, old| TopicFieldChange::Task { old, new },
            |t, v| t.task = v,
        );
    }

    fn set_topic_style_ref_raw(&mut self, sheet_id: &str, topic_id: &str, new_style_ref: Option<String>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_style_ref,
            |t| t.style_ref.clone(),
            |new, old| TopicFieldChange::StyleRef { old, new },
            |t, v| t.style_ref = v,
        );
    }

    fn set_topic_image_raw(&mut self, sheet_id: &str, topic_id: &str, new_image: Option<TopicImage>) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_image,
            |t| t.image.clone(),
            |new, old| TopicFieldChange::Image { old, new },
            |t, v| t.image = v,
        );
    }

    fn set_topic_style_overrides_raw(
        &mut self,
        sheet_id: &str,
        topic_id: &str,
        new_overrides: Option<TopicStyleOverrides>,
    ) {
        self.set_topic_rich_field(
            sheet_id,
            topic_id,
            new_overrides,
            |t| t.style_overrides.clone(),
            |new, old| TopicFieldChange::StyleOverrides { old, new },
            |t, v| t.style_overrides = v,
        );
    }

    /// 切换文档主题。`new_theme_id` 为空字符串或 None 表示清除主题（回退默认）。
    /// 相同主题不记录操作，确保 noop 不入历史栈。
    fn set_document_theme_raw(&mut self, new_theme: Option<ThemeRef>) {
        let old_theme = self.document.theme.clone();
        if old_theme == new_theme {
            return;
        }
        self.document.theme = new_theme.clone();
        self.record(Operation::SetDocumentTheme { old_theme, new_theme });
    }

    fn insert_topic(&mut self, sheet_id: &str, parent_id: &str, index: usize, topic: TopicSnapshot) {
        let op_topic = topic.clone();
        do_insert_topic(self.document, sheet_id, parent_id, index, topic);
        self.record(Operation::InsertTopic {
            sheet_id: sheet_id.to_string(),
            parent_id: parent_id.to_string(),
            index,
            topic: op_topic,
        });
    }

    fn remove_topic_by_id(&mut self, sheet_id: &str, topic_id: &str) -> Option<TopicSnapshot> {
        let (parent_id, index) = {
            let sheet = self.document.find_sheet_mut(sheet_id)?;
            find_parent_id_and_index(&sheet.root_topic, topic_id)?
        };
        let removed = do_remove_topic(self.document, sheet_id, &parent_id, index)?;
        self.record(Operation::RemoveTopic {
            sheet_id: sheet_id.to_string(),
            parent_id,
            index,
            topic: removed.clone(),
        });
        Some(removed)
    }

    fn move_within_sheet(
        &mut self,
        sheet_id: &str,
        topic_id: &str,
        from_parent_id: &str,
        from_index: usize,
        to_parent_id: &str,
        to_index: usize,
    ) {
        do_move_within_sheet(self.document, sheet_id, from_parent_id, from_index, to_parent_id, to_index);
        self.record(Operation::MoveTopic {
            sheet_id: sheet_id.to_string(),
            topic_id: topic_id.to_string(),
            from_parent_id: from_parent_id.to_string(),
            from_index,
            to_parent_id: to_parent_id.to_string(),
            to_index,
        });
    }

    fn move_across_sheets(
        &mut self,
        topic_id: &str,
        from_sheet_id: &str,
        from_parent_id: &str,
        from_index: usize,
        to_sheet_id: &str,
        to_parent_id: &str,
        to_index: usize,
    ) {
        do_move_across_sheets(
            self.document,
            from_sheet_id,
            from_parent_id,
            from_index,
            to_sheet_id,
            to_parent_id,
            to_index,
        );
        self.record(Operation::MoveTopicAcrossSheets {
            topic_id: topic_id.to_string(),
            from_sheet_id: from_sheet_id.to_string(),
            from_parent_id: from_parent_id.to_string(),
            from_index,
            to_sheet_id: to_sheet_id.to_string(),
            to_parent_id: to_parent_id.to_string(),
            to_index,
        });
    }

    fn set_active_sheet(&mut self, new_id: &str) {
        let old_id = self.document.active_sheet_id.clone();
        if old_id == new_id {
            return;
        }
        do_set_active_sheet(self.document, new_id);
        self.record(Operation::SetActiveSheet { old_id, new_id: new_id.to_string() });
    }

    fn set_sheet_title(&mut self, sheet_id: &str, new_title: &str) {
        let old_title = self
            .document
            .find_sheet(sheet_id)
            .map(|sheet| sheet.title.clone());
        let Some(old_title) = old_title else { return };
        if old_title == new_title {
            return;
        }
        do_set_sheet_title(self.document, sheet_id, new_title);
        self.record(Operation::SetSheetTitle {
            sheet_id: sheet_id.to_string(),
            old_title,
            new_title: new_title.to_string(),
        });
    }

    fn set_sheet_chart_type_raw(
        &mut self,
        sheet_id: &str,
        new_chart_type: Option<ChartType>,
    ) {
        let old_chart_type = self
            .document
            .find_sheet(sheet_id)
            .map(|sheet| sheet.chart_type);
        let Some(old_chart_type) = old_chart_type else { return };
        if old_chart_type == new_chart_type {
            return;
        }
        do_set_sheet_chart_type(self.document, sheet_id, new_chart_type);
        self.record(Operation::SetSheetChartType {
            sheet_id: sheet_id.to_string(),
            old_chart_type,
            new_chart_type,
        });
    }

    fn set_sheet_branch_style_raw(
        &mut self,
        sheet_id: &str,
        new_branch_style: Option<SheetBranchStyle>,
    ) {
        let old_branch_style = self
            .document
            .find_sheet(sheet_id)
            .map(|sheet| sheet.branch_style.clone());
        let Some(old_branch_style) = old_branch_style else { return };
        if old_branch_style == new_branch_style {
            return;
        }
        do_set_sheet_branch_style(self.document, sheet_id, new_branch_style.clone());
        self.record(Operation::SetSheetBranchStyle {
            sheet_id: sheet_id.to_string(),
            old_branch_style,
            new_branch_style,
        });
    }

    fn insert_sheet(&mut self, index: usize, sheet: SheetSnapshot) {
        let op_sheet = sheet.clone();
        do_insert_sheet(self.document, index, sheet);
        self.record(Operation::InsertSheet { index, sheet: op_sheet });
    }

    fn remove_sheet_by_id(&mut self, sheet_id: &str) -> Option<SheetSnapshot> {
        let index = self
            .document
            .sheets
            .iter()
            .position(|sheet| sheet.id == sheet_id)?;
        let removed = do_remove_sheet(self.document, index)?;
        self.record(Operation::RemoveSheet { index, sheet: removed.clone() });
        Some(removed)
    }

    fn move_sheet(&mut self, from_index: usize, to_index: usize) {
        do_move_sheet(self.document, from_index, to_index);
        self.record(Operation::MoveSheet { from_index, to_index });
    }

    // ---- 高层命令（逻辑移植自 DocumentSnapshot，保持错误信息与返回值一致）----

    pub fn select_sheet(&mut self, sheet_id: &str) -> Result<String, String> {
        let next_sheet = self
            .document
            .find_sheet(sheet_id)
            .ok_or_else(|| "找不到需要切换的画布".to_string())?;
        let root_topic_id = next_sheet.root_topic.id.clone();

        self.set_active_sheet(sheet_id);

        Ok(root_topic_id)
    }

    pub fn create_sheet(&mut self, title: &str) -> Result<String, String> {
        let next_sheet = SheetSnapshot::new(title);
        let next_root_topic_id = next_sheet.root_topic.id.clone();
        let next_sheet_id = next_sheet.id.clone();
        let index = self.document.sheets.len();

        self.insert_sheet(index, next_sheet);
        self.set_active_sheet(&next_sheet_id);

        Ok(next_root_topic_id)
    }

    pub fn rename_sheet(&mut self, sheet_id: &str, title: &str) -> Result<String, String> {
        let active_root_topic_id = self.document.root_topic().id.clone();
        if self.document.find_sheet(sheet_id).is_none() {
            return Err("找不到需要重命名的画布".to_string());
        }

        self.set_sheet_title(sheet_id, title);

        Ok(active_root_topic_id)
    }

    /// 切换画布的图表类型。`chart_type` 为小写字符串（mindmap/logic/tree/org/fishbone/timeline），
    /// 与 serde 序列化形式一致。返回活动主题 id 供会话层保持选中。
    pub fn set_sheet_chart_type(
        &mut self,
        sheet_id: &str,
        chart_type: &str,
    ) -> Result<String, String> {
        let parsed = parse_chart_type(chart_type)?;
        if self.document.find_sheet(sheet_id).is_none() {
            return Err("找不到需要切换图表类型的画布".to_string());
        }

        let active_root_topic_id = self.document.root_topic().id.clone();
        self.set_sheet_chart_type_raw(sheet_id, parsed);

        Ok(active_root_topic_id)
    }

    /// 设置画布的分支样式。`branch_style` 为 None 表示清除覆盖（回退到默认）。
    /// `edge_type` 由 serde 反序列化时校验（仅接受 curve/straight/elbow）。
    /// `thickness` 范围限制 0.1–10.0。
    /// 返回活动主题 id 供会话层保持选中。
    pub fn set_sheet_branch_style(
        &mut self,
        sheet_id: &str,
        branch_style: Option<SheetBranchStyle>,
    ) -> Result<String, String> {
        if let Some(style) = &branch_style {
            // 校验 thickness 范围（0.1–10.0，超出则报错）
            if let Some(thickness) = style.thickness {
                if !(0.1..=10.0).contains(&thickness) {
                    return Err(format!(
                        "连线粗细 {} 超出范围（0.1–10.0）",
                        thickness
                    ));
                }
            }
        }

        if self.document.find_sheet(sheet_id).is_none() {
            return Err("找不到需要设置分支样式的画布".to_string());
        }

        let active_root_topic_id = self.document.root_topic().id.clone();
        self.set_sheet_branch_style_raw(sheet_id, branch_style);

        Ok(active_root_topic_id)
    }

    pub fn delete_sheet(&mut self, sheet_id: &str) -> Result<String, String> {
        if self.document.sheets.len() <= 1 {
            return Err("至少需要保留一个画布".into());
        }

        let deleting_index = self
            .document
            .sheets
            .iter()
            .position(|sheet| sheet.id == sheet_id)
            .ok_or_else(|| "找不到需要删除的画布".to_string())?;

        let deleting_active_sheet = self.document.active_sheet_id == sheet_id;
        let removed = self
            .remove_sheet_by_id(sheet_id)
            .ok_or_else(|| "找不到需要删除的画布".to_string())?;
        let _ = removed;

        if deleting_active_sheet {
            let next_index = deleting_index.saturating_sub(1).min(self.document.sheets.len() - 1);
            let next_active_id = self.document.sheets[next_index].id.clone();
            self.set_active_sheet(&next_active_id);
        }

        Ok(self.document.root_topic().id.clone())
    }

    pub fn move_sheet_direction(&mut self, sheet_id: &str, direction: &str) -> Result<String, String> {
        let current_index = self
            .document
            .sheets
            .iter()
            .position(|sheet| sheet.id == sheet_id)
            .ok_or_else(|| "找不到需要移动的画布".to_string())?;
        let next_index = match direction {
            "up" => current_index.checked_sub(1),
            "down" => {
                if current_index + 1 < self.document.sheets.len() {
                    Some(current_index + 1)
                } else {
                    None
                }
            }
            _ => None,
        }
        .ok_or_else(|| "当前画布不能继续移动".to_string())?;

        let active_root_topic_id = self.document.root_topic().id.clone();
        self.move_sheet(current_index, next_index);

        Ok(active_root_topic_id)
    }

    pub fn create_child_topic(&mut self, parent_id: &str, text: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        let index = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到父主题".to_string())?;
            let parent = find_topic(&sheet.root_topic, parent_id)
                .ok_or_else(|| "找不到父主题".to_string())?;
            parent.children.len()
        };

        let new_topic = TopicSnapshot::new(text);
        let new_topic_id = new_topic.id.clone();

        self.set_topic_collapsed(&sheet_id, parent_id, false);
        self.insert_topic(&sheet_id, parent_id, index, new_topic);

        Ok(new_topic_id)
    }

    /// 创建同级主题。
    ///
    /// `position`：`"after"` 在当前主题之后插入（XMind Enter，默认）；
    /// `"before"` 在当前主题之前插入（XMind Shift+Enter 前插同级）。
    /// 其他值按 `"after"` 处理。
    pub fn create_sibling_topic(
        &mut self,
        topic_id: &str,
        text: &str,
        position: &str,
    ) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        if self.document.root_topic().id == topic_id {
            return Err("根主题不支持创建同级主题".into());
        }

        let (parent_id, topic_index) = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?;
            find_parent_id_and_index(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?
        };

        let insert_index = if position == "before" {
            topic_index
        } else {
            topic_index + 1
        };

        let new_topic = TopicSnapshot::new(text);
        let new_topic_id = new_topic.id.clone();
        self.insert_topic(&sheet_id, &parent_id, insert_index, new_topic);

        Ok(new_topic_id)
    }

    /// 创建父主题：在当前主题的位置插入一个新主题，把当前主题（含整个子树）
    /// 包裹为新主题的第一个子主题。对应 XMind Cmd+Enter「插入父主题」。
    ///
    /// 操作序列（事务化，可撤销）：
    /// 1. 从原父主题取出当前主题（含子树）
    /// 2. 在原位置插入新父主题
    /// 3. 把取出的主题作为新父主题的第 0 个子主题插入
    pub fn create_parent_topic(&mut self, topic_id: &str, text: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        if self.document.root_topic().id == topic_id {
            return Err("根主题不支持创建父主题".into());
        }

        let (grandparent_id, topic_index) = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?;
            find_parent_id_and_index(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?
        };

        let new_topic = TopicSnapshot::new(text);
        let new_topic_id = new_topic.id.clone();

        let removed = self
            .remove_topic_by_id(&sheet_id, topic_id)
            .ok_or_else(|| "找不到需要包裹的主题".to_string())?;
        self.insert_topic(&sheet_id, &grandparent_id, topic_index, new_topic);
        self.insert_topic(&sheet_id, &new_topic_id, 0, removed);

        Ok(new_topic_id)
    }

    /// 创建浮动主题：在活动画布的 floating_topics 列表末尾追加一个独立主题。
    /// 浮动主题不参与树布局，坐标由 layout_hints.offset_x/offset_y 提供（世界坐标）。
    /// 对应 XMind 双击空白创建浮动主题。
    pub fn create_floating_topic(
        &mut self,
        text: &str,
        offset_x: f64,
        offset_y: f64,
    ) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        // 确认活动画布存在
        if self.document.find_sheet(&sheet_id).is_none() {
            return Err("找不到活动画布".to_string());
        }

        let mut topic = TopicSnapshot::new(text);
        topic.layout_hints = Some(TopicLayoutHints {
            direction: None,
            offset_x: Some(offset_x),
            offset_y: Some(offset_y),
        });
        let new_topic_id = topic.id.clone();

        // 直接修改文档（record 仅存操作用于撤销/重做，不自动应用）
        if let Some(sheet) = self.document.find_sheet_mut(&sheet_id) {
            sheet.floating_topics.push(topic.clone());
        }
        self.record(Operation::InsertFloatingTopic {
            sheet_id,
            topic,
        });

        Ok(new_topic_id)
    }

    pub fn rename_topic(&mut self, topic_id: &str, text: &str) -> Result<(), String> {
        let sheet_id = self.active_sheet_id();
        {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到需要重命名的主题".to_string())?;
            // 先查树，再查浮动主题
            let in_tree = find_topic(&sheet.root_topic, topic_id).is_some();
            let in_floating = sheet
                .floating_topics
                .iter()
                .any(|t| t.id == topic_id);
            if !in_tree && !in_floating {
                return Err("找不到需要重命名的主题".to_string());
            }
        }
        self.set_topic_text(&sheet_id, topic_id, text.to_string());
        Ok(())
    }

    pub fn toggle_topic_collapsed(&mut self, topic_id: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        let new_collapsed = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到需要折叠的主题".to_string())?;
            let topic = find_topic(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到需要折叠的主题".to_string())?;
            if topic.children.is_empty() {
                return Err("当前主题没有可折叠的子主题".into());
            }
            !topic.collapsed
        };

        self.set_topic_collapsed(&sheet_id, topic_id, new_collapsed);

        Ok(topic_id.to_string())
    }

    /// 校验主题在活动画布中存在（含浮动主题），返回活动画布 id。供富字段命令复用。
    fn ensure_active_topic_sheet(&self, topic_id: &str, label: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        let sheet = self
            .document
            .find_sheet(&sheet_id)
            .ok_or_else(|| format!("找不到需要{label}的主题"))?;
        let in_tree = find_topic(&sheet.root_topic, topic_id).is_some();
        let in_floating = sheet.floating_topics.iter().any(|t| t.id == topic_id);
        if !in_tree && !in_floating {
            return Err(format!("找不到需要{label}的主题"));
        }
        Ok(sheet_id)
    }

    pub fn set_topic_notes(&mut self, topic_id: &str, notes: Option<String>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑备注的")?;
        self.set_topic_notes_raw(&sheet_id, topic_id, notes);
        Ok(())
    }

    pub fn set_topic_link(&mut self, topic_id: &str, link: Option<TopicLink>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑链接的")?;
        self.set_topic_link_raw(&sheet_id, topic_id, link);
        Ok(())
    }

    pub fn set_topic_markers(&mut self, topic_id: &str, markers: Vec<TopicMarker>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑标记的")?;
        self.set_topic_markers_raw(&sheet_id, topic_id, markers);
        Ok(())
    }

    pub fn set_topic_labels(&mut self, topic_id: &str, labels: Vec<String>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑标签的")?;
        self.set_topic_labels_raw(&sheet_id, topic_id, labels);
        Ok(())
    }

    pub fn set_topic_task(&mut self, topic_id: &str, task: Option<TopicTask>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑任务的")?;
        self.set_topic_task_raw(&sheet_id, topic_id, task);
        Ok(())
    }

    pub fn set_topic_style_ref(&mut self, topic_id: &str, style_ref: Option<String>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑样式的")?;
        self.set_topic_style_ref_raw(&sheet_id, topic_id, style_ref);
        Ok(())
    }

    pub fn set_topic_style_overrides(
        &mut self,
        topic_id: &str,
        style_overrides: Option<TopicStyleOverrides>,
    ) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑样式的")?;
        self.set_topic_style_overrides_raw(&sheet_id, topic_id, style_overrides);
        Ok(())
    }

    /// 设置/移除主题图片。`image` 为 None 时移除（XMind 图片主题的对标行为）。
    pub fn set_topic_image(&mut self, topic_id: &str, image: Option<TopicImage>) -> Result<(), String> {
        let sheet_id = self.ensure_active_topic_sheet(topic_id, "编辑图片")?;
        self.set_topic_image_raw(&sheet_id, topic_id, image);
        Ok(())
    }

    /// 切换文档主题。空字符串或 None 表示清除主题（回退到默认 classic-blue）。
    /// 返回活动主题 id 供会话层保持选中状态。
    pub fn set_document_theme(&mut self, theme_id: Option<&str>) -> Result<String, String> {
        let new_theme = theme_id
            .map(|id| id.trim())
            .filter(|id| !id.is_empty())
            .map(|id| ThemeRef { id: id.to_string() });
        let active_root_topic_id = self.document.root_topic().id.clone();
        self.set_document_theme_raw(new_theme);
        Ok(active_root_topic_id)
    }

    pub fn delete_topic(&mut self, topic_id: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        if self.document.root_topic().id == topic_id {
            return Err("根主题不能删除".into());
        }

        // 先检查是否为浮动主题
        let is_floating = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标主题".to_string())?;
            sheet.floating_topics.iter().any(|t| t.id == topic_id)
        };

        if is_floating {
            // 浮动主题：从 floating_topics 列表移除，撤销标签同删除树主题
            self.remove_floating_topic(&sheet_id, topic_id);
            return Ok(self.document.root_topic().id.clone());
        }

        let parent_id = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?;
            find_parent_id_and_index(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?
                .0
        };

        self.remove_topic_by_id(&sheet_id, topic_id)
            .ok_or_else(|| "找不到目标主题的父主题".to_string())?;

        Ok(parent_id)
    }

    /// 从活动画布的 floating_topics 列表移除指定浮动主题。
    fn remove_floating_topic(&mut self, sheet_id: &str, topic_id: &str) {
        let topic = {
            let Some(sheet) = self.document.find_sheet_mut(sheet_id) else {
                return;
            };
            let Some(pos) = sheet.floating_topics.iter().position(|t| t.id == topic_id) else {
                return;
            };
            sheet.floating_topics.remove(pos)
        };
        self.record(Operation::RemoveFloatingTopic {
            sheet_id: sheet_id.to_string(),
            topic,
        });
    }

    pub fn delete_topics(&mut self, topic_ids: &[String]) -> Result<String, String> {
        if topic_ids.is_empty() {
            return Err("没有可删除的主题".into());
        }

        let sheet_id = self.active_sheet_id();
        let root_topic_id = self.document.root_topic().id.clone();
        let root_topic_clone = self.document.root_topic().clone();

        // 先处理浮动主题：normalize_topic_ids_for_delete 只识别树内主题，
        // 浮动主题需在归一化前单独删除
        let floating_ids: Vec<String> = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到活动画布".to_string())?;
            topic_ids
                .iter()
                .filter(|id| {
                    id != &&root_topic_id && sheet.floating_topics.iter().any(|t| &t.id == *id)
                })
                .cloned()
                .collect()
        };
        for fid in &floating_ids {
            self.remove_floating_topic(&sheet_id, fid);
        }

        // 树内主题走原有归一化逻辑
        let normalized_topic_ids = normalize_topic_ids_for_delete(&root_topic_clone, topic_ids)?;
        let mut next_active_topic_id = root_topic_id;

        for topic_id in normalized_topic_ids {
            if self.remove_topic_by_id(&sheet_id, &topic_id).is_some() {
                next_active_topic_id = self.document.root_topic().id.clone();
            }
        }
        let _ = next_active_topic_id;

        Ok(self.document.root_topic().id.clone())
    }

    pub fn move_topic_to_parent(&mut self, topic_id: &str, target_parent_id: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        if self.document.root_topic().id == topic_id {
            return Err("根主题不能移动".into());
        }
        if topic_id == target_parent_id {
            return Err("主题不能移动到自身下面".into());
        }

        let (from_parent_id, from_index, to_index) = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            let moving_topic = find_topic(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            if contains_topic(moving_topic, target_parent_id) {
                return Err("主题不能移动到自己的子树下面".into());
            }
            let (from_parent_id, from_index) = find_parent_id_and_index(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            let to_index = find_topic(&sheet.root_topic, target_parent_id)
                .ok_or_else(|| "找不到目标父主题".to_string())?
                .children
                .len();
            (from_parent_id, from_index, to_index)
        };

        self.set_topic_collapsed(&sheet_id, target_parent_id, false);
        self.move_within_sheet(&sheet_id, topic_id, &from_parent_id, from_index, target_parent_id, to_index);

        Ok(topic_id.to_string())
    }

    pub fn move_topics_to_parent(&mut self, topic_ids: &[String], target_parent_id: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        let root_topic_clone = self.document.root_topic().clone();
        let normalized_topic_ids = normalize_topic_ids_for_batch(
            &root_topic_clone,
            topic_ids,
            "根主题不能批量移动",
            "没有可移动的主题",
        )?;

        for topic_id in &normalized_topic_ids {
            if topic_id == target_parent_id {
                return Err("主题不能移动到自身下面".into());
            }
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            let moving_topic = find_topic(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            if contains_topic(moving_topic, target_parent_id) {
                return Err("主题不能移动到自己的子树下面".into());
            }
        }

        let mut next_active_topic_id = self.document.root_topic().id.clone();
        let mut moved_count = 0usize;

        for topic_id in normalized_topic_ids {
            let Some((parent_id, _)) = find_parent_id_and_index(self.document.root_topic(), &topic_id) else {
                continue;
            };

            if parent_id == target_parent_id {
                continue;
            }

            next_active_topic_id = self.move_topic_to_parent(&topic_id, target_parent_id)?;
            moved_count += 1;
        }

        if moved_count == 0 {
            return Err("所选主题已经都在这个父主题下面".into());
        }

        Ok(next_active_topic_id)
    }

    pub fn move_topic_in_parent(&mut self, topic_id: &str, direction: &str) -> Result<String, String> {
        let sheet_id = self.active_sheet_id();
        if self.document.root_topic().id == topic_id {
            return Err("根主题不能调整同级顺序".into());
        }

        let (parent_id, topic_index, next_index) = {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?;
            let (parent_id, topic_index) = find_parent_id_and_index(&sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到目标主题的父主题".to_string())?;
            let parent = find_topic(&sheet.root_topic, &parent_id)
                .ok_or_else(|| "找不到父主题".to_string())?;
            let next_index = match direction {
                "up" => topic_index.checked_sub(1),
                "down" => {
                    if topic_index + 1 < parent.children.len() {
                        Some(topic_index + 1)
                    } else {
                        None
                    }
                }
                _ => None,
            }
            .ok_or_else(|| "当前主题不能继续移动".to_string())?;
            (parent_id, topic_index, next_index)
        };

        self.move_within_sheet(&sheet_id, topic_id, &parent_id, topic_index, &parent_id, next_index);

        Ok(topic_id.to_string())
    }

    pub fn move_topic_to_sheet_parent(
        &mut self,
        topic_id: &str,
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
    ) -> Result<String, String> {
        let (source_sheet_id, source_sheet_index, target_sheet_index, from_parent_id, from_index, to_parent_id, to_index) = {
            let source_sheet_index = self
                .document
                .sheets
                .iter()
                .position(|sheet| find_topic(&sheet.root_topic, topic_id).is_some())
                .ok_or_else(|| "找不到需要移动的主题".to_string())?;
            let target_sheet_index = self
                .document
                .sheets
                .iter()
                .position(|sheet| sheet.id == target_sheet_id)
                .ok_or_else(|| "找不到目标画布".to_string())?;

            if self.document.sheets[source_sheet_index].root_topic.id == topic_id {
                return Err("根主题不能移动到其他画布".into());
            }
            if source_sheet_index == target_sheet_index {
                return Err("当前主题已经在目标画布中".into());
            }

            let source_sheet_id = self.document.sheets[source_sheet_index].id.clone();
            let source_root = &self.document.sheets[source_sheet_index].root_topic;
            let (from_parent_id, from_index) = find_parent_id_and_index(source_root, topic_id)
                .ok_or_else(|| "无法从原位置移除主题".to_string())?;
            let target_root = &self.document.sheets[target_sheet_index].root_topic;
            let to_parent_id = match target_parent_id {
                Some(id) => {
                    find_topic(target_root, id).ok_or_else(|| "找不到目标父主题".to_string())?.id.clone()
                }
                None => target_root.id.clone(),
            };
            let to_index = find_topic(target_root, &to_parent_id)
                .ok_or_else(|| "找不到目标父主题".to_string())?
                .children
                .len();
            (
                source_sheet_id,
                source_sheet_index,
                target_sheet_index,
                from_parent_id,
                from_index,
                to_parent_id,
                to_index,
            )
        };

        self.set_topic_collapsed(target_sheet_id, &to_parent_id, false);
        self.move_across_sheets(
            topic_id,
            &source_sheet_id,
            &from_parent_id,
            from_index,
            target_sheet_id,
            &to_parent_id,
            to_index,
        );
        self.set_active_sheet(target_sheet_id);
        let _ = (source_sheet_index, target_sheet_index);

        Ok(topic_id.to_string())
    }

    pub fn move_topics_to_sheet_parent(
        &mut self,
        topic_ids: &[String],
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
    ) -> Result<String, String> {
        let root_topic_clone = self.document.root_topic().clone();
        let normalized_topic_ids = normalize_topic_ids_for_batch(
            &root_topic_clone,
            topic_ids,
            "根主题不能移动到其他画布",
            "没有可移动的主题",
        )?;
        let source_sheet_id = self.active_sheet_id();

        if source_sheet_id == target_sheet_id {
            return Err("所选主题已经都在目标画布中".into());
        }

        let mut next_active_topic_id = self.document.root_topic().id.clone();
        let mut moved_count = 0usize;

        for topic_id in normalized_topic_ids {
            next_active_topic_id =
                self.move_topic_to_sheet_parent(&topic_id, target_sheet_id, target_parent_id)?;
            moved_count += 1;
        }

        if moved_count == 0 {
            return Err("没有可移动的主题".into());
        }

        Ok(next_active_topic_id)
    }

    pub fn copy_topic_to_sheet_parent(
        &mut self,
        topic_id: &str,
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
    ) -> Result<String, String> {
        let (cloned_topic, to_parent_id, to_index) = {
            let source_sheet = self
                .document
                .sheets
                .iter()
                .find(|sheet| find_topic(&sheet.root_topic, topic_id).is_some())
                .ok_or_else(|| "找不到需要复制的主题".to_string())?;
            if source_sheet.root_topic.id == topic_id {
                return Err("根主题不能复制到其他画布".into());
            }
            let source_topic = find_topic(&source_sheet.root_topic, topic_id)
                .ok_or_else(|| "找不到需要复制的主题".to_string())?;
            let cloned_topic = clone_topic_branch(source_topic);

            let target_sheet_index = self
                .document
                .sheets
                .iter()
                .position(|sheet| sheet.id == target_sheet_id)
                .ok_or_else(|| "找不到目标画布".to_string())?;
            let target_root = &self.document.sheets[target_sheet_index].root_topic;
            let to_parent_id = match target_parent_id {
                Some(id) => {
                    find_topic(target_root, id).ok_or_else(|| "找不到目标父主题".to_string())?.id.clone()
                }
                None => target_root.id.clone(),
            };
            let to_index = find_topic(target_root, &to_parent_id)
                .ok_or_else(|| "找不到目标父主题".to_string())?
                .children
                .len();
            (cloned_topic, to_parent_id, to_index)
        };

        let cloned_topic_id = cloned_topic.id.clone();
        self.set_topic_collapsed(target_sheet_id, &to_parent_id, false);
        self.insert_topic(target_sheet_id, &to_parent_id, to_index, cloned_topic);
        self.set_active_sheet(target_sheet_id);

        Ok(cloned_topic_id)
    }

    pub fn copy_topics_to_sheet_parent(
        &mut self,
        topic_ids: &[String],
        target_sheet_id: &str,
        target_parent_id: Option<&str>,
    ) -> Result<String, String> {
        let root_topic_clone = self.document.root_topic().clone();
        let normalized_topic_ids = normalize_topic_ids_for_batch(
            &root_topic_clone,
            topic_ids,
            "根主题不能复制到其他画布",
            "没有可复制的主题",
        )?;
        let mut next_active_topic_id = self.document.root_topic().id.clone();
        let mut copied_count = 0usize;

        for topic_id in normalized_topic_ids {
            next_active_topic_id =
                self.copy_topic_to_sheet_parent(&topic_id, target_sheet_id, target_parent_id)?;
            copied_count += 1;
        }

        if copied_count == 0 {
            return Err("没有可复制的主题".into());
        }

        Ok(next_active_topic_id)
    }

    pub fn paste_topics_as_children(
        &mut self,
        topics: &[TopicSnapshot],
        target_parent_id: &str,
    ) -> Result<String, String> {
        if topics.is_empty() {
            return Err("没有可粘贴的主题".into());
        }

        let sheet_id = self.active_sheet_id();
        {
            let sheet = self
                .document
                .find_sheet(&sheet_id)
                .ok_or_else(|| "找不到目标父主题".to_string())?;
            if find_topic(&sheet.root_topic, target_parent_id).is_none() {
                return Err("找不到目标父主题".to_string());
            }
        }

        self.set_topic_collapsed(&sheet_id, target_parent_id, false);

        let mut next_active_topic_id = None;
        for topic in topics {
            let cloned_topic = clone_topic_branch(topic);
            let index = {
                let sheet = self
                    .document
                    .find_sheet(&sheet_id)
                    .ok_or_else(|| "找不到目标父主题".to_string())?;
                find_topic(&sheet.root_topic, target_parent_id)
                    .ok_or_else(|| "找不到目标父主题".to_string())?
                    .children
                    .len()
            };
            if next_active_topic_id.is_none() {
                next_active_topic_id = Some(cloned_topic.id.clone());
            }
            self.insert_topic(&sheet_id, target_parent_id, index, cloned_topic);
        }

        next_active_topic_id.ok_or_else(|| "没有可粘贴的主题".to_string())
    }

    // ---- 关系线 / 边界 / 概要 ----

    /// 创建关系线：两个主题之间的非父子连接。两端主题必须存在于文档任意画布中。
    pub fn create_relationship(
        &mut self,
        from_topic_id: &str,
        to_topic_id: &str,
        label: Option<String>,
    ) -> Result<String, String> {
        if from_topic_id == to_topic_id {
            return Err("关系线的两端不能是同一个主题".into());
        }
        if !self.document_contains_topic(from_topic_id) {
            return Err("找不到关系线的起始主题".into());
        }
        if !self.document_contains_topic(to_topic_id) {
            return Err("找不到关系线的目标主题".into());
        }

        let relationship = Relationship {
            id: create_id("rel"),
            from_topic_id: from_topic_id.to_string(),
            to_topic_id: to_topic_id.to_string(),
            label,
            style_ref: None,
            control_points: Vec::new(),
        };
        let rel_id = relationship.id.clone();
        let op = Operation::InsertRelationship { relationship };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(rel_id)
    }

    /// 删除关系线。返回活动主题 id 供会话层保持选中。
    pub fn delete_relationship(&mut self, relationship_id: &str) -> Result<String, String> {
        let relationship = self
            .document
            .relationships
            .iter()
            .find(|r| r.id == relationship_id)
            .cloned()
            .ok_or_else(|| "找不到需要删除的关系线".to_string())?;

        let active_topic_id = self.document.root_topic().id.clone();
        let op = Operation::RemoveRelationship { relationship };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(active_topic_id)
    }

    /// 创建边界：框选当前画布中的一组主题做视觉分组。
    pub fn create_boundary(
        &mut self,
        sheet_id: &str,
        topic_ids: Vec<String>,
        label: Option<String>,
    ) -> Result<String, String> {
        let sheet = self
            .document
            .find_sheet(sheet_id)
            .ok_or_else(|| "找不到需要创建边界的画布".to_string())?;

        for topic_id in &topic_ids {
            if find_topic(&sheet.root_topic, topic_id).is_none() {
                return Err("边界包含的主题不存在".into());
            }
        }

        let boundary = Boundary {
            id: create_id("boundary"),
            topic_ids,
            label,
            style_ref: None,
        };
        let boundary_id = boundary.id.clone();
        let op = Operation::InsertBoundary {
            sheet_id: sheet_id.to_string(),
            boundary,
        };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(boundary_id)
    }

    /// 删除边界。
    pub fn delete_boundary(&mut self, sheet_id: &str, boundary_id: &str) -> Result<String, String> {
        let sheet = self
            .document
            .find_sheet(sheet_id)
            .ok_or_else(|| "找不到边界所在的画布".to_string())?;
        let boundary = sheet
            .boundaries
            .iter()
            .find(|b| b.id == boundary_id)
            .cloned()
            .ok_or_else(|| "找不到需要删除的边界".to_string())?;

        let active_topic_id = self.document.root_topic().id.clone();
        let op = Operation::RemoveBoundary {
            sheet_id: sheet_id.to_string(),
            boundary,
        };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(active_topic_id)
    }

    /// 创建概要节点：对一组兄弟主题的归纳。
    pub fn create_summary(
        &mut self,
        sheet_id: &str,
        topic_ids: Vec<String>,
        label: String,
    ) -> Result<String, String> {
        let sheet = self
            .document
            .find_sheet(sheet_id)
            .ok_or_else(|| "找不到需要创建概要的画布".to_string())?;

        for topic_id in &topic_ids {
            if find_topic(&sheet.root_topic, topic_id).is_none() {
                return Err("概要包含的主题不存在".into());
            }
        }

        let summary = SummaryNode {
            id: create_id("summary"),
            topic_ids,
            label,
            style_ref: None,
        };
        let summary_id = summary.id.clone();
        let op = Operation::InsertSummary {
            sheet_id: sheet_id.to_string(),
            summary,
        };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(summary_id)
    }

    /// 删除概要节点。
    pub fn delete_summary(&mut self, sheet_id: &str, summary_id: &str) -> Result<String, String> {
        let sheet = self
            .document
            .find_sheet(sheet_id)
            .ok_or_else(|| "找不到概要所在的画布".to_string())?;
        let summary = sheet
            .summaries
            .iter()
            .find(|s| s.id == summary_id)
            .cloned()
            .ok_or_else(|| "找不到需要删除的概要".to_string())?;

        let active_topic_id = self.document.root_topic().id.clone();
        let op = Operation::RemoveSummary {
            sheet_id: sheet_id.to_string(),
            summary,
        };
        apply_operation(self.document, &op);
        self.record(op);
        Ok(active_topic_id)
    }

    /// 检查文档任意画布中是否存在指定主题。
    fn document_contains_topic(&self, topic_id: &str) -> bool {
        self.document
            .sheets
            .iter()
            .any(|sheet| find_topic(&sheet.root_topic, topic_id).is_some())
    }
}

/// 解析图表类型字符串，与 `ChartType` 的 serde 序列化形式（lowercase）一致。
/// "mindmap" 解析为 `Some(Mindmap)`，其余类型解析为对应 `Some(...)`；
/// 未知字符串返回错误，避免静默回退。
fn parse_chart_type(value: &str) -> Result<Option<ChartType>, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "mindmap" => Ok(Some(ChartType::Mindmap)),
        "logic" => Ok(Some(ChartType::Logic)),
        "tree" => Ok(Some(ChartType::Tree)),
        "org" => Ok(Some(ChartType::Org)),
        "fishbone" => Ok(Some(ChartType::Fishbone)),
        "timeline" => Ok(Some(ChartType::Timeline)),
        other => Err(format!(
            "不支持的图表类型“{}”，支持 mindmap / logic / tree / org / fishbone / timeline",
            other
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_sheet_chart_type_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_sheet_chart_type(&sheet_id, "logic").unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetSheetChartType { new_chart_type, .. } => {
                assert_eq!(*new_chart_type, Some(ChartType::Logic));
            }
            other => panic!("expected SetSheetChartType, got {:?}", other),
        }

        // 正向应用后画布图表类型为 Logic
        assert_eq!(
            document.find_sheet(&sheet_id).unwrap().chart_type,
            Some(ChartType::Logic)
        );

        // 逆序应用逆操作后回到 None（默认 mindmap）
        apply_inverse(&mut document, &ops);
        assert_eq!(document.find_sheet(&sheet_id).unwrap().chart_type, None);
    }

    #[test]
    fn set_sheet_chart_type_rejects_unknown_type() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor.set_sheet_chart_type(&sheet_id, "unknown").is_err());
    }

    #[test]
    fn set_sheet_chart_type_noop_when_same() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        // 先设置为 logic
        document.find_sheet_mut(&sheet_id).unwrap().chart_type = Some(ChartType::Logic);

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_sheet_chart_type(&sheet_id, "logic").unwrap();
        // 相同值不应记录任何操作
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_sheet_branch_style_round_trips_and_inverts() {
        use crate::domain::document::EdgeType;

        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();

        let new_style = Some(SheetBranchStyle {
            edge_type: Some(EdgeType::Straight),
            thickness: Some(1.5),
            color_palette: vec!["#ff0000".into(), "#00ff00".into()],
        });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_sheet_branch_style(&sheet_id, new_style.clone()).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetSheetBranchStyle { new_branch_style, .. } => {
                assert_eq!(*new_branch_style, new_style);
            }
            other => panic!("expected SetSheetBranchStyle, got {:?}", other),
        }

        // 正向应用后画布携带 branch_style
        let sheet = document.find_sheet(&sheet_id).unwrap();
        assert_eq!(sheet.branch_style, new_style);

        // 逆操作回到 None
        apply_inverse(&mut document, &ops);
        let sheet = document.find_sheet(&sheet_id).unwrap();
        assert!(sheet.branch_style.is_none());
    }

    #[test]
    fn set_sheet_branch_style_noop_when_same() {
        use crate::domain::document::EdgeType;

        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        // 先设置一次
        document.find_sheet_mut(&sheet_id).unwrap().branch_style = Some(SheetBranchStyle {
            edge_type: Some(EdgeType::Elbow),
            thickness: Some(2.0),
            color_palette: vec!["#abc".into()],
        });

        let mut editor = DocumentEditor::new(&mut document);
        // 相同值不应记录任何操作
        editor
            .set_sheet_branch_style(
                &sheet_id,
                Some(SheetBranchStyle {
                    edge_type: Some(EdgeType::Elbow),
                    thickness: Some(2.0),
                    color_palette: vec!["#abc".into()],
                }),
            )
            .unwrap();
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_sheet_branch_style_rejects_invalid_thickness() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        let mut editor = DocumentEditor::new(&mut document);

        // thickness 超出上限
        let too_thick = Some(SheetBranchStyle {
            thickness: Some(20.0),
            ..Default::default()
        });
        assert!(editor.set_sheet_branch_style(&sheet_id, too_thick).is_err());

        // thickness 低于下限
        let too_thin = Some(SheetBranchStyle {
            thickness: Some(0.0),
            ..Default::default()
        });
        assert!(editor.set_sheet_branch_style(&sheet_id, too_thin).is_err());

        // 不应有操作被记录
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_sheet_branch_style_clears_with_none() {
        use crate::domain::document::EdgeType;

        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        // 先设置
        document.find_sheet_mut(&sheet_id).unwrap().branch_style = Some(SheetBranchStyle {
            edge_type: Some(EdgeType::Straight),
            ..Default::default()
        });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_sheet_branch_style(&sheet_id, None).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        // 正向应用后 branch_style 被清除
        assert!(document.find_sheet(&sheet_id).unwrap().branch_style.is_none());

        // 逆操作恢复
        apply_inverse(&mut document, &ops);
        assert_eq!(
            document.find_sheet(&sheet_id).unwrap().branch_style,
            Some(SheetBranchStyle {
                edge_type: Some(EdgeType::Straight),
                ..Default::default()
            })
        );
    }

    #[test]
    fn parse_chart_type_covers_all_variants() {
        assert_eq!(parse_chart_type("mindmap").unwrap(), Some(ChartType::Mindmap));
        assert_eq!(parse_chart_type("Logic").unwrap(), Some(ChartType::Logic));
        assert_eq!(parse_chart_type(" TREE ").unwrap(), Some(ChartType::Tree));
        assert_eq!(parse_chart_type("org").unwrap(), Some(ChartType::Org));
        assert_eq!(parse_chart_type("fishbone").unwrap(), Some(ChartType::Fishbone));
        assert_eq!(parse_chart_type("timeline").unwrap(), Some(ChartType::Timeline));
        assert!(parse_chart_type("radial").is_err());
    }

    fn default_sheet_and_two_child_ids(document: &DocumentSnapshot) -> (String, String, String) {
        let sheet_id = document.active_sheet_id.clone();
        let root = document.root_topic();
        let child_a = root.children[0].id.clone();
        let child_b = root.children[1].id.clone();
        (sheet_id, child_a, child_b)
    }

    #[test]
    fn relationship_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        let rel_id = editor
            .create_relationship(&child_a, &child_b, Some("依赖".to_string()))
            .unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::InsertRelationship { relationship } => {
                assert_eq!(relationship.id, rel_id);
                assert_eq!(relationship.from_topic_id, child_a);
                assert_eq!(relationship.to_topic_id, child_b);
                assert_eq!(relationship.label.as_deref(), Some("依赖"));
            }
            other => panic!("expected InsertRelationship, got {:?}", other),
        }

        // 正向应用后文档级 relationships 含一条
        assert_eq!(document.relationships.len(), 1);
        assert_eq!(document.relationships[0].id, rel_id);

        // 逆序应用逆操作后回到空
        apply_inverse(&mut document, &ops);
        assert!(document.relationships.is_empty());
    }

    #[test]
    fn relationship_rejects_invalid_endpoints() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        // 同一主题
        assert!(editor
            .create_relationship(&child_a, &child_a, None)
            .is_err());
        // 起点不存在
        assert!(editor
            .create_relationship("missing-id", &child_b, None)
            .is_err());
        // 终点不存在
        assert!(editor
            .create_relationship(&child_a, "missing-id", None)
            .is_err());
        // 全部失败时不应记录任何操作
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn delete_relationship_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        // 先创建一条关系线（create_* 已直接应用并记录操作）
        {
            let mut editor = DocumentEditor::new(&mut document);
            editor
                .create_relationship(&child_a, &child_b, Some("关联".to_string()))
                .unwrap();
            let _ = editor.into_ops();
        }
        assert_eq!(document.relationships.len(), 1);
        let rel_id = document.relationships[0].id.clone();

        // 删除关系线
        let mut editor = DocumentEditor::new(&mut document);
        editor.delete_relationship(&rel_id).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        assert!(matches!(ops[0], Operation::RemoveRelationship { .. }));
        assert!(document.relationships.is_empty());

        // 逆操作恢复关系线
        apply_inverse(&mut document, &ops);
        assert_eq!(document.relationships.len(), 1);
        assert_eq!(document.relationships[0].id, rel_id);

        // 删除不存在的关系线应报错
        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor.delete_relationship("no-such-rel").is_err());
    }

    #[test]
    fn boundary_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (sheet_id, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        let boundary_id = editor
            .create_boundary(&sheet_id, vec![child_a.clone(), child_b.clone()], Some("核心".to_string()))
            .unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::InsertBoundary { sheet_id: op_sheet, boundary } => {
                assert_eq!(op_sheet, &sheet_id);
                assert_eq!(boundary.id, boundary_id);
                assert_eq!(boundary.topic_ids, vec![child_a, child_b]);
                assert_eq!(boundary.label.as_deref(), Some("核心"));
            }
            other => panic!("expected InsertBoundary, got {:?}", other),
        }

        // 正向应用后画布 boundaries 含一条
        assert_eq!(document.find_sheet(&sheet_id).unwrap().boundaries.len(), 1);

        // 逆序应用逆操作后回到空
        apply_inverse(&mut document, &ops);
        assert!(document
            .find_sheet(&sheet_id)
            .unwrap()
            .boundaries
            .is_empty());
    }

    #[test]
    fn boundary_rejects_missing_sheet_and_topics() {
        let mut document = DocumentSnapshot::new_default();
        let (sheet_id, child_a, _child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        // 画布不存在
        assert!(editor
            .create_boundary("missing-sheet", vec![child_a.clone()], None)
            .is_err());
        // 主题不存在于该画布
        assert!(editor
            .create_boundary(&sheet_id, vec![child_a, "missing-topic".to_string()], None)
            .is_err());
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn summary_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (sheet_id, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        let summary_id = editor
            .create_summary(&sheet_id, vec![child_a.clone(), child_b.clone()], "归纳".to_string())
            .unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::InsertSummary { sheet_id: op_sheet, summary } => {
                assert_eq!(op_sheet, &sheet_id);
                assert_eq!(summary.id, summary_id);
                assert_eq!(summary.label, "归纳");
                assert_eq!(summary.topic_ids, vec![child_a, child_b]);
            }
            other => panic!("expected InsertSummary, got {:?}", other),
        }

        assert_eq!(document.find_sheet(&sheet_id).unwrap().summaries.len(), 1);

        apply_inverse(&mut document, &ops);
        assert!(document
            .find_sheet(&sheet_id)
            .unwrap()
            .summaries
            .is_empty());
    }

    #[test]
    fn summary_rejects_missing_sheet_and_topics() {
        let mut document = DocumentSnapshot::new_default();
        let (sheet_id, child_a, _child_b) = default_sheet_and_two_child_ids(&document);

        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor
            .create_summary("missing-sheet", vec![child_a.clone()], "x".to_string())
            .is_err());
        assert!(editor
            .create_summary(&sheet_id, vec![child_a, "missing-topic".to_string()], "x".to_string())
            .is_err());
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn delete_boundary_and_summary_round_trip_and_invert() {
        let mut document = DocumentSnapshot::new_default();
        let (sheet_id, child_a, child_b) = default_sheet_and_two_child_ids(&document);

        // 先创建边界与概要（create_* 已直接应用并记录操作）
        {
            let mut editor = DocumentEditor::new(&mut document);
            editor
                .create_boundary(&sheet_id, vec![child_a.clone(), child_b.clone()], None)
                .unwrap();
            editor
                .create_summary(&sheet_id, vec![child_a.clone(), child_b.clone()], "归纳".to_string())
                .unwrap();
            let _ = editor.into_ops();
        }
        let boundary_id = document.find_sheet(&sheet_id).unwrap().boundaries[0].id.clone();
        let summary_id = document.find_sheet(&sheet_id).unwrap().summaries[0].id.clone();

        // 删除边界
        let mut editor = DocumentEditor::new(&mut document);
        editor.delete_boundary(&sheet_id, &boundary_id).unwrap();
        let boundary_ops = editor.into_ops();
        assert!(matches!(boundary_ops[0], Operation::RemoveBoundary { .. }));
        assert!(document.find_sheet(&sheet_id).unwrap().boundaries.is_empty());
        apply_inverse(&mut document, &boundary_ops);
        assert_eq!(document.find_sheet(&sheet_id).unwrap().boundaries.len(), 1);

        // 删除概要
        let mut editor = DocumentEditor::new(&mut document);
        editor.delete_summary(&sheet_id, &summary_id).unwrap();
        let summary_ops = editor.into_ops();
        assert!(matches!(summary_ops[0], Operation::RemoveSummary { .. }));
        assert!(document.find_sheet(&sheet_id).unwrap().summaries.is_empty());
        apply_inverse(&mut document, &summary_ops);
        assert_eq!(document.find_sheet(&sheet_id).unwrap().summaries.len(), 1);

        // 删除不存在的边界/概要应报错
        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor.delete_boundary(&sheet_id, "no-such-boundary").is_err());
        assert!(editor.delete_summary(&sheet_id, "no-such-summary").is_err());
    }

    #[test]
    fn set_topic_style_overrides_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        let new_overrides = Some(TopicStyleOverrides {
            fill: Some("#ff8800".into()),
            text_color: Some("#ffffff".into()),
            ..Default::default()
        });

        let mut editor = DocumentEditor::new(&mut document);
        editor
            .set_topic_style_overrides(&child_a, new_overrides.clone())
            .unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetTopicField {
                change: TopicFieldChange::StyleOverrides { old, new },
                ..
            } => {
                assert!(old.is_none());
                assert_eq!(new, &new_overrides);
            }
            other => panic!("expected SetTopicField/StyleOverrides, got {:?}", other),
        }

        // 正向应用后主题携带 overrides
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert_eq!(topic.style_overrides, new_overrides);

        // 逆操作回到 None
        apply_inverse(&mut document, &ops);
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert!(topic.style_overrides.is_none());
    }

    #[test]
    fn set_topic_style_overrides_noop_when_same() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        // 先写入一个 overrides
        let initial = Some(TopicStyleOverrides {
            fill: Some("#abc123".into()),
            ..Default::default()
        });
        {
            let mut editor = DocumentEditor::new(&mut document);
            editor.set_topic_style_overrides(&child_a, initial.clone()).unwrap();
            let _ = editor.into_ops();
        }

        // 再次写入相同值，不应记录任何操作
        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_style_overrides(&child_a, initial).unwrap();
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_topic_style_overrides_rejects_missing_topic() {
        let mut document = DocumentSnapshot::new_default();
        let mut editor = DocumentEditor::new(&mut document);
        let overrides = TopicStyleOverrides {
            fill: Some("#000".into()),
            ..Default::default()
        };
        assert!(editor
            .set_topic_style_overrides("missing-topic", Some(overrides))
            .is_err());
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_topic_image_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        let new_image = Some(TopicImage {
            asset_id: "sha256-abc.png".into(),
            width: None,
            height: None,
        });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_image(&child_a, new_image.clone()).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetTopicField {
                change: TopicFieldChange::Image { old, new },
                ..
            } => {
                assert!(old.is_none());
                assert_eq!(new, &new_image);
            }
            other => panic!("expected SetTopicField/Image, got {:?}", other),
        }

        // 正向应用后主题携带图片引用
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert_eq!(topic.image, new_image);

        // 逆操作回到 None（撤销插入图片）
        apply_inverse(&mut document, &ops);
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert!(topic.image.is_none());
    }

    #[test]
    fn image_field_change_invert_is_an_involution() {
        // invert_operation 是自己的逆：连续两次应用必须回到原值
        let original = Operation::SetTopicField {
            sheet_id: "sheet-1".into(),
            topic_id: "topic-1".into(),
            change: TopicFieldChange::Image {
                old: None,
                new: Some(TopicImage {
                    asset_id: "sha256-abc.png".into(),
                    width: Some(320),
                    height: Some(240),
                }),
            },
        };

        let once = invert_operation(&original);
        let twice = invert_operation(&once);

        assert_ne!(once, original, "一次 invert 必须交换 old/new");
        assert_eq!(twice, original, "两次 invert 必须回到原值");

        // 交换语义：一次 invert 后 old/new 对调
        match &once {
            Operation::SetTopicField {
                sheet_id,
                topic_id,
                change: TopicFieldChange::Image { old, new },
            } => {
                assert_eq!(sheet_id, "sheet-1");
                assert_eq!(topic_id, "topic-1", "invert 不得丢失定位信息");
                assert!(new.is_none());
                assert_eq!(old.as_ref().unwrap().asset_id, "sha256-abc.png");
                assert_eq!((old.as_ref().unwrap().width, old.as_ref().unwrap().height), (Some(320), Some(240)));
            }
            other => panic!("expected SetTopicField/Image, got {:?}", other),
        }
    }

    #[test]
    fn set_topic_image_replaces_existing_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        let first = Some(TopicImage {
            asset_id: "sha256-first.png".into(),
            width: None,
            height: None,
        });
        let second = Some(TopicImage {
            asset_id: "sha256-second.png".into(),
            width: Some(320),
            height: Some(180),
        });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_image(&child_a, first.clone()).unwrap();
        let _ = editor.into_ops();

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_image(&child_a, second.clone()).unwrap();
        let ops = editor.into_ops();

        // 替换图片时旧值必须被捕获，撤销才能回到第一张
        match &ops[0] {
            Operation::SetTopicField {
                change: TopicFieldChange::Image { old, new },
                ..
            } => {
                assert_eq!(old, &first);
                assert_eq!(new, &second);
            }
            other => panic!("expected SetTopicField/Image, got {:?}", other),
        }

        apply_inverse(&mut document, &ops);
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert_eq!(topic.image, first);
    }

    #[test]
    fn set_topic_image_noop_when_same() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        let image = Some(TopicImage {
            asset_id: "sha256-abc.png".into(),
            width: None,
            height: None,
        });

        {
            let mut editor = DocumentEditor::new(&mut document);
            editor.set_topic_image(&child_a, image.clone()).unwrap();
            let _ = editor.into_ops();
        }

        // 再次写入相同值，不应记录任何操作
        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_image(&child_a, image).unwrap();
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_topic_image_none_removes_image() {
        let mut document = DocumentSnapshot::new_default();
        let (_, child_a, _) = default_sheet_and_two_child_ids(&document);

        let image = Some(TopicImage {
            asset_id: "sha256-abc.png".into(),
            width: None,
            height: None,
        });
        {
            let mut editor = DocumentEditor::new(&mut document);
            editor.set_topic_image(&child_a, image).unwrap();
            let _ = editor.into_ops();
        }

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_topic_image(&child_a, None).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert!(topic.image.is_none());

        // 撤销移除 → 图片引用恢复
        apply_inverse(&mut document, &ops);
        let topic = find_topic(document.root_topic(), &child_a).unwrap();
        assert_eq!(topic.image.as_ref().unwrap().asset_id, "sha256-abc.png");
    }

    #[test]
    fn set_topic_image_rejects_missing_topic() {
        let mut document = DocumentSnapshot::new_default();
        let mut editor = DocumentEditor::new(&mut document);
        let image = TopicImage {
            asset_id: "sha256-abc.png".into(),
            width: None,
            height: None,
        };
        assert!(editor
            .set_topic_image("missing-topic", Some(image))
            .is_err());
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_document_theme_round_trips_and_inverts() {
        let mut document = DocumentSnapshot::new_default();
        assert!(document.theme.is_none());

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(Some("dark")).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetDocumentTheme { old_theme, new_theme } => {
                assert!(old_theme.is_none());
                assert_eq!(new_theme.as_ref().unwrap().id, "dark");
            }
            other => panic!("expected SetDocumentTheme, got {:?}", other),
        }

        // 正向应用后文档主题为 dark
        assert_eq!(document.theme.as_ref().unwrap().id, "dark");

        // 逆操作回到 None
        apply_inverse(&mut document, &ops);
        assert!(document.theme.is_none());
    }

    #[test]
    fn set_document_theme_switches_between_themes() {
        let mut document = DocumentSnapshot::new_default();
        // 先设置为 dark
        document.theme = Some(ThemeRef { id: "dark".into() });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(Some("warm")).unwrap();
        let ops = editor.into_ops();

        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetDocumentTheme { old_theme, new_theme } => {
                assert_eq!(old_theme.as_ref().unwrap().id, "dark");
                assert_eq!(new_theme.as_ref().unwrap().id, "warm");
            }
            other => panic!("expected SetDocumentTheme, got {:?}", other),
        }

        assert_eq!(document.theme.as_ref().unwrap().id, "warm");

        // 逆操作回到 dark
        apply_inverse(&mut document, &ops);
        assert_eq!(document.theme.as_ref().unwrap().id, "dark");
    }

    #[test]
    fn set_document_theme_noop_when_same() {
        let mut document = DocumentSnapshot::new_default();
        document.theme = Some(ThemeRef { id: "cool".into() });

        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(Some("cool")).unwrap();
        assert!(editor.into_ops().is_empty());
    }

    #[test]
    fn set_document_theme_clears_when_empty_or_none() {
        let mut document = DocumentSnapshot::new_default();
        document.theme = Some(ThemeRef { id: "dark".into() });

        // None 清除
        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(None).unwrap();
        let ops = editor.into_ops();
        assert_eq!(ops.len(), 1);
        match &ops[0] {
            Operation::SetDocumentTheme { new_theme, .. } => assert!(new_theme.is_none()),
            other => panic!("expected SetDocumentTheme, got {:?}", other),
        }
        assert!(document.theme.is_none());

        // 空字符串也清除
        document.theme = Some(ThemeRef { id: "dark".into() });
        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(Some("")).unwrap();
        let ops = editor.into_ops();
        assert_eq!(ops.len(), 1);
        assert!(document.theme.is_none());

        // 空白字符串也清除
        document.theme = Some(ThemeRef { id: "dark".into() });
        let mut editor = DocumentEditor::new(&mut document);
        editor.set_document_theme(Some("   ")).unwrap();
        let ops = editor.into_ops();
        assert_eq!(ops.len(), 1);
        assert!(document.theme.is_none());
        let _ = ops;
    }

    #[test]
    fn create_sibling_topic_after_inserts_after_current() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        let root_topic = document.find_sheet(&sheet_id).unwrap().root_topic.clone();
        let target_id = root_topic.children[0].id.clone();

        let mut editor = DocumentEditor::new(&mut document);
        let new_id = editor
            .create_sibling_topic(&target_id, "新建同级主题", "after")
            .unwrap();
        let ops = editor.into_ops();

        let root = &document.find_sheet(&sheet_id).unwrap().root_topic;
        assert_eq!(root.children.len(), 4);
        assert_eq!(root.children[0].id, target_id);
        assert_eq!(root.children[1].id, new_id);

        // 撤销后回到原状（3 个子主题）
        apply_inverse(&mut document, &ops);
        assert_eq!(
            document.find_sheet(&sheet_id).unwrap().root_topic.children.len(),
            3
        );
    }

    #[test]
    fn create_sibling_topic_before_inserts_before_current() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();
        let root_topic = document.find_sheet(&sheet_id).unwrap().root_topic.clone();
        let target_id = root_topic.children[1].id.clone();

        let mut editor = DocumentEditor::new(&mut document);
        let new_id = editor
            .create_sibling_topic(&target_id, "前插同级", "before")
            .unwrap();
        let ops = editor.into_ops();

        let root = &document.find_sheet(&sheet_id).unwrap().root_topic;
        assert_eq!(root.children.len(), 4);
        // 前插：新主题占据 target 原位置(1)，target 顺延到 2
        assert_eq!(root.children[1].id, new_id);
        assert_eq!(root.children[2].id, target_id);

        // 撤销后回到原状
        apply_inverse(&mut document, &ops);
        assert_eq!(
            document.find_sheet(&sheet_id).unwrap().root_topic.children.len(),
            3
        );
    }

    #[test]
    fn create_sibling_topic_rejects_root() {
        let mut document = DocumentSnapshot::new_default();
        let root_id = document.root_topic().id.clone();
        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor
            .create_sibling_topic(&root_id, "新建同级主题", "after")
            .is_err());
        assert!(editor
            .create_sibling_topic(&root_id, "前插同级", "before")
            .is_err());
    }

    #[test]
    fn create_parent_topic_wraps_current_and_preserves_subtree() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();

        // 给第一个子主题挂一个孙主题，验证子树整体被包裹
        let target_id = document.find_sheet(&sheet_id).unwrap().root_topic.children[0].id.clone();
        let grandchild_id = {
            let root = &mut document.find_sheet_mut(&sheet_id).unwrap().root_topic;
            let child = &mut root.children[0];
            child.children.push(TopicSnapshot::new("孙主题"));
            child.children[0].id.clone()
        };

        let mut editor = DocumentEditor::new(&mut document);
        let new_parent_id = editor
            .create_parent_topic(&target_id, "新建父主题")
            .unwrap();
        let ops = editor.into_ops();

        let root = &document.find_sheet(&sheet_id).unwrap().root_topic;
        assert_eq!(root.children.len(), 3);
        // 原位置(0)被新父主题占据
        assert_eq!(root.children[0].id, new_parent_id);
        // 新父主题的唯一子主题是原 target
        let new_parent = &root.children[0];
        assert_eq!(new_parent.children.len(), 1);
        assert_eq!(new_parent.children[0].id, target_id);
        // target 的子主题（孙主题）保留
        assert_eq!(new_parent.children[0].children.len(), 1);
        assert_eq!(new_parent.children[0].children[0].id, grandchild_id);

        // 撤销后恢复原结构：root.children[0] == target，且 target 仍带孙主题
        apply_inverse(&mut document, &ops);
        let root = &document.find_sheet(&sheet_id).unwrap().root_topic;
        assert_eq!(root.children.len(), 3);
        assert_eq!(root.children[0].id, target_id);
        assert_eq!(root.children[0].children.len(), 1);
        assert_eq!(root.children[0].children[0].id, grandchild_id);
    }

    #[test]
    fn create_parent_topic_rejects_root() {
        let mut document = DocumentSnapshot::new_default();
        let root_id = document.root_topic().id.clone();
        let mut editor = DocumentEditor::new(&mut document);
        assert!(editor.create_parent_topic(&root_id, "新建父主题").is_err());
    }

    #[test]
    fn floating_topic_create_rename_delete_round_trips() {
        let mut document = DocumentSnapshot::new_default();
        let sheet_id = document.active_sheet_id.clone();

        // 创建浮动主题
        let mut editor = DocumentEditor::new(&mut document);
        let floating_id = editor
            .create_floating_topic("浮动主题", 300.0, -200.0)
            .unwrap();
        let ops = editor.into_ops();
        assert_eq!(ops.len(), 1);
        assert!(matches!(
            &ops[0],
            Operation::InsertFloatingTopic { sheet_id: s, topic }
                if *s == sheet_id && topic.id == floating_id
        ));

        // 正向应用后 floating_topics 有 1 个
        assert_eq!(
            document.find_sheet(&sheet_id).unwrap().floating_topics.len(),
            1
        );
        let floating = &document.find_sheet(&sheet_id).unwrap().floating_topics[0];
        assert_eq!(floating.text, "浮动主题");
        assert_eq!(floating.layout_hints.as_ref().unwrap().offset_x, Some(300.0));
        assert_eq!(floating.layout_hints.as_ref().unwrap().offset_y, Some(-200.0));

        // 重命名浮动主题
        let mut editor = DocumentEditor::new(&mut document);
        editor.rename_topic(&floating_id, "重命名后").unwrap();
        let rename_ops = editor.into_ops();
        assert_eq!(rename_ops.len(), 1);
        assert_eq!(
            document
                .find_sheet(&sheet_id)
                .unwrap()
                .floating_topics[0]
                .text,
            "重命名后"
        );

        // 撤销重命名
        apply_inverse(&mut document, &rename_ops);
        assert_eq!(
            document
                .find_sheet(&sheet_id)
                .unwrap()
                .floating_topics[0]
                .text,
            "浮动主题"
        );

        // 删除浮动主题
        let mut editor = DocumentEditor::new(&mut document);
        let result = editor.delete_topic(&floating_id);
        assert!(result.is_ok());
        let delete_ops = editor.into_ops();
        assert_eq!(delete_ops.len(), 1);
        assert!(matches!(
            &delete_ops[0],
            Operation::RemoveFloatingTopic { topic, .. } if topic.id == floating_id
        ));
        assert_eq!(
            document
                .find_sheet(&sheet_id)
                .unwrap()
                .floating_topics
                .len(),
            0
        );

        // 撤销删除 → 浮动主题恢复
        apply_inverse(&mut document, &delete_ops);
        assert_eq!(
            document
                .find_sheet(&sheet_id)
                .unwrap()
                .floating_topics
                .len(),
            1
        );

        // 撤销创建 → 浮动主题消失
        apply_inverse(&mut document, &ops);
        assert_eq!(
            document
                .find_sheet(&sheet_id)
                .unwrap()
                .floating_topics
                .len(),
            0
        );
    }
}
