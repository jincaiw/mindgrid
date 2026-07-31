import type { DocumentSnapshot, SheetSnapshot, TopicSnapshot } from './types'

export function getSheetById(document: DocumentSnapshot, sheetId: string) {
  return document.sheets.find((sheet) => sheet.id === sheetId) ?? null
}

export function getActiveSheet(document: DocumentSnapshot): SheetSnapshot {
  return getSheetById(document, document.activeSheetId) ?? document.sheets[0]
}

export function getActiveRootTopic(document: DocumentSnapshot): TopicSnapshot {
  return getActiveSheet(document).rootTopic
}
