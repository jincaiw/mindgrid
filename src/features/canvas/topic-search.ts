import type { DocumentSnapshot, TopicSnapshot } from '../../lib/document/types'

export interface TopicSearchEntry {
  topicId: string
  text: string
  depth: number
  path: string[]
  sheetId: string | null
  sheetTitle: string | null
}

function walkTopic(
  topic: TopicSnapshot,
  depth: number,
  path: string[],
  entries: TopicSearchEntry[],
  sheetId: string | null,
  sheetTitle: string | null,
) {
  const nextPath = [...path, topic.text]

  entries.push({
    topicId: topic.id,
    text: topic.text,
    depth,
    path: nextPath,
    sheetId,
    sheetTitle,
  })

  topic.children.forEach((child) => {
    walkTopic(child, depth + 1, nextPath, entries, sheetId, sheetTitle)
  })
}

export function buildTopicSearchIndex(rootTopic: TopicSnapshot) {
  const entries: TopicSearchEntry[] = []

  walkTopic(rootTopic, 0, [], entries, null, null)

  return entries
}

export function buildDocumentTopicSearchIndex(document: DocumentSnapshot) {
  const entries: TopicSearchEntry[] = []

  document.sheets.forEach((sheet) => {
    walkTopic(sheet.rootTopic, 0, [], entries, sheet.id, sheet.title)
  })

  return entries
}

export function searchTopics(entries: TopicSearchEntry[], query: string) {
  const normalizedTokens = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (normalizedTokens.length === 0) {
    return []
  }

  return entries.filter((entry) => {
    const haystack = `${entry.sheetTitle ?? ''} ${entry.text} ${entry.path.join(' ')}`.toLocaleLowerCase()

    return normalizedTokens.every((token) => haystack.includes(token))
  })
}
