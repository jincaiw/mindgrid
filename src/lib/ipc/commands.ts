import type {
  DocumentSessionSnapshot,
  DocumentSnapshot,
  SheetBranchStyle,
  TopicLink,
  TopicMarker,
  TopicSnapshot,
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

export function openDocumentFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('open_document_file', { path })
}

export function saveDocumentFile(path: string) {
  return invokeCommand<DocumentSessionSnapshot>('save_document_file', { path })
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

export function setTopicMarkers(topicId: string, markers: TopicMarker[]) {
  return invokeCommand<DocumentSessionSnapshot>('set_topic_markers', {
    topic_id: topicId,
    markers,
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

export function moveTopic(topicId: string, targetParentId: string, actionLabel?: string) {
  return invokeCommand<DocumentSessionSnapshot>('move_topic', {
    topic_id: topicId,
    target_parent_id: targetParentId,
    action_label: actionLabel,
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
