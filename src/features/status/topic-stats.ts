import type { TopicSnapshot } from '../../lib/document/types'

export interface TopicStats {
  topicCount: number
  wordCount: number
  charCount: number
}

// CJK 统一表意文字 / 兼容表意文字 / 日文假名 / 韩文音节
const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/

/**
 * XMind 式统计信息：主题个数 / 字数 / 字符数。
 *
 * 单独成文件而非随 status-bar.tsx 导出：组件文件额外导出非组件符号会触发
 * react(only-export-components)，破坏 fast refresh。
 *
 * 计数口径：CJK 逐字计为一字；拉丁按空白分词计为一词；字符数不计空白。
 */
export function collectTopicStats(rootTopic: TopicSnapshot | null | undefined): TopicStats {
  if (!rootTopic) {
    return { topicCount: 0, wordCount: 0, charCount: 0 }
  }

  let topicCount = 0
  let wordCount = 0
  let charCount = 0
  const stack: TopicSnapshot[] = [rootTopic]

  while (stack.length > 0) {
    const topic = stack.pop()!
    topicCount += 1

    const text = topic.text ?? ''
    charCount += text.replace(/\s/g, '').length

    // CJK 逐字计一词，其余字符攒成串后按空白分词，避免中英混排时重复计数
    let latin = ''
    for (const char of text) {
      if (CJK_PATTERN.test(char)) {
        wordCount += 1
      } else {
        latin += char
      }
    }
    wordCount += latin.split(/\s+/).filter(Boolean).length

    for (const child of topic.children ?? []) {
      stack.push(child)
    }
  }

  return { topicCount, wordCount, charCount }
}
