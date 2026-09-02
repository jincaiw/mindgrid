//! 文本格式的导入导出：Markdown 大纲与 OPML 2.0。
//!
//! - Markdown：多画布友好，`# 标题` 起一个画布，`- 项目` 按缩进表达主题树。
//! - OPML：单文件多画布，每个画布以 `<outline mgd_role="sheet">` 包裹，
//!   兼容第三方 OPML（无标记时把顶层 outline 当作根主题）。

use crate::domain::document::{
    create_id, DocumentSnapshot, SheetSnapshot, TopicSnapshot, CURRENT_SCHEMA_VERSION,
};
use quick_xml::escape::unescape as unescape_xml;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;

const OPML_SHEET_ROLE: &str = "mgd_role";
const OPML_SHEET_ROLE_VALUE: &str = "sheet";
const OPML_VERSION: &str = "2.0";
const DEFAULT_SHEET_TITLE: &str = "导入画布";
const DEFAULT_ROOT_TEXT: &str = "中心主题";

// ============================================================================
// Markdown 导出
// ============================================================================

pub fn export_markdown_file(
    session: &crate::domain::document::DocumentSession,
    path: &Path,
) -> Result<(), String> {
    let document = session
        .document
        .as_ref()
        .ok_or_else(|| "当前没有可导出的文档".to_string())?;
    let markdown = render_document_markdown(document);

    write_text_export(path, &markdown)
}

fn render_document_markdown(document: &DocumentSnapshot) -> String {
    let mut lines = Vec::new();

    for (index, sheet) in document.sheets.iter().enumerate() {
        if index > 0 {
            lines.push(String::new());
        }

        lines.push(format!("# {}", normalize_markdown_text(&sheet.title)));
        render_topic_markdown(&sheet.root_topic, 0, &mut lines);
    }

    lines.join("\n")
}

fn render_topic_markdown(topic: &TopicSnapshot, depth: usize, lines: &mut Vec<String>) {
    let indent = "  ".repeat(depth);
    lines.push(format!(
        "{}- {}",
        indent,
        normalize_markdown_text(&topic.text)
    ));

    for child in &topic.children {
        render_topic_markdown(child, depth + 1, lines);
    }
}

fn normalize_markdown_text(text: &str) -> String {
    let normalized = text
        .split('\n')
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" / ");

    if normalized.is_empty() {
        "未命名主题".to_string()
    } else {
        normalized
    }
}

// ============================================================================
// Markdown 导入
// ============================================================================

pub fn import_markdown_file(path: &Path) -> Result<DocumentSnapshot, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("无法读取 Markdown 文件: {error}"))?;

    parse_markdown_to_document(&content)
}

fn parse_markdown_to_document(content: &str) -> Result<DocumentSnapshot, String> {
    let mut sheets: Vec<(String, Vec<(usize, String)>)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_topics: Vec<(usize, String)> = Vec::new();
    let mut implicit_sheet_index = 0usize;

    for raw_line in content.lines() {
        let line = raw_line.trim_end();

        if line.is_empty() {
            // 空行仅在已经存在 # 标题时终结当前画布；
            // 否则保留累积的主题（兼容无空行分隔的紧凑输入）。
            if current_title.is_some() && !current_topics.is_empty() {
                sheets.push((
                    current_title.take().unwrap(),
                    std::mem::take(&mut current_topics),
                ));
            }
            continue;
        }

        if let Some(rest) = line.strip_prefix("# ") {
            // 新画布标题：先终结上一段。
            if let Some(title) = current_title.take() {
                sheets.push((title, std::mem::take(&mut current_topics)));
            }
            current_title = Some(rest.trim().to_string());
            continue;
        }

        // 兼容无 # 标题的开头：遇到首条 bullet 时隐式创建画布。
        if let Some(text) = parse_markdown_bullet(line) {
            if current_title.is_none() {
                implicit_sheet_index += 1;
                current_title = Some(format!("{DEFAULT_SHEET_TITLE} {implicit_sheet_index}"));
            }
            let depth = count_leading_spaces(line) / 2;
            current_topics.push((depth, text));
        }
        // 非 bullet、非标题的行忽略，避免污染主题树。
    }

    if let Some(title) = current_title.take() {
        if !current_topics.is_empty() {
            sheets.push((title, current_topics));
        }
    }

    if sheets.is_empty() {
        return Err("Markdown 没有可导入的主题（缺少 # 标题或 - 列表项）".into());
    }

    let sheets: Vec<SheetSnapshot> = sheets
        .into_iter()
        .map(|(title, topics)| build_sheet_from_markdown(title, &topics))
        .collect();

    let active_sheet_id = sheets
        .first()
        .map(|sheet| sheet.id.clone())
        .ok_or_else(|| "Markdown 解析后没有任何画布".to_string())?;

    Ok(DocumentSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION.into(),
        document_id: create_id("doc"),
        revision: 1,
        active_sheet_id,
        sheets,
        relationships: Vec::new(),
        settings: None,
        theme: None,
        extensions: None,
        extra: serde_json::Map::new(),
    })
}

fn parse_markdown_bullet(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let after = trimmed.strip_prefix("- ")?;
    let text = after.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn count_leading_spaces(line: &str) -> usize {
    line.chars().take_while(|c| *c == ' ').count()
}

fn build_sheet_from_markdown(title: String, topics: &[(usize, String)]) -> SheetSnapshot {
    let sheet_id = create_id("sheet");

    if topics.is_empty() {
        return SheetSnapshot {
            id: sheet_id,
            title,
            root_topic: TopicSnapshot::new(DEFAULT_ROOT_TEXT),
            chart_type: None,
            layout_config: None,
            branch_style: None,
            floating_topics: Vec::new(),
            boundaries: Vec::new(),
            summaries: Vec::new(),
            extensions: None,
            extra: serde_json::Map::new(),
        };
    }

    let root_depth = topics[0].0;
    let root = TopicSnapshot::new(&topics[0].1);
    let mut stack: Vec<(usize, TopicSnapshot)> = vec![(root_depth, root)];

    for &(depth, ref text) in topics.iter().skip(1) {
        // 多个根级 bullet（与首条同深度或更浅）视为根的子节点，
        // 避免破坏"每画布单根"的不变量。
        let effective_depth = if depth <= root_depth {
            root_depth + 1
        } else {
            depth
        };

        let topic = TopicSnapshot::new(text);

        while stack.len() > 1 && stack.last().map(|(d, _)| *d >= effective_depth).unwrap_or(false) {
            let (_, popped) = stack.pop().expect("stack should have at least two entries");
            stack
                .last_mut()
                .expect("stack should retain a parent")
                .1
                .children
                .push(popped);
        }

        stack.push((effective_depth, topic));
    }

    while stack.len() > 1 {
        let (_, popped) = stack.pop().expect("stack should have at least two entries");
        stack
            .last_mut()
            .expect("stack should retain a parent")
            .1
            .children
            .push(popped);
    }

    let root_topic = stack
        .pop()
        .map(|(_, topic)| topic)
        .unwrap_or_else(|| TopicSnapshot::new(DEFAULT_ROOT_TEXT));

    SheetSnapshot {
        id: sheet_id,
        title,
        root_topic,
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

// ============================================================================
// Word (.docx) 导入
// ============================================================================

const DOCX_DOCUMENT_ENTRY: &str = "word/document.xml";
const DOCX_MAX_HEADING_DEPTH: usize = 6;
const DOCX_MAX_TOPIC_DEPTH: usize = 8;

/// 导入 Word (.docx) 文件：解压后解析 `word/document.xml` 的段落大纲。
///
/// 映射规则：
/// - `Heading1` 段落 → 画布标题（开启新画布）；
/// - `Heading2`~`Heading6` → 主题，深度 = 标题级别 - 1；
/// - 正文段落 → 挂在上一个标题主题之下（同标题下的多个正文段落互为兄弟）；
/// - 整个文档没有 `Heading1` 时，全部内容落入以文件名命名的单个画布。
pub fn import_docx_file(path: &Path) -> Result<DocumentSnapshot, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("无法读取 Word 文件: {error}"))?;
    let fallback_title = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|stem| !stem.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SHEET_TITLE.to_string());

    parse_docx_to_document(&bytes, &fallback_title)
}

fn parse_docx_to_document(bytes: &[u8], fallback_title: &str) -> Result<DocumentSnapshot, String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|error| format!("无法打开 Word 文件（ZIP 解析失败）: {error}"))?;

    let mut document_xml = String::new();
    {
        let mut entry = archive
            .by_name(DOCX_DOCUMENT_ENTRY)
            .map_err(|_| "Word 文件缺少 word/document.xml，可能不是有效的 .docx 文档".to_string())?;
        entry
            .read_to_string(&mut document_xml)
            .map_err(|error| format!("无法读取 word/document.xml: {error}"))?;
    }

    parse_docx_xml_to_document(&document_xml, fallback_title)
}

fn parse_docx_xml_to_document(xml: &str, fallback_title: &str) -> Result<DocumentSnapshot, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut sheets: Vec<(String, Vec<(usize, String)>)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_topics: Vec<(usize, String)> = Vec::new();

    // 段落级解析状态
    let mut in_paragraph = false;
    let mut in_text_run = false;
    let mut heading_level: Option<usize> = None;
    let mut paragraph_text = String::new();
    // 最近一个标题主题的深度（正文段落挂在它下面）；0 表示该画布还没有标题主题。
    let mut last_heading_depth = 0usize;
    let mut buf = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|error| format!("Word 文档解析失败: {error}"))?;

        match event {
            Event::Eof => break,
            Event::Start(ref start) => match start.name().as_ref() {
                b"w:p" => {
                    in_paragraph = true;
                    in_text_run = false;
                    heading_level = None;
                    paragraph_text.clear();
                }
                b"w:t" => in_text_run = true,
                b"w:tab" | b"w:br" if in_paragraph => paragraph_text.push(' '),
                _ => {}
            },
            Event::Empty(ref start) => match start.name().as_ref() {
                b"w:pStyle" => {
                    if let Some(value) = read_xml_attribute(start, b"w:val") {
                        heading_level = heading_level_from_style(&value);
                    }
                }
                b"w:tab" | b"w:br" if in_paragraph => paragraph_text.push(' '),
                _ => {}
            },
            Event::Text(ref text) if in_text_run => {
                let decoded = text
                    .decode()
                    .map_err(|error| format!("Word 文本解码失败: {error}"))?;
                if let Ok(unescaped) = unescape_xml(&decoded) {
                    paragraph_text.push_str(unescaped.as_ref());
                }
            }
            Event::End(ref end) => match end.name().as_ref() {
                b"w:t" => in_text_run = false,
                b"w:p" => {
                    in_paragraph = false;
                    in_text_run = false;
                    let text = paragraph_text.trim().to_string();
                    if text.is_empty() {
                        continue;
                    }

                    match heading_level {
                        Some(1) => {
                            // Heading1 开启新画布：先终结上一段。
                            if let Some(title) = current_title.take() {
                                if !current_topics.is_empty() {
                                    sheets.push((title, std::mem::take(&mut current_topics)));
                                }
                            }
                            current_title = Some(text);
                            last_heading_depth = 0;
                        }
                        Some(level) => {
                            if current_title.is_none() {
                                current_title = Some(fallback_title.to_string());
                            }
                            let depth = (level - 1).min(DOCX_MAX_TOPIC_DEPTH);
                            current_topics.push((depth, text));
                            last_heading_depth = depth;
                        }
                        None => {
                            if current_title.is_none() {
                                current_title = Some(fallback_title.to_string());
                            }
                            let depth = (last_heading_depth + 1).min(DOCX_MAX_TOPIC_DEPTH);
                            current_topics.push((depth, text));
                        }
                    }
                }
                _ => {}
            },
            _ => {}
        }
        buf.clear();
    }

    if let Some(title) = current_title.take() {
        if !current_topics.is_empty() {
            sheets.push((title, current_topics));
        }
    }

    if sheets.is_empty() {
        return Err("Word 文档没有可导入的主题（缺少标题或正文段落）".into());
    }

    let sheets: Vec<SheetSnapshot> = sheets
        .into_iter()
        .map(|(title, topics)| build_sheet_from_markdown(title, &topics))
        .collect();

    let active_sheet_id = sheets[0].id.clone();

    Ok(DocumentSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION.into(),
        document_id: create_id("doc"),
        revision: 1,
        active_sheet_id,
        sheets,
        relationships: Vec::new(),
        settings: None,
        theme: None,
        extensions: None,
        extra: serde_json::Map::new(),
    })
}

/// 从 `<w:pStyle w:val="..."/>` 提取标题级别（1~6）。
///
/// 兼容 `Heading1` / `heading 1`（英文样式）与 `1`（中文 Word 的样式 ID）。
fn heading_level_from_style(value: &str) -> Option<usize> {
    let normalized = value.trim().to_ascii_lowercase();
    let digits = normalized
        .strip_prefix("heading")
        .map(str::trim)
        .unwrap_or(&normalized);

    if digits.len() == 1 {
        let level = digits.chars().next()?.to_digit(10)? as usize;
        if (1..=DOCX_MAX_HEADING_DEPTH).contains(&level) {
            return Some(level);
        }
    }

    None
}

fn read_xml_attribute(start: &BytesStart, key: &[u8]) -> Option<String> {
    for attr in start.attributes() {
        let attr = attr.ok()?;
        if attr.key.as_ref() == key {
            let raw = std::str::from_utf8(&attr.value).ok()?;
            return unescape_xml(raw).ok().map(|value| value.into_owned());
        }
    }
    None
}

// ============================================================================
// OPML 导出
// ============================================================================

pub fn export_opml_file(
    session: &crate::domain::document::DocumentSession,
    path: &Path,
) -> Result<(), String> {
    let document = session
        .document
        .as_ref()
        .ok_or_else(|| "当前没有可导出的文档".to_string())?;
    let opml = render_document_opml(document);

    write_text_export(path, &opml)
}

fn render_document_opml(document: &DocumentSnapshot) -> String {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);

    write_opml_declaration(&mut writer);
    write_opml_head(&mut writer, document);
    write_opml_body(&mut writer, document);

    String::from_utf8(writer.into_inner()).unwrap_or_default()
}

fn write_opml_declaration(writer: &mut Writer<Vec<u8>>) {
    writer
        .write_event(Event::Decl(quick_xml::events::BytesDecl::new(
            "1.0",
            Some("UTF-8"),
            None,
        )))
        .ok();
}

fn write_opml_head(writer: &mut Writer<Vec<u8>>, document: &DocumentSnapshot) {
    writer
        .write_event(Event::Start(
            BytesStart::new("opml").with_attributes([("version", OPML_VERSION)]),
        ))
        .ok();
    writer.write_event(Event::Start(BytesStart::new("head"))).ok();
    writer.write_event(Event::Start(BytesStart::new("title"))).ok();

    let title = document
        .sheets
        .first()
        .map(|sheet| sheet.title.as_str())
        .unwrap_or("MindGrid 文档");
    writer.write_event(Event::Text(BytesText::new(title))).ok();

    writer.write_event(Event::End(BytesEnd::new("title"))).ok();
    writer.write_event(Event::End(BytesEnd::new("head"))).ok();
}

fn write_opml_body(writer: &mut Writer<Vec<u8>>, document: &DocumentSnapshot) {
    writer.write_event(Event::Start(BytesStart::new("body"))).ok();

    for sheet in &document.sheets {
        let mut sheet_outline = BytesStart::new("outline");
        sheet_outline.push_attribute(("text", sheet.title.as_str()));
        sheet_outline.push_attribute((OPML_SHEET_ROLE, OPML_SHEET_ROLE_VALUE));

        writer.write_event(Event::Start(sheet_outline)).ok();
        write_topic_outline(writer, &sheet.root_topic);
        writer.write_event(Event::End(BytesEnd::new("outline"))).ok();
    }

    writer.write_event(Event::End(BytesEnd::new("body"))).ok();
    writer.write_event(Event::End(BytesEnd::new("opml"))).ok();
}

fn write_topic_outline(writer: &mut Writer<Vec<u8>>, topic: &TopicSnapshot) {
    let mut start = BytesStart::new("outline");
    start.push_attribute(("text", topic.text.as_str()));

    if topic.children.is_empty() {
        writer.write_event(Event::Empty(start)).ok();
        return;
    }

    writer.write_event(Event::Start(start)).ok();
    for child in &topic.children {
        write_topic_outline(writer, child);
    }
    writer.write_event(Event::End(BytesEnd::new("outline"))).ok();
}

// ============================================================================
// OPML 导入
// ============================================================================

pub fn import_opml_file(path: &Path) -> Result<DocumentSnapshot, String> {
    let file = File::open(path).map_err(|error| format!("无法打开 OPML 文件: {error}"))?;
    let reader = BufReader::new(file);

    parse_opml_to_document(reader)
}

fn parse_opml_to_document<R: BufRead>(reader: R) -> Result<DocumentSnapshot, String> {
    let mut xml = Reader::from_reader(reader);
    xml.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut head_title: Option<String> = None;
    let mut top_level_outlines: Vec<OutlineElement> = Vec::new();
    let mut outline_stack: Vec<OutlineElement> = Vec::new();

    loop {
        let event = xml
            .read_event_into(&mut buf)
            .map_err(|error| format!("OPML 解析失败: {error}"))?;

        match event {
            Event::Eof => break,
            Event::Start(ref start) if start.name().as_ref() == b"title" => {
                head_title = read_text_element(&mut xml)?;
            }
            Event::Start(ref start) if start.name().as_ref() == b"outline" => {
                let outline = read_outline_attributes(start, &xml)?;
                outline_stack.push(outline);
            }
            Event::Empty(ref start) if start.name().as_ref() == b"outline" => {
                let outline = read_outline_attributes(start, &xml)?;
                if outline_stack.is_empty() {
                    top_level_outlines.push(outline);
                } else if let Some(parent) = outline_stack.last_mut() {
                    parent.children.push(outline);
                }
            }
            Event::End(ref end) if end.name().as_ref() == b"outline" => {
                if let Some(finished) = outline_stack.pop() {
                    if outline_stack.is_empty() {
                        top_level_outlines.push(finished);
                    } else if let Some(parent) = outline_stack.last_mut() {
                        parent.children.push(finished);
                    }
                }
            }
            _ => {}
        }
    }

    if top_level_outlines.is_empty() {
        return Err("OPML body 没有任何 outline 元素".into());
    }

    let sheets = build_sheets_from_opml(top_level_outlines, head_title.as_deref());
    if sheets.is_empty() {
        return Err("OPML 导入后没有任何画布".into());
    }

    let active_sheet_id = sheets[0].id.clone();

    Ok(DocumentSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION.into(),
        document_id: create_id("doc"),
        revision: 1,
        active_sheet_id,
        sheets,
        relationships: Vec::new(),
        settings: None,
        theme: None,
        extensions: None,
        extra: serde_json::Map::new(),
    })
}

#[derive(Debug, Clone)]
struct OutlineElement {
    text: String,
    is_sheet_wrapper: bool,
    children: Vec<OutlineElement>,
}

fn read_outline_attributes<R: BufRead>(
    start: &BytesStart,
    xml: &Reader<R>,
) -> Result<OutlineElement, String> {
    let mut text: Option<String> = None;
    let mut is_sheet_wrapper = false;
    let decoder = xml.decoder();

    for attr in start.attributes() {
        let attr = attr.map_err(|error| format!("OPML 属性解析失败: {error}"))?;
        match attr.key.as_ref() {
            b"text" if text.is_none() => {
                let raw = decoder
                    .decode(&attr.value)
                    .map_err(|error| format!("OPML 文本解码失败: {error}"))?;
                let unescaped = unescape_xml(&raw)
                    .map_err(|error| format!("OPML 文本反转义失败: {error}"))?;
                text = Some(unescaped.into_owned());
            }
            b"title" if text.is_none() => {
                let raw = decoder
                    .decode(&attr.value)
                    .map_err(|error| format!("OPML 文本解码失败: {error}"))?;
                let unescaped = unescape_xml(&raw)
                    .map_err(|error| format!("OPML 文本反转义失败: {error}"))?;
                text = Some(unescaped.into_owned());
            }
            key if key == OPML_SHEET_ROLE.as_bytes() => {
                is_sheet_wrapper = attr.value.as_ref() == OPML_SHEET_ROLE_VALUE.as_bytes();
            }
            _ => {}
        }
    }

    Ok(OutlineElement {
        text: text.unwrap_or_default(),
        is_sheet_wrapper,
        children: Vec::new(),
    })
}

fn read_text_element<R: BufRead>(xml: &mut Reader<R>) -> Result<Option<String>, String> {
    let mut buf = Vec::new();
    let mut text = String::new();
    let mut depth = 1usize;

    while depth > 0 {
        let event = xml
            .read_event_into(&mut buf)
            .map_err(|error| format!("OPML 文本节点解析失败: {error}"))?;

        match event {
            Event::Eof => break,
            Event::Text(ref bytes) => {
                let decoded = bytes
                    .decode()
                    .map_err(|error| format!("OPML 文本解码失败: {error}"))?;
                if let Ok(unescaped) = unescape_xml(&decoded) {
                    if !text.is_empty() {
                        text.push(' ');
                    }
                    text.push_str(unescaped.as_ref());
                }
            }
            Event::Start(_) => depth += 1,
            Event::End(_) => depth -= 1,
            _ => {}
        }
    }

    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed))
    }
}

fn build_sheets_from_opml(
    outlines: Vec<OutlineElement>,
    head_title: Option<&str>,
) -> Vec<SheetSnapshot> {
    let fallback_title = head_title.unwrap_or(DEFAULT_SHEET_TITLE).to_string();

    outlines
        .into_iter()
        .enumerate()
        .map(|(index, outline)| {
            if outline.is_sheet_wrapper {
                build_sheet_from_wrapper(outline)
            } else {
                build_sheet_from_plain_outline(outline, &fallback_title, index)
            }
        })
        .collect()
}

fn build_sheet_from_wrapper(outline: OutlineElement) -> SheetSnapshot {
    let title = if outline.text.trim().is_empty() {
        DEFAULT_SHEET_TITLE.to_string()
    } else {
        outline.text
    };

    let root_topic = if let Some(first_child) = outline.children.into_iter().next() {
        build_topic_from_outline(first_child)
    } else {
        TopicSnapshot::new(DEFAULT_ROOT_TEXT)
    };

    SheetSnapshot {
        id: create_id("sheet"),
        title,
        root_topic,
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

fn build_sheet_from_plain_outline(
    outline: OutlineElement,
    fallback_title: &str,
    index: usize,
) -> SheetSnapshot {
    let sheet_title = if index == 0 {
        fallback_title.to_string()
    } else {
        format!("{DEFAULT_SHEET_TITLE} {}", index + 1)
    };

    let root_topic = build_topic_from_outline(outline);

    SheetSnapshot {
        id: create_id("sheet"),
        title: sheet_title,
        root_topic,
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

fn build_topic_from_outline(outline: OutlineElement) -> TopicSnapshot {
    let text = if outline.text.trim().is_empty() {
        DEFAULT_ROOT_TEXT
    } else {
        outline.text.as_str()
    };

    let mut topic = TopicSnapshot::new(text);
    for child in outline.children {
        topic.children.push(build_topic_from_outline(child));
    }
    topic
}

// ============================================================================
// 共享工具
// ============================================================================

fn write_text_export(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建导出目录: {error}"))?;
    }

    let temp_path = path.with_extension("tmp");
    let mut file =
        File::create(&temp_path).map_err(|error| format!("无法创建临时导出文件: {error}"))?;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("无法写入导出文件: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法刷新导出文件: {error}"))?;

    std::fs::rename(&temp_path, path)
        .map_err(|error| format!("无法完成导出文件替换: {error}"))?;

    Ok(())
}

/// 将二进制数据原子写入文件（临时文件 → fsync → rename）。
///
/// 用于 PNG 等二进制图像导出，与 `write_text_export` 保持相同的原子写入语义。
fn write_binary_export(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建导出目录: {error}"))?;
    }

    let temp_path = path.with_extension("tmp");
    let mut file =
        File::create(&temp_path).map_err(|error| format!("无法创建临时导出文件: {error}"))?;
    file.write_all(data)
        .map_err(|error| format!("无法写入导出文件: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法刷新导出文件: {error}"))?;

    std::fs::rename(&temp_path, path)
        .map_err(|error| format!("无法完成导出文件替换: {error}"))?;

    Ok(())
}

/// 将 PNG 二进制数据写入指定路径。
pub fn export_png_file(path: &Path, data: Vec<u8>) -> Result<(), String> {
    write_binary_export(path, &data)
}

/// 将 PDF 二进制数据写入指定路径（批次 20）。
pub fn export_pdf_file(path: &Path, data: Vec<u8>) -> Result<(), String> {
    write_binary_export(path, &data)
}

/// 将 SVG 文本写入指定路径。
pub fn export_svg_file(path: &Path, content: &str) -> Result<(), String> {
    write_text_export(path, content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::document::{DocumentSession, DocumentSnapshot, SheetSnapshot, TopicSnapshot};

    fn build_document_for_export() -> DocumentSnapshot {
        let mut document = DocumentSnapshot::new_default();
        document.sheets[0].title = "规划画布".into();
        document.sheets[0].root_topic.text = "年度规划".into();
        document.sheets[0].root_topic.children[0].text = "目标\n拆解".into();

        let second_sheet = SheetSnapshot {
            id: create_id("sheet"),
            title: "执行画布".into(),
            root_topic: TopicSnapshot::new("执行中心"),
            chart_type: None,
            layout_config: None,
            branch_style: None,
            floating_topics: Vec::new(),
            boundaries: Vec::new(),
            summaries: Vec::new(),
            extensions: None,
            extra: serde_json::Map::new(),
        };
        document.sheets.push(second_sheet);
        document.active_sheet_id = document.sheets[0].id.clone();
        document
    }

    #[test]
    fn markdown_round_trip_preserves_structure() {
        let original = build_document_for_export();
        let markdown = render_document_markdown(&original);
        let imported = parse_markdown_to_document(&markdown).expect("markdown should parse");

        assert_eq!(imported.sheets.len(), original.sheets.len());
        assert_eq!(imported.sheets[0].title, "规划画布");
        assert_eq!(imported.sheets[0].root_topic.text, "年度规划");
        // 多行文本被 normalize_markdown_text 合并成 "目标 / 拆解"，导入时按字面取回。
        assert_eq!(imported.sheets[0].root_topic.children[0].text, "目标 / 拆解");
        assert_eq!(imported.sheets[0].root_topic.children.len(), 3);
        assert_eq!(imported.sheets[1].title, "执行画布");
        assert_eq!(imported.sheets[1].root_topic.text, "执行中心");
    }

    #[test]
    fn markdown_import_handles_missing_header() {
        let markdown = "- 中心\n  - 子主题 A\n  - 子主题 B\n";
        let document =
            parse_markdown_to_document(markdown).expect("should parse without sheet header");

        assert_eq!(document.sheets.len(), 1);
        assert!(document.sheets[0].title.starts_with(DEFAULT_SHEET_TITLE));
        assert_eq!(document.sheets[0].root_topic.text, "中心");
        assert_eq!(document.sheets[0].root_topic.children.len(), 2);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "子主题 A");
    }

    #[test]
    fn markdown_import_rejects_empty_content() {
        let empty = "# 仅标题\n";
        let error = parse_markdown_to_document(empty).expect_err("empty content should fail");
        assert!(error.contains("没有可导入的主题"));
    }

    #[test]
    fn markdown_import_normalizes_irregular_indentation() {
        // 第二条 bullet 跳级到 depth 2，应作为 depth 1 的子节点。
        let markdown = "- 根\n      - 跳级子主题\n";
        let document =
            parse_markdown_to_document(markdown).expect("irregular indent should parse");

        assert_eq!(document.sheets[0].root_topic.text, "根");
        assert_eq!(document.sheets[0].root_topic.children.len(), 1);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "跳级子主题");
    }

    #[test]
    fn markdown_import_treats_multiple_root_bullets_as_children() {
        let markdown = "- 根\n- 兄弟\n";
        let document =
            parse_markdown_to_document(markdown).expect("multiple roots should parse");

        assert_eq!(document.sheets[0].root_topic.text, "根");
        assert_eq!(document.sheets[0].root_topic.children.len(), 1);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "兄弟");
    }

    #[test]
    fn opml_round_trip_preserves_multi_sheet_structure() {
        let original = build_document_for_export();
        let opml = render_document_opml(&original);
        let imported =
            parse_opml_to_document(std::io::Cursor::new(opml.as_bytes())).expect("opml should parse");

        assert_eq!(imported.sheets.len(), original.sheets.len());
        assert_eq!(imported.sheets[0].title, "规划画布");
        assert_eq!(imported.sheets[0].root_topic.text, "年度规划");
        assert_eq!(imported.sheets[0].root_topic.children.len(), 3);
        assert_eq!(imported.sheets[1].title, "执行画布");
        assert_eq!(imported.sheets[1].root_topic.text, "执行中心");
    }

    #[test]
    fn opml_import_handles_plain_third_party_format() {
        let opml = concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n",
            "<opml version=\"2.0\">\n",
            "  <head><title>第三方文档</title></head>\n",
            "  <body>\n",
            "    <outline text=\"根主题\">\n",
            "      <outline text=\"子主题 A\"/>\n",
            "      <outline text=\"子主题 B\"/>\n",
            "    </outline>\n",
            "  </body>\n",
            "</opml>\n",
        );
        let document = parse_opml_to_document(std::io::Cursor::new(opml.as_bytes()))
            .expect("plain opml should parse");

        assert_eq!(document.sheets.len(), 1);
        assert_eq!(document.sheets[0].title, "第三方文档");
        assert_eq!(document.sheets[0].root_topic.text, "根主题");
        assert_eq!(document.sheets[0].root_topic.children.len(), 2);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "子主题 A");
    }

    #[test]
    fn opml_import_escapes_xml_entities() {
        let opml = concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n",
            "<opml version=\"2.0\">\n",
            "  <body>\n",
            "    <outline text=\"A &amp; B &lt;tag&gt; &quot;quote&quot;\"/>\n",
            "  </body>\n",
            "</opml>\n",
        );
        let document = parse_opml_to_document(std::io::Cursor::new(opml.as_bytes()))
            .expect("escaped opml should parse");

        assert_eq!(document.sheets[0].root_topic.text, r#"A & B <tag> "quote""#);
    }

    #[test]
    fn opml_export_emits_valid_xml_with_escaped_text() {
        let mut document = DocumentSnapshot::new_default();
        document.sheets[0].title = "特殊<字符>".into();
        document.sheets[0].root_topic.text = "A & B".into();

        let opml = render_document_opml(&document);

        assert!(opml.contains("<opml version=\"2.0\">"));
        assert!(opml.contains("text=\"特殊&lt;字符&gt;\""));
        assert!(opml.contains("text=\"A &amp; B\""));
        assert!(opml.contains("mgd_role=\"sheet\""));
    }

    #[test]
    fn opml_import_rejects_empty_body() {
        let opml = concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n",
            "<opml version=\"2.0\">\n",
            "  <head><title>空文档</title></head>\n",
            "  <body></body>\n",
            "</opml>\n",
        );
        let error = parse_opml_to_document(std::io::Cursor::new(opml.as_bytes()))
            .expect_err("empty body should fail");
        assert!(error.contains("没有任何 outline"));
    }

    #[test]
    fn markdown_export_writes_file_round_trip() {
        let document = build_document_for_export();
        let session = DocumentSession::from_document(document);
        let temp_path = std::env::temp_dir().join("mindgrid-import-export-md-test.md");

        export_markdown_file(&session, &temp_path).expect("markdown should export");
        let imported = import_markdown_file(&temp_path).expect("markdown should re-import");

        assert_eq!(imported.sheets.len(), 2);
        assert_eq!(imported.sheets[0].title, "规划画布");

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn opml_export_writes_file_round_trip() {
        let document = build_document_for_export();
        let session = DocumentSession::from_document(document);
        let temp_path = std::env::temp_dir().join("mindgrid-import-export-opml-test.opml");

        export_opml_file(&session, &temp_path).expect("opml should export");
        let imported = import_opml_file(&temp_path).expect("opml should re-import");

        assert_eq!(imported.sheets.len(), 2);
        assert_eq!(imported.sheets[0].title, "规划画布");
        assert_eq!(imported.sheets[0].root_topic.text, "年度规划");

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn png_export_writes_binary_file_round_trip() {
        let temp_path = std::env::temp_dir().join("mindgrid-png-test.png");
        // PNG 签名头 + 示例数据
        let data = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];

        export_png_file(&temp_path, data.clone()).expect("png should export");

        let read_back = std::fs::read(&temp_path).expect("png should read back");
        assert_eq!(read_back, data);

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn svg_export_writes_text_file_round_trip() {
        let temp_path = std::env::temp_dir().join("mindgrid-svg-test.svg");
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\"/></svg>";

        export_svg_file(&temp_path, svg).expect("svg should export");

        let read_back = std::fs::read_to_string(&temp_path).expect("svg should read back");
        assert!(read_back.contains("<svg"));
        assert!(read_back.contains("viewBox=\"0 0 100 100\""));

        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn pdf_export_writes_binary_file_round_trip() {
        let temp_path = std::env::temp_dir().join("mindgrid-pdf-test.pdf");
        // PDF 文件签名头："%PDF-1.7" + 示例字节
        let data = vec![0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37, 0x0A, 0x25, 0xE2, 0xE3];

        export_pdf_file(&temp_path, data.clone()).expect("pdf should export");

        let read_back = std::fs::read(&temp_path).expect("pdf should read back");
        assert_eq!(read_back, data);

        let _ = std::fs::remove_file(temp_path);
    }

    // ------------------------------------------------------------------
    // Word (.docx) 导入
    // ------------------------------------------------------------------

    fn build_test_docx(document_xml: &str) -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            let options = zip::write::FileOptions::default();
            writer
                .start_file("word/document.xml", options)
                .expect("docx entry should start");
            std::io::Write::write_all(&mut writer, document_xml.as_bytes())
                .expect("docx xml should write");
            writer.finish().expect("docx zip should finish");
        }
        cursor.into_inner()
    }

    #[test]
    fn docx_import_maps_heading_levels_to_topic_depth() {
        let docx = build_test_docx(concat!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n",
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>项目规划</w:t></w:r></w:p>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading2\"/></w:pPr><w:r><w:t>目标</w:t></w:r></w:p>",
            "<w:p><w:r><w:t>提升留存率</w:t></w:r></w:p>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading3\"/></w:pPr><w:r><w:t>衡量指标</w:t></w:r></w:p>",
            "</w:body></w:document>",
        ));
        let document = parse_docx_to_document(&docx, "项目规划").expect("docx should parse");

        assert_eq!(document.sheets.len(), 1);
        assert_eq!(document.sheets[0].title, "项目规划");
        // Heading1 后的第一个条目（Heading2「目标」）成为根主题。
        assert_eq!(document.sheets[0].root_topic.text, "目标");
        // 正文段落与 Heading3 都挂在「目标」之下。
        assert_eq!(document.sheets[0].root_topic.children.len(), 2);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "提升留存率");
        assert_eq!(document.sheets[0].root_topic.children[1].text, "衡量指标");
    }

    #[test]
    fn docx_import_splits_sheets_on_heading1() {
        let docx = build_test_docx(concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>画布一</w:t></w:r></w:p>",
            "<w:p><w:r><w:t>主题 A</w:t></w:r></w:p>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>画布二</w:t></w:r></w:p>",
            "<w:p><w:r><w:t>主题 B</w:t></w:r></w:p>",
            "</w:body></w:document>",
        ));
        let document = parse_docx_to_document(&docx, "大纲").expect("docx should parse");

        assert_eq!(document.sheets.len(), 2);
        assert_eq!(document.sheets[0].title, "画布一");
        assert_eq!(document.sheets[0].root_topic.text, "主题 A");
        assert_eq!(document.sheets[1].title, "画布二");
        assert_eq!(document.sheets[1].root_topic.text, "主题 B");
    }

    #[test]
    fn docx_import_falls_back_to_file_stem_without_heading1() {
        let docx = build_test_docx(concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:r><w:t>中心主题</w:t></w:r></w:p>",
            "<w:p><w:r><w:t>子主题</w:t></w:r></w:p>",
            "</w:body></w:document>",
        ));
        let document = parse_docx_to_document(&docx, "会议纪要").expect("docx should parse");

        assert_eq!(document.sheets.len(), 1);
        assert_eq!(document.sheets[0].title, "会议纪要");
        assert_eq!(document.sheets[0].root_topic.text, "中心主题");
        assert_eq!(document.sheets[0].root_topic.children.len(), 1);
        assert_eq!(document.sheets[0].root_topic.children[0].text, "子主题");
    }

    #[test]
    fn docx_import_supports_lowercase_and_numeric_heading_styles() {
        let docx = build_test_docx(concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:pPr><w:pStyle w:val=\"heading 1\"/></w:pPr><w:r><w:t>根</w:t></w:r></w:p>",
            "<w:p><w:pPr><w:pStyle w:val=\"2\"/></w:pPr><w:r><w:t>子</w:t></w:r></w:p>",
            "</w:body></w:document>",
        ));
        let document = parse_docx_to_document(&docx, "大纲").expect("docx should parse");

        // "heading 1"（小写带空格）识别为 Heading1 → 画布标题；
        // "2"（中文 Word 样式 ID）识别为 Heading2 → 根主题。
        assert_eq!(document.sheets[0].title, "根");
        assert_eq!(document.sheets[0].root_topic.text, "子");
        assert!(document.sheets[0].root_topic.children.is_empty());
    }

    #[test]
    fn docx_import_joins_text_runs_and_skips_empty_paragraphs() {
        let docx = build_test_docx(concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr>",
            "<w:r><w:t>关</w:t></w:r><w:r><w:t>键</w:t><w:tab/><w:t>词</w:t></w:r></w:p>",
            "<w:p><w:r><w:t>   </w:t></w:r></w:p>",
            "<w:p><w:r><w:t>正文主题</w:t></w:r></w:p>",
            "</w:body></w:document>",
        ));
        let document = parse_docx_to_document(&docx, "大纲").expect("docx should parse");

        // 多个 w:t run 与 w:tab 合并为单段文本；纯空白段落被跳过。
        assert_eq!(document.sheets[0].title, "关键 词");
        assert_eq!(document.sheets[0].root_topic.text, "正文主题");
    }

    #[test]
    fn docx_import_rejects_document_without_topics() {
        let docx = build_test_docx(concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body><w:p><w:r><w:t>   </w:t></w:r></w:p></w:body></w:document>",
        ));
        let error = parse_docx_to_document(&docx, "空文档").expect_err("empty docx should fail");
        assert!(error.contains("没有可导入的主题"));
    }

    #[test]
    fn docx_import_rejects_non_docx_zip() {
        let bytes = b"not a zip archive";
        let error =
            parse_docx_to_document(bytes, "大纲").expect_err("non-zip content should fail");
        assert!(error.contains("ZIP 解析失败") || error.contains("word/document.xml"));
    }
}
