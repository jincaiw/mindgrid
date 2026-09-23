import type {
  CanvasIllustration,
  DocumentSessionSnapshot,
  MergeSummary,
  DocumentSnapshot,
  SheetBranchStyle,
  SheetNumbering,
  TopicLink,
  TopicMarker,
  TopicCallout,
  TopicSticker,
  TopicSnapshot,
  TopicStructure,
  TopicStyleOverrides,
  TopicTask,
} from '../document/types'
import { invokeCommand } from './transport'

export function createDocument() {
  return invokeCommand<DocumentSessionSnapshot>('create_document')
}

export function createDocumentFromTemplate(document: DocumentSnapshot) {
  return invokeCommand<DocumentSessionSnapshot>('create_document_from_template', { document })
}

export function getDocumentState() {
  return invokeCommand<DocumentSessionSnapshot | null>('get_document_state')
}

export function openRecentFile(index: number) {
  return invokeCommand<DocumentSessionSnapshot>('open_recent_file', { index })
}

export function clearRecentFiles() {
  return invokeCommand<DocumentSessionSnapshot>('clear_recent_files')
}

export function openDocumentFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('open_document_file', { path })
}

export function saveDocumentFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('save_document_file', { path })
}

/**
 * 合并另一个 .mgd 文件：把它的每张画布追加到当前文档末尾。
 *
 * 与其它命令不同，它同时返回**摘要**（合并了几张画布/几个主题）与快照——
 * 调用方要拿摘要给用户一句交代。
 */
export function mergeDocumentFile(path: string) {
  return invokeCommand<{ summary: MergeSummary; snapshot: DocumentSessionSnapshot }>(
    'merge_document_file',
    { path },
  )
}

export function saveDocumentToCurrentFile() {
  return invokeCommand<DocumentSessionSnapshot>('save_document_to_current_file')
}

export function exportRecoveryCopy(path: string) {
  return invokeCommand<void>('export_recovery_copy', { path })
}

export function exportMarkdownFile(path: string) {
  return invokeCommand<void>('export_markdown_file', { path })
}

export function importMarkdownFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('import_markdown_file', { path })
}

export function exportOpmlFile(path: string) {
  return invokeCommand<void>('export_opml_file', { path })
}

export function importOpmlFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('import_opml_file', { path })
}

export function importDocxFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('import_docx_file', { path })
}

export function setDocumentSetting(key: string, value: unknown | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_document_setting', { key, value })
}

export function exportPngFile(path: string, data: Uint8Array) {
  return invokeCommand<void>('export_png_file', { path, data: Array.from(data) })
}

export function exportPdfFile(path: string, data: Uint8Array) {
  return invokeCommand<void>('export_pdf_file', { path, data: Array.from(data) })
}

export function exportSvgFile(path: string, content: string) {
  return invokeCommand<void>('export_svg_file', { path, content })
}

export function repairDocumentFile(sourcePath: string, destinationPath: string) {
  return invokeCommand<DocumentSessionSnapshot>('repair_document_file', {
    source_path: sourcePath,
    destination_path: destinationPath,
  })
}

export function clearRepairReport() {
  return invokeCommand<DocumentSessionSnapshot>('clear_repair_report')
}

export function selectSheet(sheetId: string) {
  return invokeCommand<DocumentSessionSnapshot>('select_sheet', { sheet_id: sheetId })
}

export function createSheet() {
  return invokeCommand<DocumentSessionSnapshot>('create_sheet')
}

export function renameSheet(sheetId: string, title: string) {
  return invokeCommand<DocumentSessionSnapshot>('rename_sheet', { sheet_id: sheetId, title })
}

export function deleteSheet(sheetId: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_sheet', { sheet_id: sheetId })
}

export function moveSheet(sheetId: string, direction: 'up' | 'down') {
  return invokeCommand<DocumentSessionSnapshot>('move_sheet', {
    sheet_id: sheetId,
    direction,
  })
}

export function setSheetChartType(sheetId: string, chartType: string) {
  return invokeCommand<DocumentSessionSnapshot>('set_sheet_chart_type', {
    sheet_id: sheetId,
    chart_type: chartType,
  })
}

export function setSheetBranchStyle(
  sheetId: string,
  branchStyle: SheetBranchStyle | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('set_sheet_branch_style', {
    sheet_id: sheetId,
    branch_style: branchStyle,
  })
}

export function setSheetNumbering(
  sheetId: string,
  numbering: SheetNumbering | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('set_sheet_numbering', {
    sheet_id: sheetId,
    numbering,
  })
}

export function setSheetIllustrations(
  sheetId: string,
  illustrations: CanvasIllustration[],
) {
  return invokeCommand<DocumentSessionSnapshot>('set_sheet_illustrations', {
    sheet_id: sheetId,
    illustrations,
  })
}

export function setSheetLayoutDirection(sheetId: string, direction: string) {
  return invokeCommand<DocumentSessionSnapshot>('set_sheet_layout_direction', {
    sheet_id: sheetId,
    direction,
  })
}

export function applyTopicStyleToSiblings(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('apply_topic_style_to_siblings', {
    topic_id: topicId,
  })
}

export function setTopicPosition(
  topicId: string,
  offsetX: number | null,
  offsetY: number | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_position', {
    topic_id: topicId,
    offset_x: offsetX,
    offset_y: offsetY,
  })
}

/**
 * 批量写入自由位置（编辑 → 自由主题对齐）。
 *
 * 一次调用 = 服务端一个 change set = **一次撤销**回退全部，而不是每个主题各撤一步。
 */
export function setTopicsPosition(
  positions: Array<{ topicId: string; offsetX: number; offsetY: number }>,
  actionLabel?: string,
) {
  return invokeCommand<DocumentSessionSnapshot>('set_topics_position', {
    positions: positions.map((item) => ({
      topic_id: item.topicId,
      offset_x: item.offsetX,
      offset_y: item.offsetY,
    })),
    action_label: actionLabel,
  })
}

export function selectTopic(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('select_topic', { topic_id: topicId })
}

export function createChildTopic(parentId: string) {
  return invokeCommand<DocumentSessionSnapshot>('create_child_topic', { parent_id: parentId })
}

export function createSiblingTopic(topicId: string, position?: 'before' | 'after') {
  return invokeCommand<DocumentSessionSnapshot>('create_sibling_topic', {
    topic_id: topicId,
    position: position ?? null,
  })
}

export function createParentTopic(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('create_parent_topic', { topic_id: topicId })
}

export function createFloatingTopic(text: string, offsetX: number, offsetY: number) {
  return invokeCommand<DocumentSessionSnapshot>('create_floating_topic', {
    text,
    offset_x: offsetX,
    offset_y: offsetY,
  })
}

export function renameTopic(topicId: string, text: string) {
  return invokeCommand<DocumentSessionSnapshot>('rename_topic', { topic_id: topicId, text })
}

export function deleteTopic(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_topic', { topic_id: topicId })
}

export function deleteTopics(topicIds: string[], actionLabel?: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_topics', {
    topic_ids: topicIds,
    action_label: actionLabel,
  })
}

export function toggleTopicCollapsed(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('toggle_topic_collapsed', { topic_id: topicId })
}

/** 批量折叠 / 展开：Rust 侧落在一个 change set 内，故整体只需一次撤销。 */
export function setTopicsCollapsed(topicIds: string[], collapsed: boolean) {
  return invokeCommand<DocumentSessionSnapshot>('set_topics_collapsed', {
    topic_ids: topicIds,
    collapsed,
  })
}

export function setTopicNotes(topicId: string, notes: string | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_notes', {
    topic_id: topicId,
    notes,
  })
}

export function setTopicLink(topicId: string, link: TopicLink | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_link', {
    topic_id: topicId,
    link,
  })
}

/**
 * 给主题插入图片。
 * @param topicId 目标主题
 * @param sourcePath 本地图片绝对路径（Tauri）；浏览器开发态可传 data: URL 兜底
 */
export function setTopicImage(topicId: string, sourcePath: string) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_image', {
    topic_id: topicId,
    source_path: sourcePath,
  })
}

export function removeTopicImage(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('remove_topic_image', { topic_id: topicId })
}

/**
 * 为主题附加一个文件：桌面端传本地绝对路径（Rust 读盘并登记进 `assets/attachments/`），
 * 浏览器开发态传 `data:` URL。同一内容会被资源表按 SHA-256 去重。
 */
export function setTopicAttachment(topicId: string, sourcePath: string, name?: string) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_attachment', {
    topic_id: topicId,
    source_path: sourcePath,
    // 只有浏览器开发态需要（那里没有真实路径，显示名只能由调用方带过来）
    name,
  })
}

/** 移除主题附件（资源本体留给保存时的 GC 回收，撤销后仍可恢复）。 */
export function removeTopicAttachment(topicId: string) {
  return invokeCommand<DocumentSessionSnapshot>('remove_topic_attachment', {
    topic_id: topicId,
  })
}

/** 用系统默认应用打开附件；返回已打开的文件名（供提示用）。 */
export function openTopicAttachment(topicId: string) {
  return invokeCommand<string>('open_topic_attachment', { topic_id: topicId })
}

/** 读取资源内容为 data URL（形如 data:image/png;base64,...），供画布渲染使用。 */
export function readAssetDataUrl(assetId: string) {
  return invokeCommand<string>('read_asset_data_url', { asset_id: assetId })
}

export function setTopicMarkers(topicId: string, markers: TopicMarker[]) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_markers', {
    topic_id: topicId,
    markers,
  })
}

/**
 * 整体替换主题的贴纸列表。
 *
 * "贴一张 / 拖动 / 移除"都收敛到这一条：贴纸是**列表型富字段**，
 * 整批一份 old/new 交给撤销栈，不用为每种操作各做一个命令。
 */
export function setTopicStickers(topicId: string, stickers: TopicSticker[]) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_stickers', {
    topic_id: topicId,
    stickers,
  })
}

/** 设置 / 移除主题标注（画布上的说明框）。 */
export function setTopicCallout(topicId: string, callout: TopicCallout | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_callout', {
    topic_id: topicId,
    callout,
  })
}

export function setTopicLabels(topicId: string, labels: string[]) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_labels', {
    topic_id: topicId,
    labels,
  })
}

export function setTopicTask(topicId: string, task: TopicTask | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_task', {
    topic_id: topicId,
    task,
  })
}

export function setTopicStyleRef(topicId: string, styleRef: string | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_style_ref', {
    topic_id: topicId,
    style_ref: styleRef,
  })
}

export function setTopicStyleOverrides(
  topicId: string,
  styleOverrides: TopicStyleOverrides | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_style_overrides', {
    topic_id: topicId,
    style_overrides: styleOverrides,
  })
}

export function setTopicStructure(topicId: string, structure: TopicStructure | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_structure', {
    topic_id: topicId,
    structure,
  })
}

export function setDocumentTheme(themeId: string | null) {
  return invokeCommand<DocumentSessionSnapshot>('set_document_theme', {
    theme_id: themeId,
  })
}

export function createRelationship(
  fromTopicId: string,
  toTopicId: string,
  label: string | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('create_relationship', {
    from_topic_id: fromTopicId,
    to_topic_id: toTopicId,
    label,
  })
}

export function deleteRelationship(relationshipId: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_relationship', {
    relationship_id: relationshipId,
  })
}

export function createBoundary(
  sheetId: string,
  topicIds: string[],
  label: string | null,
) {
  return invokeCommand<DocumentSessionSnapshot>('create_boundary', {
    sheet_id: sheetId,
    topic_ids: topicIds,
    label,
  })
}

export function deleteBoundary(sheetId: string, boundaryId: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_boundary', {
    sheet_id: sheetId,
    boundary_id: boundaryId,
  })
}

export function createSummary(sheetId: string, topicIds: string[], label: string) {
  return invokeCommand<DocumentSessionSnapshot>('create_summary', {
    sheet_id: sheetId,
    topic_ids: topicIds,
    label,
  })
}

export function deleteSummary(sheetId: string, summaryId: string) {
  return invokeCommand<DocumentSessionSnapshot>('delete_summary', {
    sheet_id: sheetId,
    summary_id: summaryId,
  })
}

export function createSheetFromTopic(topicId: string, title?: string) {
  return invokeCommand<DocumentSessionSnapshot>('create_sheet_from_topic', {
    topic_id: topicId,
    title,
  })
}

export function deleteTopicOnly(topicIds: string[]) {
  return invokeCommand<DocumentSessionSnapshot>('delete_topic_only', {
    topic_ids: topicIds,
  })
}

export function moveTopic(
  topicId: string,
  targetParentId: string,
  actionLabel?: string,
  targetIndex?: number,
) {
  return invokeCommand<DocumentSessionSnapshot>('move_topic', {
    topic_id: topicId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
    // 省略 = 追加到末尾；「减少缩进」需要落在原父主题之后，必须给位置
    target_index: targetIndex,
  })
}

export function moveTopics(topicIds: string[], targetParentId: string, actionLabel?: string) {
  return invokeCommand<DocumentSessionSnapshot>('move_topics', {
    topic_ids: topicIds,
    target_parent_id: targetParentId,
    action_label: actionLabel,
  })
}

export function moveTopicInParent(topicId: string, direction: 'up' | 'down') {
  return invokeCommand<DocumentSessionSnapshot>('move_topic_in_parent', {
    topic_id: topicId,
    direction,
  })
}

export function moveTopicToSheet(
  topicId: string,
  targetSheetId: string,
  targetParentId?: string,
  actionLabel?: string,
) {
  return invokeCommand<DocumentSessionSnapshot>('move_topic_to_sheet', {
    topic_id: topicId,
    target_sheet_id: targetSheetId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
  })
}

export function moveTopicsToSheet(
  topicIds: string[],
  targetSheetId: string,
  targetParentId?: string,
  actionLabel?: string,
) {
  return invokeCommand<DocumentSessionSnapshot>('move_topics_to_sheet', {
    topic_ids: topicIds,
    target_sheet_id: targetSheetId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
  })
}

export function copyTopicToSheet(
  topicId: string,
  targetSheetId: string,
  targetParentId?: string,
  actionLabel?: string,
) {
  return invokeCommand<DocumentSessionSnapshot>('copy_topic_to_sheet', {
    topic_id: topicId,
    target_sheet_id: targetSheetId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
  })
}

export function copyTopicsToSheet(
  topicIds: string[],
  targetSheetId: string,
  targetParentId?: string,
  actionLabel?: string,
) {
  return invokeCommand<DocumentSessionSnapshot>('copy_topics_to_sheet', {
    topic_ids: topicIds,
    target_sheet_id: targetSheetId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
  })
}

export function pasteTopics(topics: TopicSnapshot[], targetParentId: string) {
  return invokeCommand<DocumentSessionSnapshot>('paste_topics', {
    topics,
    target_parent_id: targetParentId,
  })
}

export function undoDocumentCommand() {
  return invokeCommand<DocumentSessionSnapshot>('undo_document_command')
}

export function redoDocumentCommand() {
  return invokeCommand<DocumentSessionSnapshot>('redo_document_command')
}
