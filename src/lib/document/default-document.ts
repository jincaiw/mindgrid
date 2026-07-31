import type { DocumentSnapshot, SheetSnapshot, TopicSnapshot } from './types'

export function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function createTopic(text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return {
    id: createId('topic'),
    text,
    collapsed: false,
    children,
  }
}

export function createSheet(title: string): SheetSnapshot {
  return {
    id: createId('sheet'),
    title,
    rootTopic: createTopic('中心主题', [
      createTopic('关键洞察'),
      createTopic('行动项'),
      createTopic('待验证假设'),
    ]),
  }
}

export const CURRENT_SCHEMA_VERSION = '1.1.0'

export function createDefaultDocument(): DocumentSnapshot {
  const sheet = createSheet('主画布')

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentId: createId('doc'),
    revision: 1,
    activeSheetId: sheet.id,
    sheets: [sheet],
  }
}
