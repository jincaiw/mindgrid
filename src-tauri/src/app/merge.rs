//! 合并另一个 MindGrid 文件的内容。
//!
//! **为什么拆成"纯数据准备 + 资源导入"两步函数**：合并的难点全在
//! "ID 会不会撞车""资源会不会丢"，这两件事都可以在内存里用单测钉死。
//! 命令层于是只剩"读文件 → 拿两把锁 → 记一条撤销"，没有可走偏的逻辑。
//!
//! 语义（与 XMind 的「合并文件」对齐，但**并的是画布**）：把源文件的每张画布
//! 原样追加到当前文档末尾，连它文档级的关系线一起带过来。不合并对方的主题/设置，
//! 也不改当前文档的结构——这样合并是"可撤销的、不会破坏现有内容"的操作。

use std::collections::{HashMap, HashSet};

use crate::app::assets::AssetStore;
use crate::domain::document::{
    DocumentSessionSnapshot, DocumentSnapshot, Relationship, SheetSnapshot, TopicSnapshot,
};

/// 一次合并的可展示摘要。
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeSummary {
    /// 追加进来的画布数。
    pub sheets: usize,
    /// 追加进来的主题数（含浮动主题）。
    pub topics: usize,
    /// 带过来的关系线数。
    pub relationships: usize,
    /// 真正写进资源库的新资源数（内容重复、去重命中的不计）。
    pub assets: usize,
    /// 源文件里"被引用但实际不存在"的资源数（源文件已损坏时才会 > 0）。
    pub missing_assets: usize,
}

/// 命令返回值：既要有新快照，也要有"合并了什么"的摘要。
///
/// 不复用 `DocumentSessionSnapshot` 的返回形状：前端要拿摘要给用户一句
/// "已合并 2 张画布 / 37 个主题"，而不是只看到界面变了却不知道发生了什么。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub summary: MergeSummary,
    pub snapshot: DocumentSessionSnapshot,
}

/// 准备要追加的内容：重映射 ID（避免与目标文档撞车）、导入资源、改写资源引用。
pub fn prepare_merge(
    incoming: DocumentSnapshot,
    target_assets: &mut AssetStore,
    incoming_assets: &AssetStore,
) -> MergedContent {
    // 资源引用要先扫**源文档**：`regenerate_ids` 不动资源 ID（它们由内容摘要派生），
    // 所以扫描时机不影响正确性，但先扫更清楚——"源文件引用了哪些资源"。
    let referenced = crate::app::assets::AssetIndex::collect_referenced_asset_ids(&incoming);
    let (asset_id_map, assets, missing_assets) =
        import_assets(target_assets, incoming_assets, &referenced);

    let remapped = incoming.regenerate_ids();
    let mut sheets = remapped.sheets;
    for sheet in &mut sheets {
        remap_sheet_asset_ids(sheet, &asset_id_map);
    }

    let topics = sheets.iter().map(count_sheet_topics).sum();
    let relationships = remapped.relationships;

    MergedContent {
        summary: MergeSummary {
            sheets: sheets.len(),
            topics,
            relationships: relationships.len(),
            assets,
            missing_assets,
        },
        sheets,
        relationships,
    }
}

/// 合并的产物：可直接交给会话层追加的内容 + 摘要。
#[derive(Debug, Clone)]
pub struct MergedContent {
    pub sheets: Vec<SheetSnapshot>,
    pub relationships: Vec<Relationship>,
    pub summary: MergeSummary,
}

/// 把源文件里被引用的资源复制进目标资源库。返回（引用改写表，新增数，缺失数）。
///
/// - **按内容去重**：`AssetStore::register` 用 SHA-256 去重，同一张图重复合并
///   不会写第二份字节。
/// - **引用改写表**：资源 ID 由"内容摘要 + 扩展名"派生。正常情况下源 ID 与目标 ID
///   相同，无需改写；但若目标库里已有**同内容不同 MIME** 的条目，
///   `register` 会复用那条（ID 不同）——此时不改写的话，合并进来的主题会指向一个
///   不存在的资源（表现是"图没了"，而且下次保存会被 GC 再确认一遍）。
fn import_assets(
    target: &mut AssetStore,
    incoming: &AssetStore,
    referenced: &HashSet<String>,
) -> (HashMap<String, String>, usize, usize) {
    let mut id_map: HashMap<String, String> = HashMap::new();
    let mut imported = 0usize;
    let mut missing = 0usize;

    // 排序：HashSet 的迭代顺序不稳定，不排的话"同一份输入产出同一份结果"就不成立，
    // 索引里资源的排列顺序会随机变化（写盘 diff 噪声，也不好断言）。
    let mut ids: Vec<&String> = referenced.iter().collect();
    ids.sort();

    for asset_id in ids {
        let Some(entry) = incoming.index.find(asset_id).cloned() else {
            missing += 1;
            continue;
        };
        let Some(bytes) = incoming.get_bytes(asset_id) else {
            missing += 1;
            continue;
        };

        let before = target.index.assets.len();
        let new_id = target.register(bytes.to_vec(), &entry.mime_type, entry.width, entry.height);
        if target.index.assets.len() > before {
            imported += 1;
        }
        if new_id != *asset_id {
            id_map.insert(asset_id.clone(), new_id);
        }
    }

    (id_map, imported, missing)
}

fn remap_sheet_asset_ids(sheet: &mut SheetSnapshot, map: &HashMap<String, String>) {
    if map.is_empty() {
        return;
    }
    remap_topic_asset_ids(&mut sheet.root_topic, map);
    for topic in &mut sheet.floating_topics {
        remap_topic_asset_ids(topic, map);
    }
}

fn remap_topic_asset_ids(topic: &mut TopicSnapshot, map: &HashMap<String, String>) {
    if let Some(image) = &mut topic.image {
        if let Some(next) = map.get(&image.asset_id) {
            image.asset_id = next.clone();
        }
    }
    if let Some(attachment) = &mut topic.attachment {
        if let Some(next) = map.get(&attachment.asset_id) {
            attachment.asset_id = next.clone();
        }
    }
    for child in &mut topic.children {
        remap_topic_asset_ids(child, map);
    }
}

fn count_sheet_topics(sheet: &SheetSnapshot) -> usize {
    count_topics(&sheet.root_topic) + sheet.floating_topics.iter().map(count_topics).sum::<usize>()
}

fn count_topics(topic: &TopicSnapshot) -> usize {
    1 + topic.children.iter().map(count_topics).sum::<usize>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::assets::AssetStore;
    use crate::domain::document::{
        CanvasIllustration, TopicAttachment, TopicImage, TopicSnapshot,
    };

    fn topic(id: &str, text: &str, children: Vec<TopicSnapshot>) -> TopicSnapshot {
        let mut value = TopicSnapshot::new(text);
        value.id = id.to_string();
        value.children = children;
        value
    }

    fn sheet_with_root(id: &str, title: &str, root: TopicSnapshot) -> SheetSnapshot {
        let mut template = DocumentSnapshot::new_default();
        let mut sheet = template.sheets.remove(0);
        sheet.id = id.to_string();
        sheet.title = title.to_string();
        sheet.root_topic = root;
        sheet
    }

    /// 造一个"带图与附件"的源文档。
    fn incoming_with_assets() -> (DocumentSnapshot, AssetStore) {
        let mut store = AssetStore::default();
        let image_id = store.register(vec![1, 2, 3, 4], "image/png", Some(10), Some(20));
        let file_id = store.register(vec![9, 9, 9], "application/pdf", None, None);

        let mut child = topic("t_img", "带图", vec![]);
        child.image = Some(TopicImage {
            asset_id: image_id.clone(),
            width: Some(10),
            height: Some(20),
        });
        let mut attachment_topic = topic("t_file", "带附件", vec![]);
        attachment_topic.attachment = Some(TopicAttachment {
            asset_id: file_id.clone(),
            name: "方案.pdf".into(),
            mime_type: Some("application/pdf".into()),
            byte_size: Some(3),
        });
        let mut floating = topic("t_float", "浮动", vec![]);
        floating.image = Some(TopicImage {
            asset_id: image_id.clone(),
            width: Some(10),
            height: Some(20),
        });

        let mut document = DocumentSnapshot::new_default();
        document.sheets = vec![SheetSnapshot {
            floating_topics: vec![floating],
            ..sheet_with_root("sheet_src", "源画布", topic("root_src", "源中心", vec![child, attachment_topic]))
        }];
        document.active_sheet_id = "sheet_src".into();
        document.relationships = vec![Relationship {
            id: "rel_src".into(),
            from_topic_id: "t_img".into(),
            // 关系线**指向浮动主题**：这条正是"漏重映射"会静默丢掉的形态
            to_topic_id: "t_float".into(),
            label: Some("依赖".into()),
            style_ref: None,
            control_points: Vec::new(),
        }];

        (document, store)
    }

    #[test]
    fn prepare_merge_remaps_ids_and_imports_assets() {
        let (incoming, incoming_assets) = incoming_with_assets();
        let mut target_assets = AssetStore::default();

        let merged = prepare_merge(incoming, &mut target_assets, &incoming_assets);

        assert_eq!(merged.summary.sheets, 1);
        // 源中心 + 带图 + 带附件 + 浮动 = 4
        assert_eq!(merged.summary.topics, 4);
        assert_eq!(merged.summary.relationships, 1);
        // 图片（被引用）与 PDF（被引用）= 2 个新资源
        assert_eq!(merged.summary.assets, 2);
        assert_eq!(merged.summary.missing_assets, 0);

        // 资源真的进了目标库，且主题引用指向它
        let merged_image_id = merged.sheets[0].root_topic.children[0]
            .image
            .as_ref()
            .unwrap()
            .asset_id
            .clone();
        assert!(target_assets.get_bytes(&merged_image_id).is_some());
        assert!(merged.sheets[0].root_topic.children[1]
            .attachment
            .as_ref()
            .is_some());
        assert!(merged.sheets[0].floating_topics[0].image.is_some());
    }

    #[test]
    fn prepare_merge_keeps_relationship_pointing_at_floating_topic() {
        let (incoming, incoming_assets) = incoming_with_assets();
        let mut target_assets = AssetStore::default();

        let merged = prepare_merge(incoming, &mut target_assets, &incoming_assets);

        // 关系线两端都必须落在**重映射后**的真实主题上：
        // 浮动主题不进 topic_id_map 的话，这条会指向源文档里的旧 ID（合并后是悬空的）
        let rel = &merged.relationships[0];
        let all_topic_ids: Vec<String> = {
            let mut ids = Vec::new();
            fn walk(t: &TopicSnapshot, ids: &mut Vec<String>) {
                ids.push(t.id.clone());
                for child in &t.children {
                    walk(child, ids);
                }
            }
            walk(&merged.sheets[0].root_topic, &mut ids);
            for topic in &merged.sheets[0].floating_topics {
                walk(topic, &mut ids);
            }
            ids
        };
        assert!(all_topic_ids.contains(&rel.from_topic_id), "起始主题悬空");
        assert!(
            all_topic_ids.contains(&rel.to_topic_id),
            "目标主题悬空（浮动主题的 id 没重映射）"
        );
        assert_ne!(rel.to_topic_id, "t_float", "浮动主题 id 没有被重映射");
    }

    #[test]
    fn prepare_merge_dedupes_identical_assets_across_files() {
        // 两个文件里有同一张图：只应写一份字节，第二次的 assets 计数为 0
        let (first, first_assets) = incoming_with_assets();
        let mut target_assets = AssetStore::default();
        let first_merged = prepare_merge(first, &mut target_assets, &first_assets);
        assert_eq!(first_merged.summary.assets, 2);

        let (second, second_assets) = incoming_with_assets();
        let second_merged = prepare_merge(second, &mut target_assets, &second_assets);
        assert_eq!(second_merged.summary.assets, 0, "同内容资源应被去重");
        assert_eq!(target_assets.index.assets.len(), 2);
    }

    #[test]
    fn prepare_merge_reports_missing_assets_without_failing() {
        // 源文件索引里有条目、字节却缺失（已被损坏）：合并不该整体失败，
        // 但必须把"少了几个资源"报出来，否则用户只会看到某张图没了
        let (incoming, mut incoming_assets) = incoming_with_assets();
        incoming_assets.blobs.clear();

        let mut target_assets = AssetStore::default();
        let merged = prepare_merge(incoming, &mut target_assets, &incoming_assets);

        assert_eq!(merged.summary.assets, 0);
        assert_eq!(merged.summary.missing_assets, 2);
        assert_eq!(merged.summary.sheets, 1, "资源缺失不该影响内容合并");
    }

    #[test]
    fn prepare_merge_rewrites_reference_when_target_has_same_bytes_other_mime() {
        // 目标库里已有**同内容不同 MIME** 的条目：register 会复用那条（ID 不同），
        // 此时必须把合并进来的引用改写过去，否则指向一个不存在的资源
        let (incoming, incoming_assets) = incoming_with_assets();
        let mut target_assets = AssetStore::default();
        // 同样的 4 个字节，但按 jpeg 注册 → 扩展名不同 → ID 不同
        let existing_id = target_assets.register(vec![1, 2, 3, 4], "image/jpeg", None, None);

        let merged = prepare_merge(incoming, &mut target_assets, &incoming_assets);

        let merged_image_id = merged.sheets[0].root_topic.children[0]
            .image
            .as_ref()
            .unwrap()
            .asset_id
            .clone();
        assert_eq!(merged_image_id, existing_id, "同内容不同 MIME 时应改写引用");
        assert!(target_assets.get_bytes(&merged_image_id).is_some());
    }

    #[test]
    fn prepare_merge_does_not_touch_illustration_positions() {
        // 插画只有 id 需要重生成，坐标/尺寸是用户摆好的，必须原样保留
        let (mut incoming, incoming_assets) = incoming_with_assets();
        incoming.sheets[0].illustrations = vec![CanvasIllustration {
            id: "ill_src".into(),
            illustration_id: "rocket".into(),
            x: 120.0,
            y: -80.0,
            size: 192.0,
        }];

        let mut target_assets = AssetStore::default();
        let merged = prepare_merge(incoming, &mut target_assets, &incoming_assets);

        let illustration = &merged.sheets[0].illustrations[0];
        assert_ne!(illustration.id, "ill_src", "插画 id 必须重生成");
        assert_eq!(illustration.illustration_id, "rocket");
        assert_eq!(illustration.x, 120.0);
        assert_eq!(illustration.y, -80.0);
        assert_eq!(illustration.size, 192.0);
    }
}


#[cfg(test)]
mod end_to_end_tests {
    use super::*;
    use crate::app::assets::AssetStore;
    use crate::app::persistence::{open_document_file_with_assets, save_document_file};
    use crate::domain::document::{DocumentSession, DocumentSnapshot, TopicImage, TopicSnapshot};

    /// 造一个"含图片"的源文档与它的资源库。
    fn source_document_with_image() -> (DocumentSnapshot, AssetStore, String) {
        let mut store = AssetStore::default();
        let image_id = store.register(vec![7, 7, 7, 7, 7], "image/png", Some(4), Some(4));

        let mut child = TopicSnapshot::new("带图的主题");
        child.image = Some(TopicImage {
            asset_id: image_id.clone(),
            width: Some(4),
            height: Some(4),
        });
        let mut root = TopicSnapshot::new("源中心");
        root.children = vec![child];

        let mut document = DocumentSnapshot::new_default();
        document.sheets = vec![crate::domain::document::SheetSnapshot {
            id: "sheet_source".into(),
            title: "源画布".into(),
            root_topic: root,
            ..document.sheets.remove(0)
        }];
        document.active_sheet_id = "sheet_source".into();

        (document, store, image_id)
    }

    /// 真正走一遍文件系统：写两个 .mgd → 读源文件 → 合并 → 保存 → 重新打开。
    ///
    /// 为什么非要落盘：合并最容易出的两类问题（**资源没被带过去**、
    /// **保存时被 GC 当垃圾删掉**）都只在"写出来再读回去"时才暴露——
    /// 内存里的断言看不到 zip 里到底有什么。
    #[test]
    fn merge_round_trips_through_real_files_and_keeps_assets() {
        let dir = std::env::temp_dir().join(format!("mindgrid-merge-e2e-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("应能建临时目录");
        let source_path = dir.join("source.mgd");
        let merged_path = dir.join("merged.mgd");

        // —— 写出源文件 ——
        let (source_document, source_assets, source_image_id) = source_document_with_image();
        let mut source_session = DocumentSession::create_default();
        source_session.document = Some(source_document.clone());
        save_document_file(&mut source_session, &source_assets, &source_path)
            .expect("源文件应能保存");

        // —— 合并：读源文件 → 追加到目标文档 ——
        let (read_source, read_source_assets) =
            open_document_file_with_assets(&source_path).expect("源文件应能读回");
        let mut target_assets = AssetStore::default();
        let merged = prepare_merge(read_source, &mut target_assets, &read_source_assets);

        assert_eq!(merged.summary.sheets, 1);
        assert_eq!(merged.summary.topics, 2);
        assert_eq!(merged.summary.assets, 1, "图片资源必须被带过来");
        assert_eq!(merged.summary.missing_assets, 0);

        let mut target_session = DocumentSession::create_default();
        let original_sheet_count = target_session.document.as_ref().unwrap().sheets.len();
        target_session
            .append_merged_content(merged.sheets, merged.relationships)
            .expect("追加应成功");
        assert_eq!(
            target_session.document.as_ref().unwrap().sheets.len(),
            original_sheet_count + 1
        );

        // —— 保存合并结果再重新打开：图片仍在（GC 不会把它当垃圾）——
        save_document_file(&mut target_session, &target_assets, &merged_path)
            .expect("合并结果应能保存");
        let (reopened, reopened_assets) =
            open_document_file_with_assets(&merged_path).expect("合并结果应能读回");

        let reopened_ids = crate::app::assets::AssetIndex::collect_referenced_asset_ids(&reopened);
        assert!(
            reopened_ids.contains(&source_image_id),
            "合并后的文档里应当引用着源文件的图片资源"
        );
        assert_eq!(
            reopened_assets.get_bytes(&source_image_id),
            Some(&vec![7u8, 7, 7, 7, 7][..]),
            "图片字节必须原样写进了新文件（否则只是引用还在、内容丢了）"
        );

        // —— 撤销整次合并：画布数回到合并前 ——
        let ops = target_session.history.last().expect("应有撤销记录").ops.clone();
        let mut rolled_back = target_session.document.clone().unwrap();
        crate::domain::editor::apply_inverse(&mut rolled_back, &ops);
        assert_eq!(rolled_back.sheets.len(), original_sheet_count);

        std::fs::remove_dir_all(&dir).ok();
    }
}
