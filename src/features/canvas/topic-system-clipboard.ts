import type { TopicSnapshot } from '../../lib/document/types'

const CLIPBOARD_MARKER = 'MINDGRID_TOPICS::'

interface TopicClipboardPayload {
  version: 1
  topics: TopicSnapshot[]
}

export type SystemClipboardWriteResult = 'success' | 'unavailable' | 'failed'

export type SystemClipboardReadResult =
  | {
      status: 'success'
      topics: TopicSnapshot[]
    }
  | {
      status: 'unavailable' | 'failed' | 'invalid'
      topics: null
    }

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function decodeBase64(text: string) {
  const binary = atob(text)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

function formatTopicOutline(topic: TopicSnapshot, depth = 0): string {
  const prefix = `${'  '.repeat(depth)}- `
  const lines = [`${prefix}${topic.text}`]

  topic.children.forEach((child) => {
    lines.push(formatTopicOutline(child, depth + 1))
  })

  return lines.join('\n')
}

export function serializeTopicsForClipboard(topics: TopicSnapshot[]) {
  const payload: TopicClipboardPayload = {
    version: 1,
    topics,
  }
  const outline = topics.map((topic) => formatTopicOutline(topic)).join('\n')
  const encodedPayload = encodeBase64(JSON.stringify(payload))

  return `${outline}\n\n${CLIPBOARD_MARKER}${encodedPayload}`
}

export function parseTopicsFromClipboard(text: string): TopicSnapshot[] | null {
  const markerIndex = text.lastIndexOf(CLIPBOARD_MARKER)

  if (markerIndex < 0) {
    return null
  }

  const encodedPayload = text.slice(markerIndex + CLIPBOARD_MARKER.length).trim()

  if (!encodedPayload) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64(encodedPayload)) as TopicClipboardPayload

    if (payload.version !== 1 || !Array.isArray(payload.topics)) {
      return null
    }

    return payload.topics
  } catch {
    return null
  }
}

export async function writeTopicsToSystemClipboard(
  topics: TopicSnapshot[],
): Promise<SystemClipboardWriteResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return 'unavailable'
  }

  try {
    await navigator.clipboard.writeText(serializeTopicsForClipboard(topics))

    return 'success'
  } catch {
    return 'failed'
  }
}

export async function readTopicsFromSystemClipboard(): Promise<SystemClipboardReadResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return {
      status: 'unavailable',
      topics: null,
    }
  }

  try {
    const text = await navigator.clipboard.readText()
    const topics = parseTopicsFromClipboard(text)

    if (!topics || topics.length === 0) {
      return {
        status: 'invalid',
        topics: null,
      }
    }

    return {
      status: 'success',
      topics,
    }
  } catch {
    return {
      status: 'failed',
      topics: null,
    }
  }
}
