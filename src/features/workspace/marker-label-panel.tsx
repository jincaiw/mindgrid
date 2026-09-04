import { useMemo } from 'react'
import { MarkerIcon, getMarkerLabel } from '../canvas/markers'
import { getActiveSheet } from '../../lib/document/sheets'
import { flattenTopicTree } from '../../lib/document/tree'
import type { TopicSnapshot } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'

interface MarkerLabelPanelProps {
  session: DocumentSession
  onSelectedTopicIdsChange: (topicIds: string[]) => void
}

interface MarkerGroup {
  /** 同 id 的 marker 视为同一组（不同主题上的 label 覆盖以首次出现为准）。 */
  id: string
  label: string
  topicIds: string[]
}

interface LabelGroup {
  text: string
  topicIds: string[]
}

/** 前序（文档序）收集全部主题：栈式遍历需逆序压栈，否则兄弟顺序会被翻转。 */
function collectTopics(rootTopic: TopicSnapshot | null | undefined): TopicSnapshot[] {
  if (!rootTopic) {
    return []
  }

  const stack: TopicSnapshot[] = [rootTopic]
  const all: TopicSnapshot[] = []

  while (stack.length > 0) {
    const topic = stack.pop()!
    all.push(topic)

    const children = topic.children ?? []

    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i])
    }
  }

  return all
}

function collectMarkerGroups(topics: TopicSnapshot[]): MarkerGroup[] {
  const byId = new Map<string, MarkerGroup>()

  for (const topic of topics) {
    for (const marker of topic.markers ?? []) {
      const existing = byId.get(marker.id)

      if (existing) {
        existing.topicIds.push(topic.id)
        continue
      }

      byId.set(marker.id, {
        id: marker.id,
        label: getMarkerLabel(marker),
        topicIds: [topic.id],
      })
    }
  }

  return [...byId.values()].sort((a, b) => b.topicIds.length - a.topicIds.length)
}

function collectLabelGroups(topics: TopicSnapshot[]): LabelGroup[] {
  const byText = new Map<string, LabelGroup>()

  for (const topic of topics) {
    for (const raw of topic.labels ?? []) {
      const text = raw.trim()

      if (!text) {
        continue
      }

      const existing = byText.get(text)

      if (existing) {
        existing.topicIds.push(topic.id)
        continue
      }

      byText.set(text, { text, topicIds: [topic.id] })
    }
  }

  return [...byText.values()].sort((a, b) => b.topicIds.length - a.topicIds.length)
}

/**
 * XMind 左栏「标记 & 标签」页：汇总当前画布用到的全部标记与标签，点条目即多选定位。
 *
 * 与 Inspector 的单主题编辑互补——这里是「按标记维度横向看整张画布」的入口，
 * 定位后选区会同步到画布与「主题」页，便于批量改样式或批量移动。
 */
export function MarkerLabelPanel({
  session,
  onSelectedTopicIdsChange,
}: MarkerLabelPanelProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const topics = useMemo(() => collectTopics(activeSheet?.rootTopic), [activeSheet?.rootTopic])
  const markerGroups = useMemo(() => collectMarkerGroups(topics), [topics])
  const labelGroups = useMemo(() => collectLabelGroups(topics), [topics])
  // 路径用于条目 tooltip：只展示第一个主题的路径，避免长列表里塞满文本
  const pathByTopicId = useMemo(() => {
    const map = new Map<string, string>()

    if (!activeSheet) {
      return map
    }

    for (const entry of flattenTopicTree(activeSheet.rootTopic)) {
      map.set(entry.topicId, entry.path.join(' / '))
    }

    return map
  }, [activeSheet])

  function selectTopicIds(topicIds: string[]) {
    if (topicIds.length === 0) {
      return
    }

    onSelectedTopicIdsChange(topicIds)
    void session.selectTopic(topicIds[0])
  }

  const firstPath = (topicIds: string[]) => pathByTopicId.get(topicIds[0]) ?? ''

  return (
    <div className="panel__tab-panel marker-label-panel">
      <div className="panel__section">
        <p className="panel__eyebrow">Markers</p>
        <h3 className="panel__title">标记</h3>
        <p className="panel__muted">
          {markerGroups.length > 0
            ? '点击任一标记，即可选中当前画布中所有带该标记的主题。'
            : '当前画布还没有任何标记。可在右侧检查器里为主题添加标记。'}
        </p>
      </div>

      {markerGroups.length > 0 ? (
        <ul className="marker-label-panel__list">
          {markerGroups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                className="marker-label-panel__item"
                title={firstPath(group.topicIds)}
                onClick={() => selectTopicIds(group.topicIds)}
              >
                <MarkerIcon marker={{ id: group.id }} size={14} />
                <span className="marker-label-panel__text">{group.label}</span>
                <span className="marker-label-panel__count">{group.topicIds.length}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="panel__section">
        <p className="panel__eyebrow">Labels</p>
        <h3 className="panel__title">标签</h3>
        <p className="panel__muted">
          {labelGroups.length > 0
            ? '点击任一标签，即可选中当前画布中所有带该标签的主题。'
            : '当前画布还没有任何标签。可在右侧检查器里为主题添加标签。'}
        </p>
      </div>

      {labelGroups.length > 0 ? (
        <ul className="marker-label-panel__list">
          {labelGroups.map((group) => (
            <li key={group.text}>
              <button
                type="button"
                className="marker-label-panel__item"
                title={firstPath(group.topicIds)}
                onClick={() => selectTopicIds(group.topicIds)}
              >
                <span className="marker-label-panel__swatch" aria-hidden="true" />
                <span className="marker-label-panel__text">{group.text}</span>
                <span className="marker-label-panel__count">{group.topicIds.length}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
