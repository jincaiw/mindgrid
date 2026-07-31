import { useEffect, useMemo, useState } from 'react'
import { findTopicById, flattenTopicTree, normalizeTopicIdsForBatch } from '../../lib/document/tree'
import { getActiveSheet, getSheetById } from '../../lib/document/sheets'
import { DEFAULT_THEME_ID, listThemes } from '../../lib/document/themes'
import type {
  DocumentSnapshot,
  Relationship,
  TopicLink,
  TopicMarker,
  TopicStyleOverrides,
  TopicTask,
  TopicTaskStatus,
} from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { GridIcon, GroupIcon, LinkIcon, TypeIcon } from './icons'

interface DocumentTopicEntry {
  topicId: string
  text: string
  path: string[]
}

/// 将文档所有画布的主题展平，用于关系线起点/终点的跨画布选择。
/// 路径以画布标题开头，便于在跨画布场景下区分同名主题。
function flattenDocumentTopics(sheets: DocumentSnapshot['sheets']): DocumentTopicEntry[] {
  const entries: DocumentTopicEntry[] = []
  for (const sheet of sheets) {
    const sheetEntries = flattenTopicTree(sheet.rootTopic).map((entry) => ({
      topicId: entry.topicId,
      text: entry.text,
      path: [sheet.title, ...entry.path],
    }))
    entries.push(...sheetEntries)
  }
  return entries
}

function resolveTopicText(sheets: DocumentSnapshot['sheets'], topicId: string): string {
  for (const sheet of sheets) {
    const topic = findTopicById(sheet.rootTopic, topicId)
    if (topic) {
      return topic.text
    }
  }
  return topicId
}

/** 将任意颜色值规范化为 `<input type="color">` 所需的 #rrggbb 格式。 */
function toHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  // 解析 rgb()/rgba() 取前三分量
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (match) {
    const r = Number.parseInt(match[1], 10)
    const g = Number.parseInt(match[2], 10)
    const b = Number.parseInt(match[3], 10)
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }
  return fallback
}

/** 从三个 draft 字段构造样式覆盖对象；全空返回 null（清除覆盖）。 */
function buildStyleOverrides(
  fill: string,
  textColor: string,
  borderColor: string,
): TopicStyleOverrides | null {
  const f = fill.trim() || undefined
  const t = textColor.trim() || undefined
  const b = borderColor.trim() || undefined
  if (!f && !t && !b) return null
  return {
    ...(f ? { fill: f } : {}),
    ...(t ? { textColor: t } : {}),
    ...(b ? { borderColor: b } : {}),
  }
}

/** 节点填充色快速预设（一键应用 fill 覆盖）。 */
const FILL_PRESETS = [
  '#5b8cff',
  '#ea580c',
  '#0d9488',
  '#dc2626',
  '#7c3aed',
  '#16a34a',
]

/** Inspector tab 类型：上下文感知面板，参考 XMind 右侧 Inspector tab 结构。 */
type InspectorTab = 'topic' | 'canvas' | 'relationships' | 'grouping'

interface TabConfig {
  id: InspectorTab
  label: string
  icon: typeof TypeIcon
}

const TABS: TabConfig[] = [
  { id: 'topic', label: '主题', icon: TypeIcon },
  { id: 'canvas', label: '画布', icon: GridIcon },
  { id: 'relationships', label: '关系线', icon: LinkIcon },
  { id: 'grouping', label: '分组', icon: GroupIcon },
]

interface InspectorProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
}

export function Inspector({ session, selectedTopicIds }: InspectorProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const activeTopic =
    session.document && session.activeTopicId
      ? findTopicById(activeSheet?.rootTopic ?? session.document.sheets[0].rootTopic, session.activeTopicId)
      : null
  const movableTargetSheets = useMemo(
    () =>
      session.document?.sheets.filter((sheet) => sheet.id !== activeSheet?.id) ?? [],
    [activeSheet?.id, session.document],
  )
  const [moveTargetSheetId, setMoveTargetSheetId] = useState(movableTargetSheets[0]?.id ?? '')
  const targetSheet = session.document ? getSheetById(session.document, moveTargetSheetId) : null
  const movableTargetParents = useMemo(
    () => (targetSheet ? flattenTopicTree(targetSheet.rootTopic) : []),
    [targetSheet],
  )
  const [moveTargetParentId, setMoveTargetParentId] = useState(targetSheet?.rootTopic.id ?? '')
  const moveTargetParentEntry = useMemo(
    () => movableTargetParents.find((entry) => entry.topicId === moveTargetParentId) ?? null,
    [movableTargetParents, moveTargetParentId],
  )
  const normalizedSelectedTopicIds = useMemo(
    () => (activeSheet ? normalizeTopicIdsForBatch(activeSheet.rootTopic, selectedTopicIds) : []),
    [activeSheet, selectedTopicIds],
  )
  const hasMultipleSelectedTopics = normalizedSelectedTopicIds.length > 1

  // —— 关系线 / 边界 / 概要：文档级与画布级数据 ——
  const documentRelationships: Relationship[] = session.document?.relationships ?? []
  const documentTopicEntries = useMemo(
    () => (session.document ? flattenDocumentTopics(session.document.sheets) : []),
    [session.document],
  )
  const sheetBoundaries = activeSheet?.boundaries ?? []
  const sheetSummaries = activeSheet?.summaries ?? []

  // —— 文档主题：列出内置主题，标记当前主题 ——
  const themes = useMemo(() => listThemes(), [])
  const currentThemeId = session.document?.theme?.id ?? DEFAULT_THEME_ID

  // —— Tab 状态：默认主题 tab，选中节点时直接编辑富内容 ——
  const [activeTab, setActiveTab] = useState<InspectorTab>('topic')

  useEffect(() => {
    setMoveTargetSheetId(movableTargetSheets[0]?.id ?? '')
  }, [movableTargetSheets])

  useEffect(() => {
    setMoveTargetParentId(targetSheet?.rootTopic.id ?? '')
  }, [targetSheet?.id, targetSheet?.rootTopic.id])

  // —— 富内容编辑本地态：随选中主题切换同步，失焦时提交 ——
  const [notesDraft, setNotesDraft] = useState(activeTopic?.notes ?? '')
  const [linkUrlDraft, setLinkUrlDraft] = useState(activeTopic?.link?.url ?? '')
  const [linkTitleDraft, setLinkTitleDraft] = useState(activeTopic?.link?.title ?? '')
  const [labelsDraft, setLabelsDraft] = useState((activeTopic?.labels ?? []).join(', '))
  const [markersDraft, setMarkersDraft] = useState(
    (activeTopic?.markers ?? []).map((m) => m.label ?? m.id).join(', '),
  )
  const [styleRefDraft, setStyleRefDraft] = useState(activeTopic?.styleRef ?? '')
  // —— 节点级样式覆盖：fill / textColor / borderColor，失焦提交 ——
  const [fillDraft, setFillDraft] = useState(activeTopic?.styleOverrides?.fill ?? '')
  const [textColorDraft, setTextColorDraft] = useState(activeTopic?.styleOverrides?.textColor ?? '')
  const [borderColorDraft, setBorderColorDraft] = useState(
    activeTopic?.styleOverrides?.borderColor ?? '',
  )
  const [taskStatusDraft, setTaskStatusDraft] = useState<TopicTaskStatus>(
    activeTopic?.task?.status ?? 'none',
  )
  const [taskPriorityDraft, setTaskPriorityDraft] = useState(
    activeTopic?.task?.priority != null ? String(activeTopic.task.priority) : '',
  )
  const [taskDueDateDraft, setTaskDueDateDraft] = useState(
    activeTopic?.task?.dueDateMs != null
      ? new Date(activeTopic.task.dueDateMs).toISOString().slice(0, 10)
      : '',
  )

  // 选中主题变化时同步本地态（用 topic id 作为依赖键）
  const activeTopicKey = activeTopic?.id ?? ''
  useEffect(() => {
    setNotesDraft(activeTopic?.notes ?? '')
    setLinkUrlDraft(activeTopic?.link?.url ?? '')
    setLinkTitleDraft(activeTopic?.link?.title ?? '')
    setLabelsDraft((activeTopic?.labels ?? []).join(', '))
    setMarkersDraft((activeTopic?.markers ?? []).map((m) => m.label ?? m.id).join(', '))
    setStyleRefDraft(activeTopic?.styleRef ?? '')
    setFillDraft(activeTopic?.styleOverrides?.fill ?? '')
    setTextColorDraft(activeTopic?.styleOverrides?.textColor ?? '')
    setBorderColorDraft(activeTopic?.styleOverrides?.borderColor ?? '')
    setTaskStatusDraft(activeTopic?.task?.status ?? 'none')
    setTaskPriorityDraft(
      activeTopic?.task?.priority != null ? String(activeTopic.task.priority) : '',
    )
    setTaskDueDateDraft(
      activeTopic?.task?.dueDateMs != null
        ? new Date(activeTopic.task.dueDateMs).toISOString().slice(0, 10)
        : '',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopicKey, session.document?.revision])

  // —— 关系线创建表单本地态：起点默认跟随活动主题 ——
  const [relFromId, setRelFromId] = useState(activeTopic?.id ?? '')
  const [relToId, setRelToId] = useState('')
  const [relLabel, setRelLabel] = useState('')

  // —— 边界 / 概要创建表单本地态 ——
  const [boundaryLabel, setBoundaryLabel] = useState('')
  const [summaryLabel, setSummaryLabel] = useState('')

  // 活动主题切换时，若起点未设置或失效则回填为活动主题
  useEffect(() => {
    if (activeTopic && (!relFromId || !documentTopicEntries.some((e) => e.topicId === relFromId))) {
      setRelFromId(activeTopic.id)
    }
  }, [activeTopic, documentTopicEntries, relFromId])

  // 文档切换时重置关系线终点与标签
  useEffect(() => {
    setRelToId('')
    setRelLabel('')
    setBoundaryLabel('')
    setSummaryLabel('')
  }, [session.document?.documentId])

  const canCreateRelationship =
    !!relFromId && !!relToId && relFromId !== relToId && !!session.document
  const canCreateBoundaryFromSelection = normalizedSelectedTopicIds.length >= 2
  const canCreateSummaryFromSelection =
    normalizedSelectedTopicIds.length >= 2 && summaryLabel.trim().length > 0

  return (
    <aside className="panel panel--inspector" aria-label="右侧检查器">
      <div className="panel__tabs" role="tablist" aria-label="属性面板分类">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const selected = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`inspector-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`inspector-tabpanel-${tab.id}`}
              className={`panel__tab${selected ? ' panel__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="panel__tab-body">
        {activeTab === 'topic' ? (
          <div
            id="inspector-tabpanel-topic"
            role="tabpanel"
            aria-labelledby="inspector-tab-topic"
            className="panel__tab-panel"
          >
            <div className="panel__section">
              <p className="panel__eyebrow">Topic</p>
              <h3 className="panel__title">主题属性</h3>
              <div className="accordion-card">
                <span>{hasMultipleSelectedTopics ? '当前选择' : '当前主题'}</span>
                <span>
                  {hasMultipleSelectedTopics
                    ? `已选中 ${normalizedSelectedTopicIds.length} 个主题`
                    : activeTopic?.text ?? '未选中'}
                </span>
              </div>
              <div className="accordion-card">
                <span>子主题数</span>
                <span>{activeTopic?.children.length ?? 0}</span>
              </div>
            </div>

            {activeTopic && !hasMultipleSelectedTopics ? (
              <div className="panel__section">
                <p className="panel__eyebrow">Rich Content</p>
                <h3 className="panel__title">富内容编辑</h3>
                <p className="panel__muted">
                  编辑选中主题的备注、链接、标签、标记、任务与样式引用，失焦后自动保存并支持撤销。
                </p>

                <label className="panel__field">
                  <span>备注</span>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    onBlur={() => {
                      const next = notesDraft.trim() || null
                      if ((activeTopic.notes ?? null) !== next) {
                        void session.setTopicNotes(activeTopic.id, next)
                      }
                    }}
                    placeholder="为该主题添加详细备注…"
                  />
                </label>

                <label className="panel__field">
                  <span>链接地址</span>
                  <input
                    type="url"
                    value={linkUrlDraft}
                    onChange={(e) => setLinkUrlDraft(e.target.value)}
                    onBlur={() => {
                      const url = linkUrlDraft.trim()
                      const title = linkTitleDraft.trim()
                      const nextLink: TopicLink | null = url ? { url, ...(title ? { title } : {}) } : null
                      const currentLink = activeTopic.link ?? null
                      const same =
                        currentLink?.url === nextLink?.url && currentLink?.title === nextLink?.title
                      if (!same) {
                        void session.setTopicLink(activeTopic.id, nextLink)
                      }
                    }}
                    placeholder="https://example.com"
                  />
                </label>
                <label className="panel__field">
                  <span>链接标题</span>
                  <input
                    type="text"
                    value={linkTitleDraft}
                    onChange={(e) => setLinkTitleDraft(e.target.value)}
                    onBlur={() => {
                      const url = linkUrlDraft.trim()
                      const title = linkTitleDraft.trim()
                      const nextLink: TopicLink | null = url ? { url, ...(title ? { title } : {}) } : null
                      const currentLink = activeTopic.link ?? null
                      const same =
                        currentLink?.url === nextLink?.url && currentLink?.title === nextLink?.title
                      if (!same) {
                        void session.setTopicLink(activeTopic.id, nextLink)
                      }
                    }}
                    placeholder="可选的链接显示文字"
                  />
                </label>

                <label className="panel__field">
                  <span>标签（逗号分隔）</span>
                  <input
                    type="text"
                    value={labelsDraft}
                    onChange={(e) => setLabelsDraft(e.target.value)}
                    onBlur={() => {
                      const next = labelsDraft
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const current = activeTopic.labels ?? []
                      if (JSON.stringify(current) !== JSON.stringify(next)) {
                        void session.setTopicLabels(activeTopic.id, next)
                      }
                    }}
                    placeholder="重要, 待办, 项目A"
                  />
                </label>

                <label className="panel__field">
                  <span>标记（逗号分隔）</span>
                  <input
                    type="text"
                    value={markersDraft}
                    onChange={(e) => setMarkersDraft(e.target.value)}
                    onBlur={() => {
                      const tokens = markersDraft
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                      const next: TopicMarker[] = tokens.map((token, index) => ({
                        id: `${activeTopic.id}-marker-${index + 1}`,
                        ...(token ? { label: token } : {}),
                      }))
                      const current = activeTopic.markers ?? []
                      const sameLength = current.length === next.length
                      const same =
                        sameLength &&
                        next.every((m, i) => m.label === current[i]?.label)
                      if (!same) {
                        void session.setTopicMarkers(activeTopic.id, next)
                      }
                    }}
                    placeholder="旗帜, 优先级1, 进度50%"
                  />
                </label>

                <label className="panel__field">
                  <span>样式引用</span>
                  <input
                    type="text"
                    value={styleRefDraft}
                    onChange={(e) => setStyleRefDraft(e.target.value)}
                    onBlur={() => {
                      const next = styleRefDraft.trim() || null
                      if ((activeTopic.styleRef ?? null) !== next) {
                        void session.setTopicStyleRef(activeTopic.id, next)
                      }
                    }}
                    placeholder="styles.json 中的样式 ID"
                  />
                </label>

                <div className="panel__field">
                  <span>节点颜色覆盖</span>
                  <div className="panel__field-row">
                    <label className="panel__color-input">
                      <span>填充</span>
                      <input
                        type="color"
                        aria-label="节点填充色"
                        value={toHexColor(fillDraft, '#ffffff')}
                        onChange={(e) => setFillDraft(e.target.value)}
                        onBlur={() => {
                          const next = buildStyleOverrides(fillDraft, textColorDraft, borderColorDraft)
                          if (JSON.stringify(activeTopic.styleOverrides ?? null) !== JSON.stringify(next)) {
                            void session.setTopicStyleOverrides(activeTopic.id, next)
                          }
                        }}
                      />
                    </label>
                    <label className="panel__color-input">
                      <span>文字</span>
                      <input
                        type="color"
                        aria-label="节点文字色"
                        value={toHexColor(textColorDraft, '#0f172a')}
                        onChange={(e) => setTextColorDraft(e.target.value)}
                        onBlur={() => {
                          const next = buildStyleOverrides(fillDraft, textColorDraft, borderColorDraft)
                          if (JSON.stringify(activeTopic.styleOverrides ?? null) !== JSON.stringify(next)) {
                            void session.setTopicStyleOverrides(activeTopic.id, next)
                          }
                        }}
                      />
                    </label>
                    <label className="panel__color-input">
                      <span>边框</span>
                      <input
                        type="color"
                        aria-label="节点边框色"
                        value={toHexColor(borderColorDraft, '#94a3b8')}
                        onChange={(e) => setBorderColorDraft(e.target.value)}
                        onBlur={() => {
                          const next = buildStyleOverrides(fillDraft, textColorDraft, borderColorDraft)
                          if (JSON.stringify(activeTopic.styleOverrides ?? null) !== JSON.stringify(next)) {
                            void session.setTopicStyleOverrides(activeTopic.id, next)
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="panel__chips" role="group" aria-label="填充色快速预设">
                    {FILL_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className="panel__chip panel__chip--color"
                        style={{ background: color }}
                        aria-label={`应用填充色 ${color}`}
                        onClick={() => {
                          const next = buildStyleOverrides(color, textColorDraft, borderColorDraft)
                          void session.setTopicStyleOverrides(activeTopic.id, next)
                        }}
                      />
                    ))}
                  </div>
                  {activeTopic.styleOverrides ? (
                    <button
                      className="panel__action panel__action--ghost"
                      type="button"
                      onClick={() => void session.setTopicStyleOverrides(activeTopic.id, null)}
                    >
                      清除颜色覆盖
                    </button>
                  ) : null}
                </div>

                <div className="panel__field">
                  <span>任务</span>
                  <div className="panel__field-row">
                    <select
                      aria-label="任务状态"
                      value={taskStatusDraft}
                      onChange={(e) => {
                        const nextStatus = e.target.value as TopicTaskStatus
                        setTaskStatusDraft(nextStatus)
                        const priority = taskPriorityDraft
                          ? Number.parseInt(taskPriorityDraft, 10)
                          : undefined
                        const dueDateMs = taskDueDateDraft
                          ? new Date(taskDueDateDraft).getTime()
                          : undefined
                        const nextTask: TopicTask | null =
                          nextStatus === 'none'
                            ? null
                            : { status: nextStatus, ...(priority != null ? { priority } : {}), ...(dueDateMs != null ? { dueDateMs } : {}) }
                        void session.setTopicTask(activeTopic.id, nextTask)
                      }}
                    >
                      <option value="none">无任务</option>
                      <option value="pending">待办</option>
                      <option value="started">进行中</option>
                      <option value="completed">已完成</option>
                    </select>
                    <input
                      type="number"
                      aria-label="任务优先级"
                      min={1}
                      max={5}
                      value={taskPriorityDraft}
                      onChange={(e) => setTaskPriorityDraft(e.target.value)}
                      onBlur={() => {
                        if (taskStatusDraft === 'none') return
                        const priority = taskPriorityDraft
                          ? Number.parseInt(taskPriorityDraft, 10)
                          : undefined
                        const dueDateMs = taskDueDateDraft
                          ? new Date(taskDueDateDraft).getTime()
                          : undefined
                        const currentPriority = activeTopic.task?.priority
                        if (currentPriority !== priority) {
                          const nextTask: TopicTask = {
                            status: taskStatusDraft,
                            ...(priority != null ? { priority } : {}),
                            ...(dueDateMs != null ? { dueDateMs } : {}),
                          }
                          void session.setTopicTask(activeTopic.id, nextTask)
                        }
                      }}
                      placeholder="优先级 1-5"
                    />
                  </div>
                  <input
                    type="date"
                    aria-label="任务截止日期"
                    value={taskDueDateDraft}
                    onChange={(e) => setTaskDueDateDraft(e.target.value)}
                    onBlur={() => {
                      if (taskStatusDraft === 'none') return
                      const priority = taskPriorityDraft
                        ? Number.parseInt(taskPriorityDraft, 10)
                        : undefined
                      const dueDateMs = taskDueDateDraft
                        ? new Date(taskDueDateDraft).getTime()
                        : undefined
                      const currentDue = activeTopic.task?.dueDateMs
                      if (currentDue !== dueDateMs) {
                        const nextTask: TopicTask = {
                          status: taskStatusDraft,
                          ...(priority != null ? { priority } : {}),
                          ...(dueDateMs != null ? { dueDateMs } : {}),
                        }
                        void session.setTopicTask(activeTopic.id, nextTask)
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="panel__muted">
                {hasMultipleSelectedTopics
                  ? '当前为多选状态，富内容编辑不可用。请按 Esc 回到单选后再编辑。'
                  : '在画布或左侧大纲中选中一个主题，即可编辑其备注、链接、标签、任务与样式。'}
              </p>
            )}

            <div className="panel__section">
              <p className="panel__eyebrow">Move</p>
              <h3 className="panel__title">跨画布移动</h3>
              <p className="panel__muted">
                把当前主题分支移动或复制到另一张画布，并可指定目标父主题；完成后会自动切换过去。
              </p>
              <label className="panel__field">
                <span>目标画布</span>
                <select
                  value={moveTargetSheetId}
                  onChange={(event) => setMoveTargetSheetId(event.target.value)}
                  disabled={movableTargetSheets.length === 0}
                >
                  {movableTargetSheets.length === 0 ? (
                    <option value="">当前没有其他画布</option>
                  ) : null}
                  {movableTargetSheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel__field">
                <span>目标父主题</span>
                <select
                  value={moveTargetParentId}
                  onChange={(event) => setMoveTargetParentId(event.target.value)}
                  disabled={!targetSheet}
                >
                  {!targetSheet ? <option value="">请先选择目标画布</option> : null}
                  {movableTargetParents.map((entry) => (
                    <option key={entry.topicId} value={entry.topicId}>
                      {entry.path.join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={
                  hasMultipleSelectedTopics
                    ? normalizedSelectedTopicIds.length === 0
                    : !activeTopic ||
                      !activeSheet ||
                      activeTopic.id === activeSheet.rootTopic.id ||
                      !moveTargetSheetId ||
                      !moveTargetParentId
                }
                onClick={() => {
                  const actionLabel =
                    targetSheet && moveTargetParentEntry
                      ? moveTargetParentEntry.topicId === targetSheet.rootTopic.id
                        ? `${hasMultipleSelectedTopics ? `批量移动 ${normalizedSelectedTopicIds.length} 个主题` : '移动主题'}到画布“${targetSheet.title}”根主题`
                        : `${hasMultipleSelectedTopics ? `批量移动 ${normalizedSelectedTopicIds.length} 个主题` : '移动主题'}到画布“${targetSheet.title}”的“${moveTargetParentEntry.path.join(' / ')}”下面`
                      : hasMultipleSelectedTopics
                        ? '批量移动主题到其他画布'
                        : '移动主题到其他画布'

                  if (hasMultipleSelectedTopics) {
                    void session.moveTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      actionLabel,
                    )
                    return
                  }

                  if (!activeTopic) {
                    return
                  }

                  void session.moveTopicToSheet(
                    activeTopic.id,
                    moveTargetSheetId,
                    moveTargetParentId,
                    actionLabel,
                  )
                }}
              >
                {hasMultipleSelectedTopics ? '批量移动到目标画布' : '移动到目标画布'}
              </button>
              <button
                className="panel__action"
                type="button"
                disabled={
                  hasMultipleSelectedTopics
                    ? normalizedSelectedTopicIds.length === 0
                    : !activeTopic ||
                      !activeSheet ||
                      activeTopic.id === activeSheet.rootTopic.id ||
                      !moveTargetSheetId ||
                      !moveTargetParentId
                }
                onClick={() => {
                  const actionLabel =
                    targetSheet && moveTargetParentEntry
                      ? moveTargetParentEntry.topicId === targetSheet.rootTopic.id
                        ? `${hasMultipleSelectedTopics ? `批量复制 ${normalizedSelectedTopicIds.length} 个主题` : '复制主题'}到画布“${targetSheet.title}”根主题`
                        : `${hasMultipleSelectedTopics ? `批量复制 ${normalizedSelectedTopicIds.length} 个主题` : '复制主题'}到画布“${targetSheet.title}”的“${moveTargetParentEntry.path.join(' / ')}”下面`
                      : hasMultipleSelectedTopics
                        ? '批量复制主题到其他画布'
                        : '复制主题到其他画布'

                  if (hasMultipleSelectedTopics) {
                    void session.copyTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      actionLabel,
                    )
                    return
                  }

                  if (!activeTopic) {
                    return
                  }

                  void session.copyTopicToSheet(
                    activeTopic.id,
                    moveTargetSheetId,
                    moveTargetParentId,
                    actionLabel,
                  )
                }}
              >
                {hasMultipleSelectedTopics ? '批量复制到目标画布' : '复制到目标画布'}
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'canvas' ? (
          <div
            id="inspector-tabpanel-canvas"
            role="tabpanel"
            aria-labelledby="inspector-tab-canvas"
            className="panel__tab-panel"
          >
            <div className="panel__section">
              <p className="panel__eyebrow">Canvas</p>
              <h3 className="panel__title">画布信息</h3>
              <div className="accordion-card">
                <span>当前画布</span>
                <span>{activeSheet?.title ?? '未命名画布'}</span>
              </div>
              <div className="accordion-card">
                <span>历史能力</span>
                <span>
                  {session.canUndo ? '可撤销' : '无撤销'}
                  {' / '}
                  {session.canRedo ? '可重做' : '无重做'}
                </span>
              </div>
            </div>

            <div className="panel__section">
              <p className="panel__eyebrow">Theme</p>
              <h3 className="panel__title">文档主题</h3>
              <p className="panel__muted">
                一键切换整篇文档的配色方案。节点级颜色覆盖会优先生效。
              </p>
              <div className="panel__theme-grid" role="radiogroup" aria-label="文档主题">
                {themes.map((theme) => {
                  const selected = theme.id === currentThemeId
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`panel__theme-swatch${selected ? ' panel__theme-swatch--active' : ''}`}
                      title={theme.name}
                      onClick={() => void session.setDocumentTheme(theme.id)}
                    >
                      <span
                        className="panel__theme-swatch-color"
                        style={{ background: theme.root.fill }}
                      />
                      <span
                        className="panel__theme-swatch-color panel__theme-swatch-color--branch"
                        style={{ background: theme.branch.fill }}
                      />
                      <span className="panel__theme-swatch-name">{theme.name}</span>
                    </button>
                  )
                })}
              </div>
              {currentThemeId !== DEFAULT_THEME_ID ? (
                <button
                  className="panel__action panel__action--ghost"
                  type="button"
                  onClick={() => void session.setDocumentTheme(null)}
                >
                  恢复默认主题
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'relationships' ? (
          <div
            id="inspector-tabpanel-relationships"
            role="tabpanel"
            aria-labelledby="inspector-tab-relationships"
            className="panel__tab-panel"
          >
            <div className="panel__section">
              <p className="panel__eyebrow">Relationships</p>
              <h3 className="panel__title">关系线</h3>
              <p className="panel__muted">
                在任意两个主题之间建立非父子连接，用于表达跨分支或跨画布的关联。关系线保存在文档级别。
              </p>

              {documentRelationships.length > 0 ? (
                <ul className="panel__entries">
                  {documentRelationships.map((rel) => {
                    const fromText = session.document
                      ? resolveTopicText(session.document.sheets, rel.fromTopicId)
                      : rel.fromTopicId
                    const toText = session.document
                      ? resolveTopicText(session.document.sheets, rel.toTopicId)
                      : rel.toTopicId
                    return (
                      <li key={rel.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {fromText} → {toText}
                          {rel.label ? `（${rel.label}）` : ''}
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() => void session.deleteRelationship(rel.id)}
                        >
                          删除
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="panel__muted">暂无关系线</p>
              )}

              <label className="panel__field">
                <span>起点主题</span>
                <select value={relFromId} onChange={(e) => setRelFromId(e.target.value)}>
                  {documentTopicEntries.length === 0 ? <option value="">暂无主题</option> : null}
                  {documentTopicEntries.map((entry) => (
                    <option key={entry.topicId} value={entry.topicId}>
                      {entry.path.join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="panel__field">
                <span>终点主题</span>
                <select value={relToId} onChange={(e) => setRelToId(e.target.value)}>
                  <option value="">请选择终点主题</option>
                  {documentTopicEntries
                    .filter((entry) => entry.topicId !== relFromId)
                    .map((entry) => (
                      <option key={entry.topicId} value={entry.topicId}>
                        {entry.path.join(' / ')}
                      </option>
                    ))}
                </select>
              </label>
              <label className="panel__field">
                <span>标签（可选）</span>
                <input
                  type="text"
                  value={relLabel}
                  onChange={(e) => setRelLabel(e.target.value)}
                  placeholder="例如：依赖、关联、引用"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateRelationship}
                onClick={() => {
                  const label = relLabel.trim() || null
                  void session.createRelationship(relFromId, relToId, label)
                  setRelToId('')
                  setRelLabel('')
                }}
              >
                创建关系线
              </button>
            </div>
          </div>
        ) : null}

        {activeTab === 'grouping' ? (
          <div
            id="inspector-tabpanel-grouping"
            role="tabpanel"
            aria-labelledby="inspector-tab-grouping"
            className="panel__tab-panel"
          >
            <div className="panel__section">
              <p className="panel__eyebrow">Grouping</p>
              <h3 className="panel__title">边界与概要</h3>
              <p className="panel__muted">
                为当前画布中的若干主题添加视觉分组（边界）或归纳说明（概要）。先在画布上选中至少 2 个主题，再创建。
              </p>

              {sheetBoundaries.length > 0 ? (
                <>
                  <p className="panel__eyebrow">边界</p>
                  <ul className="panel__entries">
                    {sheetBoundaries.map((boundary) => (
                      <li key={boundary.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {boundary.label || '未命名边界'}（{boundary.topicIds.length} 个主题）
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() =>
                            activeSheet && void session.deleteBoundary(activeSheet.id, boundary.id)
                          }
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {sheetSummaries.length > 0 ? (
                <>
                  <p className="panel__eyebrow">概要</p>
                  <ul className="panel__entries">
                    {sheetSummaries.map((summary) => (
                      <li key={summary.id} className="panel__entry">
                        <span className="panel__entry-text">
                          {summary.label}（{summary.topicIds.length} 个主题）
                        </span>
                        <button
                          className="panel__action panel__action--ghost"
                          type="button"
                          onClick={() =>
                            activeSheet && void session.deleteSummary(activeSheet.id, summary.id)
                          }
                        >
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              <label className="panel__field">
                <span>边界标签（可选）</span>
                <input
                  type="text"
                  value={boundaryLabel}
                  onChange={(e) => setBoundaryLabel(e.target.value)}
                  placeholder="例如：核心模块、风险项"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateBoundaryFromSelection || !activeSheet}
                onClick={() => {
                  if (!activeSheet) return
                  const label = boundaryLabel.trim() || null
                  void session.createBoundary(activeSheet.id, normalizedSelectedTopicIds, label)
                  setBoundaryLabel('')
                }}
              >
                {normalizedSelectedTopicIds.length >= 2
                  ? `为选中的 ${normalizedSelectedTopicIds.length} 个主题创建边界`
                  : '请先选中至少 2 个主题'}
              </button>

              <label className="panel__field">
                <span>概要标签</span>
                <input
                  type="text"
                  value={summaryLabel}
                  onChange={(e) => setSummaryLabel(e.target.value)}
                  placeholder="对这组主题的归纳说明"
                />
              </label>
              <button
                className="panel__action"
                type="button"
                disabled={!canCreateSummaryFromSelection || !activeSheet}
                onClick={() => {
                  if (!activeSheet) return
                  const label = summaryLabel.trim()
                  if (!label) return
                  void session.createSummary(activeSheet.id, normalizedSelectedTopicIds, label)
                  setSummaryLabel('')
                }}
              >
                {normalizedSelectedTopicIds.length >= 2
                  ? `为选中的 ${normalizedSelectedTopicIds.length} 个主题创建概要`
                  : '请先选中至少 2 个主题'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {session.repairReport ? (
        <div className="panel__section panel__section--repair">
          <p className="panel__eyebrow">Repair</p>
          <h3 className="panel__title">最近修复</h3>
          <p className="panel__muted">
            已从修复副本打开当前文档，下面是本次自动修复的摘要。
          </p>
          <div className="accordion-card">
            <span>来源文件</span>
            <span>{session.repairReport.sourcePath.split(/[\\/]/).pop()}</span>
          </div>
          <div className="accordion-card">
            <span>修复副本</span>
            <span>{session.repairReport.destinationPath.split(/[\\/]/).pop()}</span>
          </div>
          <ul className="panel__list">
            {session.repairReport.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            className="panel__action"
            type="button"
            onClick={() => void session.clearRepairReport()}
          >
            已了解，收起摘要
          </button>
        </div>
      ) : null}
    </aside>
  )
}
