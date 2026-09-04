import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canReparentTopic,
  findAncestorTopicIds,
  findParentTopicByChildId,
  findTopicById,
  flattenTopicTree,
  getBatchReparentTopicValidation,
  getReparentTopicValidation,
  normalizeTopicIdsForBatch,
} from '../../lib/document/tree'
import { getActiveSheet, getSheetById } from '../../lib/document/sheets'
import type { ChartType } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { TopicTreeNode } from './topic-tree'

interface SidebarProps {
  session: DocumentSession
  selectedTopicIds: string[]
  onSelectedTopicIdsChange: (topicIds: string[]) => void
}

/** 图表类型选项，value 与 ChartType 序列化形式一致。 */
const CHART_TYPE_OPTIONS: ReadonlyArray<{ value: ChartType; label: string }> = [
  { value: 'mindmap', label: '思维导图（Mind Map）' },
  { value: 'logic', label: '逻辑图（Logic）' },
  { value: 'tree', label: '树状图（Tree）' },
  { value: 'org', label: '组织结构图（Org）' },
  { value: 'fishbone', label: '鱼骨图（Fishbone）' },
  { value: 'timeline', label: '时间线（Timeline）' },
  { value: 'brace', label: '括号图（Brace）' },
  { value: 'matrix', label: '矩阵图（Matrix）' },
  { value: 'bubble', label: '气泡图（Bubble）' },
]

const DRAG_AUTO_EXPAND_DELAY_MS = 450
const DROP_SUCCESS_HIGHLIGHT_MS = 1600
const HISTORY_FOCUS_HIGHLIGHT_MS = 1600

function resolveRedoSheetTarget(
  recentAction: string,
  document: DocumentSession['document'],
) {
  if (!document || !recentAction.startsWith('已重做 ')) {
    return null
  }

  const rootTargetMatch = recentAction.match(/到画布“([^”]+)”根主题/)

  if (rootTargetMatch) {
    const sheet = document.sheets.find((entry) => entry.title === rootTargetMatch[1])

    if (!sheet) {
      return null
    }

    return {
      sheetId: sheet.id,
      parentTopicId: sheet.rootTopic.id,
    }
  }

  const parentTargetMatch = recentAction.match(/到画布“([^”]+)”的“([^”]+)”下面/)

  if (!parentTargetMatch) {
    return null
  }

  const [, sheetTitle, parentPathLabel] = parentTargetMatch
  const sheet = document.sheets.find((entry) => entry.title === sheetTitle)

  if (!sheet) {
    return null
  }

  const targetEntry = flattenTopicTree(sheet.rootTopic).find(
    (entry) => entry.path.join(' / ') === parentPathLabel,
  )

  if (!targetEntry) {
    return null
  }

  return {
    sheetId: sheet.id,
    parentTopicId: targetEntry.topicId,
  }
}

function resolveRedoTopicTarget(
  recentAction: string,
  activeSheet: ReturnType<typeof getActiveSheet> | null,
) {
  if (!activeSheet || !recentAction.startsWith('已重做 ')) {
    return null
  }

  const pathTargetMatch = recentAction.match(/到“([^”]+)”下面/)

  if (!pathTargetMatch) {
    return null
  }

  const targetLabel = pathTargetMatch[1]
  const entries = flattenTopicTree(activeSheet.rootTopic)

  if (targetLabel.includes(' / ')) {
    return entries.find((entry) => entry.path.join(' / ') === targetLabel)?.topicId ?? null
  }

  const sameTextEntries = entries.filter((entry) => entry.text === targetLabel)

  return sameTextEntries.length === 1 ? sameTextEntries[0].topicId : null
}

export function Sidebar({
  session,
  selectedTopicIds,
  onSelectedTopicIdsChange,
}: SidebarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const activeSheet = useMemo(
    () => (session.document ? getActiveSheet(session.document) : null),
    [session.document],
  )
  // 画布管理默认折叠：Tab 化后大纲树是「主题」页的主体，画布增删改名属低频操作，
  // 且底部状态条的画布标签栏已覆盖新建/重命名/删除/排序（见 SheetTabBar）。
  const [sheetManagerOpen, setSheetManagerOpen] = useState(false)
  const [sheetTitleDraft, setSheetTitleDraft] = useState(activeSheet?.title ?? '')
  const [topicTitleDraft, setTopicTitleDraft] = useState('')
  const movableTargetSheets = useMemo(
    () => session.document?.sheets.filter((sheet) => sheet.id !== activeSheet?.id) ?? [],
    [activeSheet?.id, session.document],
  )
  const [moveTargetSheetId, setMoveTargetSheetId] = useState(movableTargetSheets[0]?.id ?? '')
  const [draggingTopicId, setDraggingTopicId] = useState<string | null>(null)
  const [dropTargetTopicId, setDropTargetTopicId] = useState<string | null>(null)
  const [dropTargetSheetId, setDropTargetSheetId] = useState<string | null>(null)
  const [dropTargetSheetParentId, setDropTargetSheetParentId] = useState<string | null>(null)
  const [invalidDropTopicId, setInvalidDropTopicId] = useState<string | null>(null)
  const [invalidDropSheetId, setInvalidDropSheetId] = useState<string | null>(null)
  const [invalidDragHint, setInvalidDragHint] = useState<string | null>(null)
  const autoExpandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoExpandTopicIdRef = useRef<string | null>(null)
  const dropSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recentDropTopicId, setRecentDropTopicId] = useState<string | null>(null)
  const [recentDropSheetId, setRecentDropSheetId] = useState<string | null>(null)
  const [recentDropSheetParentId, setRecentDropSheetParentId] = useState<string | null>(null)
  const historyFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [historyFocusTopicId, setHistoryFocusTopicId] = useState<string | null>(null)
  const activeSheetTopicCount = useMemo(
    () => (activeSheet ? flattenTopicTree(activeSheet.rootTopic).length : 0),
    [activeSheet],
  )
  const activeTopic = useMemo(
    () =>
      activeSheet && session.activeTopicId
        ? findTopicById(activeSheet.rootTopic, session.activeTopicId)
        : null,
    [activeSheet, session.activeTopicId],
  )
  const normalizedSelectedTopicIds = useMemo(
    () => (activeSheet ? normalizeTopicIdsForBatch(activeSheet.rootTopic, selectedTopicIds) : []),
    [activeSheet, selectedTopicIds],
  )
  const hasMultipleSelectedTopics = normalizedSelectedTopicIds.length > 1
  const selectedTopicSummary = useMemo(
    () => {
      if (!activeSheet) {
        return []
      }

      return normalizedSelectedTopicIds
        .map((topicId) => findTopicById(activeSheet.rootTopic, topicId))
        .filter((topic): topic is NonNullable<typeof topic> => !!topic)
        .map((topic) => topic.text)
    },
    [activeSheet, normalizedSelectedTopicIds],
  )
  const selectionLabel = hasMultipleSelectedTopics
    ? `已选中 ${normalizedSelectedTopicIds.length} 个主题`
    : activeTopic?.text ?? '未选中主题'
  const selectionDescription = hasMultipleSelectedTopics
    ? `当前批量整理范围：${selectedTopicSummary.slice(0, 3).join('、')}${selectedTopicSummary.length > 3 ? ` 等 ${selectedTopicSummary.length} 个主题` : ''}。`
    : activeTopic
      ? '可以直接在边栏里重命名、补充结构、调整顺序，也能继续整理到其他画布。'
      : '先从大纲中选中一个主题，再继续结构编辑。'
  const draggingTopic = useMemo(
    () =>
      activeSheet && draggingTopicId ? findTopicById(activeSheet.rootTopic, draggingTopicId) : null,
    [activeSheet, draggingTopicId],
  )
  const dropTargetTopic = useMemo(
    () =>
      activeSheet && dropTargetTopicId ? findTopicById(activeSheet.rootTopic, dropTargetTopicId) : null,
    [activeSheet, dropTargetTopicId],
  )
  const dropTargetSheet = useMemo(
    () => (session.document && dropTargetSheetId ? getSheetById(session.document, dropTargetSheetId) : null),
    [dropTargetSheetId, session.document],
  )
  const sheetDropParentEntriesById = useMemo(
    () =>
      Object.fromEntries(
        (session.document?.sheets ?? []).map((sheet) => [sheet.id, flattenTopicTree(sheet.rootTopic)]),
      ),
    [session.document],
  )
  const dropTargetSheetParentEntry = useMemo(() => {
    if (!dropTargetSheet || !dropTargetSheetParentId) {
      return null
    }

    return (
      sheetDropParentEntriesById[dropTargetSheet.id]?.find(
        (entry) => entry.topicId === dropTargetSheetParentId,
      ) ?? null
    )
  }, [dropTargetSheet, dropTargetSheetParentId, sheetDropParentEntriesById])
  const redoSheetTarget = useMemo(
    () => resolveRedoSheetTarget(session.recentAction, session.document),
    [session.document, session.recentAction],
  )
  const redoTopicTargetId = useMemo(
    () => resolveRedoTopicTarget(session.recentAction, activeSheet),
    [activeSheet, session.recentAction],
  )
  const activeTopicParentMatch = useMemo(
    () =>
      activeSheet && activeTopic
        ? findParentTopicByChildId(activeSheet.rootTopic, activeTopic.id)
        : null,
    [activeSheet, activeTopic],
  )
  const canMoveTopicUp = !!activeTopicParentMatch && activeTopicParentMatch.index > 0
  const canMoveTopicDown =
    !!activeTopicParentMatch &&
    activeTopicParentMatch.index < activeTopicParentMatch.parent.children.length - 1
  const reparentTargetParents = useMemo(() => {
    if (!activeSheet) {
      return []
    }

    if (hasMultipleSelectedTopics) {
      return flattenTopicTree(activeSheet.rootTopic).filter((entry) => {
        if (normalizedSelectedTopicIds.includes(entry.topicId)) {
          return false
        }

        return !normalizedSelectedTopicIds.some((topicId) => {
          const selectedTopic = findTopicById(activeSheet.rootTopic, topicId)
          return selectedTopic ? !!findTopicById(selectedTopic, entry.topicId) : false
        })
      })
    }

    if (!activeTopic || !activeTopicParentMatch) {
      return []
    }

    return flattenTopicTree(activeSheet.rootTopic).filter((entry) => {
      if (entry.topicId === activeTopicParentMatch.parent.id) {
        return false
      }

      const ancestorTopicIds = findAncestorTopicIds(activeSheet.rootTopic, entry.topicId) ?? []

      return (
        entry.topicId !== activeTopic.id &&
        !ancestorTopicIds.includes(activeTopic.id)
      )
    })
  }, [activeSheet, activeTopic, activeTopicParentMatch, hasMultipleSelectedTopics, normalizedSelectedTopicIds])
  const [reparentTargetParentId, setReparentTargetParentId] = useState(reparentTargetParents[0]?.topicId ?? '')
  const reparentTargetParentEntry = useMemo(
    () => reparentTargetParents.find((entry) => entry.topicId === reparentTargetParentId) ?? null,
    [reparentTargetParentId, reparentTargetParents],
  )
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
  const canRenameTopic =
    !hasMultipleSelectedTopics &&
    !!activeTopic &&
    !!topicTitleDraft.trim() &&
    topicTitleDraft.trim() !== activeTopic.text
  const batchReparentValidation = useMemo(
    () =>
      activeSheet && reparentTargetParentId
        ? getBatchReparentTopicValidation(activeSheet.rootTopic, selectedTopicIds, reparentTargetParentId)
        : {
            isValid: false,
            reason: null,
            normalizedTopicIds: [],
          },
    [activeSheet, reparentTargetParentId, selectedTopicIds],
  )
  const canReparentTopicInSheet = hasMultipleSelectedTopics
    ? !!activeSheet &&
      !!reparentTargetParentId &&
      !!reparentTargetParentEntry &&
      batchReparentValidation.isValid
    : !!activeTopic &&
      !!activeSheet &&
      activeTopic.id !== activeSheet.rootTopic.id &&
      !!reparentTargetParentId
  const canOrganizeAcrossSheets =
    hasMultipleSelectedTopics
      ? normalizedSelectedTopicIds.length > 0 &&
        !!moveTargetSheetId &&
        !!moveTargetParentId
      : !!activeTopic &&
        !!activeSheet &&
        activeTopic.id !== activeSheet.rootTopic.id &&
        !!moveTargetSheetId &&
        !!moveTargetParentId
  const getSheetTargetActionLabel = useCallback(
    (sheetTitle: string, parentEntry: typeof moveTargetParentEntry, prefix: string) => {
      if (!parentEntry) {
        return prefix
      }

      if (targetSheet && parentEntry.topicId === targetSheet.rootTopic.id) {
        return `${prefix}到画布“${sheetTitle}”根主题`
      }

      return `${prefix}到画布“${sheetTitle}”的“${parentEntry.path.join(' / ')}”下面`
    },
    [targetSheet],
  )
  const handleSelectTopic = useCallback(
    (topicId: string, options?: { toggle?: boolean }) => {
      const nextSelectedTopicIds = (() => {
        if (!options?.toggle) {
          return [topicId]
        }

        const nextSelection = new Set(selectedTopicIds)

        if (nextSelection.has(topicId)) {
          nextSelection.delete(topicId)
        } else {
          nextSelection.add(topicId)
        }

        return nextSelection.size > 0 ? [...nextSelection] : [topicId]
      })()

      onSelectedTopicIdsChange(nextSelectedTopicIds)
      void session.selectTopic(topicId)
    },
    [onSelectedTopicIdsChange, selectedTopicIds, session],
  )
  const canDragTopic = useCallback(
    (topicId: string) => !!activeSheet && topicId !== activeSheet.rootTopic.id,
    [activeSheet],
  )
  const canDropDraggedTopicOnTarget = useCallback(
    (targetTopicId: string) => {
      if (!activeSheet || !draggingTopicId) {
        return false
      }

      const draggingParentMatch = findParentTopicByChildId(activeSheet.rootTopic, draggingTopicId)

      if (draggingParentMatch?.parent.id === targetTopicId) {
        return false
      }

      return canReparentTopic(activeSheet.rootTopic, draggingTopicId, targetTopicId)
    },
    [activeSheet, draggingTopicId],
  )
  const getInvalidTopicDropReason = useCallback(
    (targetTopicId: string) => {
      if (!activeSheet || !draggingTopicId) {
        return null
      }

      const draggingParentMatch = findParentTopicByChildId(activeSheet.rootTopic, draggingTopicId)

      if (draggingParentMatch?.parent.id === targetTopicId) {
        return '当前主题已经在这个父主题下面了。'
      }

      const validation = getReparentTopicValidation(
        activeSheet.rootTopic,
        draggingTopicId,
        targetTopicId,
      )

      return validation.reason
    },
    [activeSheet, draggingTopicId],
  )
  const canDropDraggedTopicOnSheet = useCallback(
    (targetSheetId: string) => {
      if (!draggingTopicId || !activeSheet) {
        return false
      }

      return targetSheetId !== activeSheet.id
    },
    [activeSheet, draggingTopicId],
  )
  const getInvalidSheetDropReason = useCallback(
    (targetSheetId: string) => {
      if (!draggingTopicId || !activeSheet) {
        return null
      }

      if (targetSheetId === activeSheet.id) {
        return '当前主题已经在这张画布里了。'
      }

      return null
    },
    [activeSheet, draggingTopicId],
  )
  const dragHint = useMemo(() => {
    if (!draggingTopic) {
      return null
    }

    if (invalidDragHint) {
      return invalidDragHint
    }

    if (dropTargetTopic) {
      return `正在移动“${draggingTopic.text}”，释放后会成为“${dropTargetTopic.text}”的子主题。`
    }

    if (dropTargetSheet) {
      if (
        dropTargetSheetParentEntry &&
        dropTargetSheetParentEntry.topicId !== dropTargetSheet.rootTopic.id
      ) {
        return `正在移动“${draggingTopic.text}”，释放后会进入画布“${dropTargetSheet.title}”的“${dropTargetSheetParentEntry.path.join(' / ')}”下面。`
      }

      return `正在移动“${draggingTopic.text}”，释放后会进入画布“${dropTargetSheet.title}”的根主题。`
    }

    return `正在拖拽“${draggingTopic.text}”。可以把它放到当前画布的其他主题下，或直接拖到左侧目标画布里。`
  }, [draggingTopic, dropTargetSheet, dropTargetSheetParentEntry, dropTargetTopic, invalidDragHint])
  const clearPendingAutoExpand = useCallback(() => {
    if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current)
      autoExpandTimeoutRef.current = null
    }

    autoExpandTopicIdRef.current = null
  }, [])
  const clearDropSuccessHighlight = useCallback(() => {
    if (dropSuccessTimeoutRef.current) {
      clearTimeout(dropSuccessTimeoutRef.current)
      dropSuccessTimeoutRef.current = null
    }

    setRecentDropTopicId(null)
    setRecentDropSheetId(null)
    setRecentDropSheetParentId(null)
  }, [])
  const clearHistoryFocusHighlight = useCallback(() => {
    if (historyFocusTimeoutRef.current) {
      clearTimeout(historyFocusTimeoutRef.current)
      historyFocusTimeoutRef.current = null
    }

    setHistoryFocusTopicId(null)
  }, [])
  const markDropSuccessHighlight = useCallback(
    (topicId: string | null, sheetId: string | null, sheetParentId: string | null) => {
      clearDropSuccessHighlight()
      setRecentDropTopicId(topicId)
      setRecentDropSheetId(sheetId)
      setRecentDropSheetParentId(sheetParentId)
      // 跨画布落点的成功高亮渲染在底部「画布管理」折叠区里。若动作由大纲区的
      // 「移动到其他画布」按钮触发（而不是在画布列表上拖拽），该区默认折叠，
      // 高亮就看不见了 —— 记到跨画布落点时自动展开。
      if (sheetId) {
        setSheetManagerOpen(true)
      }
      dropSuccessTimeoutRef.current = setTimeout(() => {
        dropSuccessTimeoutRef.current = null
        setRecentDropTopicId(null)
        setRecentDropSheetId(null)
        setRecentDropSheetParentId(null)
      }, DROP_SUCCESS_HIGHLIGHT_MS)
    },
    [clearDropSuccessHighlight],
  )
  const markHistoryFocusHighlight = useCallback(
    (topicId: string | null) => {
      clearHistoryFocusHighlight()

      if (!topicId) {
        return
      }

      setHistoryFocusTopicId(topicId)
      historyFocusTimeoutRef.current = setTimeout(() => {
        historyFocusTimeoutRef.current = null
        setHistoryFocusTopicId(null)
      }, HISTORY_FOCUS_HIGHLIGHT_MS)
    },
    [clearHistoryFocusHighlight],
  )
  const scheduleAutoExpandTopic = useCallback(
    (topicId: string) => {
      if (!activeSheet) {
        return
      }

      const targetTopic = findTopicById(activeSheet.rootTopic, topicId)

      if (!targetTopic || !targetTopic.collapsed || targetTopic.children.length === 0) {
        clearPendingAutoExpand()
        return
      }

      if (autoExpandTopicIdRef.current === topicId) {
        return
      }

      clearPendingAutoExpand()
      autoExpandTopicIdRef.current = topicId
      autoExpandTimeoutRef.current = setTimeout(() => {
        autoExpandTimeoutRef.current = null

        if (autoExpandTopicIdRef.current !== topicId) {
          return
        }

        autoExpandTopicIdRef.current = null
        void session.toggleTopicCollapsed(topicId)
      }, DRAG_AUTO_EXPAND_DELAY_MS)
    },
    [activeSheet, clearPendingAutoExpand, session],
  )

  useEffect(() => {
    setSheetTitleDraft(activeSheet?.title ?? '')
  }, [activeSheet?.id, activeSheet?.title])

  useEffect(() => {
    setTopicTitleDraft(activeTopic?.text ?? '')
  }, [activeTopic?.id, activeTopic?.text])

  useEffect(() => {
    setReparentTargetParentId(reparentTargetParents[0]?.topicId ?? '')
  }, [reparentTargetParents])

  useEffect(() => {
    setMoveTargetSheetId(movableTargetSheets[0]?.id ?? '')
  }, [movableTargetSheets])

  useEffect(() => {
    setMoveTargetParentId(targetSheet?.rootTopic.id ?? '')
  }, [targetSheet?.id, targetSheet?.rootTopic.id])

  useEffect(() => {
    setDraggingTopicId(null)
    setDropTargetTopicId(null)
    setDropTargetSheetId(null)
    setDropTargetSheetParentId(null)
    setInvalidDropTopicId(null)
    setInvalidDropSheetId(null)
    setInvalidDragHint(null)
    clearPendingAutoExpand()
  }, [activeSheet?.id, clearPendingAutoExpand, session.document?.revision])

  useEffect(() => clearPendingAutoExpand, [clearPendingAutoExpand])
  useEffect(() => clearDropSuccessHighlight, [clearDropSuccessHighlight])
  useEffect(() => clearHistoryFocusHighlight, [clearHistoryFocusHighlight])
  useEffect(() => {
    if (
      !activeSheet ||
      !session.activeTopicId ||
      (session.recentAction !== `已撤销 ${session.nextRedoAction ?? ''}` &&
        session.recentAction !== `已重做 ${session.nextUndoAction ?? ''}` &&
        !session.recentAction.startsWith('已撤销 ') &&
        !session.recentAction.startsWith('已重做 '))
    ) {
      return
    }

    markHistoryFocusHighlight(session.activeTopicId)
  }, [
    activeSheet,
    markHistoryFocusHighlight,
    session.activeTopicId,
    session.nextRedoAction,
    session.nextUndoAction,
    session.recentAction,
  ])
  useEffect(() => {
    if (!redoSheetTarget) {
      return
    }

    markDropSuccessHighlight(
      redoSheetTarget.parentTopicId,
      redoSheetTarget.sheetId,
      redoSheetTarget.parentTopicId,
    )
  }, [markDropSuccessHighlight, redoSheetTarget])
  useEffect(() => {
    if (!redoTopicTargetId) {
      return
    }

    markDropSuccessHighlight(redoTopicTargetId, null, null)
  }, [markDropSuccessHighlight, redoTopicTargetId])
  useEffect(() => {
    if (!rootRef.current) {
      return
    }

    let targetElement: HTMLElement | null = null

    if (recentDropTopicId && !recentDropSheetId) {
      targetElement = rootRef.current.querySelector<HTMLElement>(
        `[data-topic-id="${recentDropTopicId}"]`,
      )
    } else if (recentDropSheetId && recentDropSheetParentId) {
      targetElement =
        rootRef.current.querySelector<HTMLElement>(
          `[data-drop-sheet-id="${recentDropSheetId}"][data-drop-parent-id="${recentDropSheetParentId}"]`,
        ) ??
        rootRef.current.querySelector<HTMLElement>(`[data-sheet-id="${recentDropSheetId}"]`)
    }

    targetElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
    // sheetManagerOpen 需入依赖：跨画布高亮触发的自动展开发生在同一批次里，
    // 折叠状态下 DOM 里没有落点元素，展开后要再跑一次才能真正滚动过去
  }, [recentDropSheetId, recentDropSheetParentId, recentDropTopicId, sheetManagerOpen])
  useEffect(() => {
    if (!rootRef.current || !historyFocusTopicId) {
      return
    }

    const targetElement = rootRef.current.querySelector<HTMLElement>(
      `[data-topic-id="${historyFocusTopicId}"]`,
    )

    targetElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [historyFocusTopicId])

  return (
    <div className="sidebar-outline" ref={rootRef}>
      <div className="outline-card">
        <span className="outline-card__badge">主文档</span>
        <strong>{session.summary?.rootTopicText ?? '当前工作区'}</strong>
        <p>
          {session.summary
            ? `当前画布共 ${session.summary.topicCount} 个主题，文档内共有 ${session.summary.sheetCount} 张画布。`
            : '正在连接当前工作区。'}
        </p>
      </div>


      <div className="panel__section">
        <p className="panel__eyebrow">Outline</p>
        <h3 className="panel__title">当前画布大纲</h3>
        <p className="panel__muted">
          {activeSheet
            ? `当前画布共有 ${activeSheetTopicCount} 个主题，可直接在这里切换选中与折叠状态。`
            : '当前还没有可浏览的画布大纲。'}
        </p>
        {dragHint ? (
          <div
            className={`drag-hint${invalidDragHint ? ' drag-hint--invalid' : ''}`}
            role="status"
            aria-live="polite"
          >
            <span className="drag-hint__badge">拖拽中</span>
            <p>{dragHint}</p>
          </div>
        ) : null}
        <div className="outline-card">
          <span className="outline-card__badge">{hasMultipleSelectedTopics ? '当前选择' : '当前主题'}</span>
          <strong>{selectionLabel}</strong>
          <p>{selectionDescription}</p>
          <label className="panel__field">
            <span>主题名称</span>
            <input
              type="text"
              value={topicTitleDraft}
              onChange={(event) => setTopicTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && activeTopic && canRenameTopic) {
                  void session.renameTopic(activeTopic.id, topicTitleDraft)
                }

                if (event.key === 'Escape') {
                  setTopicTitleDraft(activeTopic?.text ?? '')
                }
              }}
              placeholder="输入当前主题名称"
              disabled={!activeTopic || hasMultipleSelectedTopics}
            />
          </label>
          <div className="panel__actions">
            <button
              className="panel__action"
              type="button"
              disabled={!canRenameTopic}
              onClick={() => activeTopic && void session.renameTopic(activeTopic.id, topicTitleDraft)}
            >
              提交重命名
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!activeTopic || hasMultipleSelectedTopics}
              onClick={() => setTopicTitleDraft(activeTopic?.text ?? '')}
            >
              恢复文本
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!activeTopic || hasMultipleSelectedTopics}
              onClick={() => activeTopic && void session.createChildTopic(activeTopic.id)}
            >
              新建子主题
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!activeTopic || hasMultipleSelectedTopics || !canMoveTopicUp}
              onClick={() => activeTopic && void session.moveTopicInParent(activeTopic.id, 'up')}
            >
              上移主题
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!activeTopic || hasMultipleSelectedTopics || !canMoveTopicDown}
              onClick={() => activeTopic && void session.moveTopicInParent(activeTopic.id, 'down')}
            >
              下移主题
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!activeTopic || hasMultipleSelectedTopics || !activeSheet || activeTopic.id === activeSheet.rootTopic.id}
              onClick={() => activeTopic && void session.createSiblingTopic(activeTopic.id)}
            >
              新建同级
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={
                hasMultipleSelectedTopics
                  ? normalizedSelectedTopicIds.length === 0
                  : !activeTopic || !activeSheet || activeTopic.id === activeSheet.rootTopic.id
              }
              onClick={() => {
                if (hasMultipleSelectedTopics) {
                  void session.deleteTopics(
                    normalizedSelectedTopicIds,
                    `删除 ${normalizedSelectedTopicIds.length} 个主题`,
                  )
                  return
                }

                if (activeTopic) {
                  void session.deleteTopic(activeTopic.id)
                }
              }}
            >
              {hasMultipleSelectedTopics ? '删除已选主题' : '删除当前主题'}
            </button>
          </div>
          <label className="panel__field">
            <span>当前画布目标父主题</span>
            <select
              value={reparentTargetParentId}
              onChange={(event) => setReparentTargetParentId(event.target.value)}
              disabled={reparentTargetParents.length === 0}
            >
              {reparentTargetParents.length === 0 ? (
                <option value="">当前没有可移动的其他父主题</option>
              ) : null}
              {reparentTargetParents.map((entry) => (
                <option key={entry.topicId} value={entry.topicId}>
                  {entry.path.join(' / ')}
                </option>
              ))}
            </select>
          </label>
          <div className="panel__actions">
            <button
              className="panel__action"
              type="button"
              disabled={!canReparentTopicInSheet}
              onClick={() => {
                if (!reparentTargetParentEntry) {
                  return
                }

                void (async () => {
                  if (hasMultipleSelectedTopics) {
                    await session.moveTopics(
                      batchReparentValidation.normalizedTopicIds,
                      reparentTargetParentId,
                      `批量移动 ${batchReparentValidation.normalizedTopicIds.length} 个主题到“${reparentTargetParentEntry.path.join(' / ')}”下面`,
                    )
                  } else if (activeTopic) {
                    await session.moveTopic(
                      activeTopic.id,
                      reparentTargetParentId,
                      `移动主题到“${reparentTargetParentEntry.path.join(' / ')}”下面`,
                    )
                  }

                  markDropSuccessHighlight(reparentTargetParentId, null, null)
                })()
              }}
            >
              {hasMultipleSelectedTopics ? '批量移动到当前画布父主题' : '移动到当前画布父主题'}
            </button>
          </div>
          <label className="panel__field">
            <span>目标画布</span>
            <select
              value={moveTargetSheetId}
              onChange={(event) => setMoveTargetSheetId(event.target.value)}
              disabled={movableTargetSheets.length === 0}
            >
              {movableTargetSheets.length === 0 ? <option value="">当前没有其他画布</option> : null}
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
          <div className="panel__actions">
            <button
              className="panel__action"
              type="button"
              disabled={!canOrganizeAcrossSheets}
              onClick={() => {
                if (!targetSheet || !moveTargetParentEntry) {
                  return
                }

                void (async () => {
                  if (hasMultipleSelectedTopics) {
                    await session.moveTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      getSheetTargetActionLabel(targetSheet.title, moveTargetParentEntry, `批量移动 ${normalizedSelectedTopicIds.length} 个主题`),
                    )
                  } else if (activeTopic) {
                    await session.moveTopicToSheet(
                      activeTopic.id,
                      moveTargetSheetId,
                      moveTargetParentId,
                      getSheetTargetActionLabel(targetSheet.title, moveTargetParentEntry, '移动主题'),
                    )
                  }

                  markDropSuccessHighlight(moveTargetParentId, moveTargetSheetId, moveTargetParentId)
                })()
              }}
            >
              {hasMultipleSelectedTopics ? '批量移动到其他画布' : '移动到其他画布'}
            </button>
            <button
              className="panel__action"
              type="button"
              disabled={!canOrganizeAcrossSheets}
              onClick={() => {
                if (!targetSheet || !moveTargetParentEntry) {
                  return
                }

                void (async () => {
                  if (hasMultipleSelectedTopics) {
                    await session.copyTopicsToSheet(
                      normalizedSelectedTopicIds,
                      moveTargetSheetId,
                      moveTargetParentId,
                      getSheetTargetActionLabel(targetSheet.title, moveTargetParentEntry, `批量复制 ${normalizedSelectedTopicIds.length} 个主题`),
                    )
                  } else if (activeTopic) {
                    await session.copyTopicToSheet(
                      activeTopic.id,
                      moveTargetSheetId,
                      moveTargetParentId,
                      getSheetTargetActionLabel(targetSheet.title, moveTargetParentEntry, '复制主题'),
                    )
                  }

                  markDropSuccessHighlight(moveTargetParentId, moveTargetSheetId, moveTargetParentId)
                })()
              }}
            >
              {hasMultipleSelectedTopics ? '批量复制到其他画布' : '复制到其他画布'}
            </button>
          </div>
        </div>
        {activeSheet ? (
          <ul className="topic-tree" aria-label="当前画布大纲">
            <TopicTreeNode
              topic={activeSheet.rootTopic}
              activeTopicId={session.activeTopicId}
              selectedTopicIds={selectedTopicIds}
              draggingTopicId={draggingTopicId}
              dropTargetTopicId={dropTargetTopicId}
              invalidDropTopicId={invalidDropTopicId}
              recentDropTopicId={recentDropTopicId}
              historyFocusTopicId={historyFocusTopicId}
              onSelect={handleSelectTopic}
              onToggleCollapsed={(topicId) => void session.toggleTopicCollapsed(topicId)}
              onCanDragTopic={canDragTopic}
              onDragStartTopic={(topicId) => {
                clearDropSuccessHighlight()
                setDraggingTopicId(topicId)
                setDropTargetTopicId(null)
                setDropTargetSheetId(null)
                setDropTargetSheetParentId(null)
                setInvalidDropTopicId(null)
                setInvalidDropSheetId(null)
                setInvalidDragHint(null)
                clearPendingAutoExpand()
              }}
              onDragOverTopic={(topicId) => {
                const canDrop = canDropDraggedTopicOnTarget(topicId)

                if (!canDrop) {
                  setDropTargetSheetId(null)
                  setDropTargetSheetParentId(null)
                  setDropTargetTopicId(null)
                  setInvalidDropSheetId(null)
                  setInvalidDropTopicId(topicId)
                  setInvalidDragHint(getInvalidTopicDropReason(topicId))
                  clearPendingAutoExpand()
                  return false
                }

                setDropTargetSheetId(null)
                setDropTargetSheetParentId(null)
                setDropTargetTopicId(topicId)
                setInvalidDropSheetId(null)
                setInvalidDropTopicId(null)
                setInvalidDragHint(null)
                scheduleAutoExpandTopic(topicId)

                return canDrop
              }}
              onDragLeaveTopic={(topicId) => {
                if (dropTargetTopicId === topicId) {
                  setDropTargetTopicId(null)
                }
                if (invalidDropTopicId === topicId) {
                  setInvalidDropTopicId(null)
                  setInvalidDragHint(null)
                }
                if (autoExpandTopicIdRef.current === topicId) {
                  clearPendingAutoExpand()
                }
              }}
              onDropTopic={(topicId) => {
                if (!draggingTopicId || !canDropDraggedTopicOnTarget(topicId)) {
                  setDraggingTopicId(null)
                  setDropTargetTopicId(null)
                  setDropTargetSheetId(null)
                  setDropTargetSheetParentId(null)
                  setInvalidDropTopicId(null)
                  setInvalidDropSheetId(null)
                  setInvalidDragHint(null)
                  clearPendingAutoExpand()
                  return
                }

                setDraggingTopicId(null)
                setDropTargetTopicId(null)
                setDropTargetSheetId(null)
                setDropTargetSheetParentId(null)
                setInvalidDropTopicId(null)
                setInvalidDropSheetId(null)
                setInvalidDragHint(null)
                clearPendingAutoExpand()
                void (async () => {
                  await session.moveTopic(
                    draggingTopicId,
                    topicId,
                    `拖拽移动主题到“${dropTargetTopic?.text ?? ''}”下面`,
                  )
                  markDropSuccessHighlight(topicId, null, null)
                })()
              }}
              onDragEndTopic={() => {
                setDraggingTopicId(null)
                setDropTargetTopicId(null)
                setDropTargetSheetId(null)
                setDropTargetSheetParentId(null)
                setInvalidDropTopicId(null)
                setInvalidDropSheetId(null)
                setInvalidDragHint(null)
                clearPendingAutoExpand()
              }}
            />
          </ul>
        ) : null}
      </div>

      <div className={`panel__section${sheetManagerOpen ? " panel__section--open" : " panel__section--collapsed"}`}>
        <button
          type="button"
          className="panel__section-header"
          aria-expanded={sheetManagerOpen}
          onClick={() => setSheetManagerOpen((v) => !v)}
        >
          <span className="panel__section-chevron" aria-hidden="true">
            {sheetManagerOpen ? '▾' : '▸'}
          </span>
          <span className="panel__eyebrow">Sheets</span>
          <span className="panel__title">画布管理</span>
        </button>
        {sheetManagerOpen ? (
          <>
            <p className="panel__muted">当前文档里的所有画布都会参与保存、恢复和修复流程，也支持把主题直接拖到目标画布里。</p>
            <div className="panel__actions">
              <button className="panel__action" type="button" onClick={() => void session.createSheet()}>
                新建画布
              </button>
              <button
                className="panel__action"
                type="button"
                disabled={!activeSheet || !sheetTitleDraft.trim()}
                onClick={() =>
                  activeSheet && void session.renameSheet(activeSheet.id, sheetTitleDraft)
                }
              >
                重命名当前画布
              </button>
              <button
                className="panel__action"
                type="button"
                disabled={!activeSheet || (session.summary?.sheetCount ?? 0) <= 1}
                onClick={() => activeSheet && void session.deleteSheet(activeSheet.id)}
              >
                删除当前画布
              </button>
            </div>
            <label className="panel__field">
              <span>画布名称</span>
              <input
                type="text"
                value={sheetTitleDraft}
                onChange={(event) => setSheetTitleDraft(event.target.value)}
                placeholder="输入当前画布名称"
              />
            </label>
            <label className="panel__field">
              <span>图表类型</span>
              <select
                value={activeSheet?.chartType ?? 'mindmap'}
                disabled={!activeSheet}
                onChange={(event) => {
                  if (activeSheet) {
                    void session.setSheetChartType(activeSheet.id, event.target.value as ChartType)
                  }
                }}
              >
                {CHART_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <ul className="panel__list">
              {session.document?.sheets.map((sheet, index) => (
                <li
                  key={sheet.id}
                  onDragLeave={(event) => {
                    const nextTarget = event.relatedTarget

                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                      return
                    }

                    if (dropTargetSheetId === sheet.id) {
                      setDropTargetSheetId(null)
                      setDropTargetSheetParentId(null)
                    }
                    if (invalidDropSheetId === sheet.id) {
                      setInvalidDropSheetId(null)
                      setInvalidDragHint(null)
                    }
                  }}
                >
                  <div className="panel__actions">
                      <button
                        className={`panel__action${dropTargetSheetId === sheet.id ? ' panel__action--drop-target' : ''}${invalidDropSheetId === sheet.id ? ' panel__action--drop-invalid' : ''}${recentDropSheetId === sheet.id ? ' panel__action--drop-success' : ''}`}
                        data-sheet-id={sheet.id}
                        type="button"
                        onClick={() => void session.selectSheet(sheet.id)}
                        onDragOver={(event) => {
                          if (!canDropDraggedTopicOnSheet(sheet.id)) {
                            setDropTargetTopicId(null)
                            setDropTargetSheetId(null)
                            setDropTargetSheetParentId(null)
                            setInvalidDropTopicId(null)
                            setInvalidDropSheetId(sheet.id)
                            setInvalidDragHint(getInvalidSheetDropReason(sheet.id))
                            return
                          }

                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                          setDropTargetTopicId(null)
                          setDropTargetSheetId(sheet.id)
                          setDropTargetSheetParentId(sheet.rootTopic.id)
                          setInvalidDropTopicId(null)
                          setInvalidDropSheetId(null)
                          setInvalidDragHint(null)
                          clearPendingAutoExpand()
                        }}
                        onDrop={(event) => {
                          event.preventDefault()

                          if (!draggingTopicId || !canDropDraggedTopicOnSheet(sheet.id)) {
                            setDropTargetSheetId(null)
                            setDropTargetSheetParentId(null)
                            setInvalidDropSheetId(null)
                            clearPendingAutoExpand()
                            return
                          }

                          setDraggingTopicId(null)
                          setDropTargetTopicId(null)
                          setDropTargetSheetId(null)
                          setDropTargetSheetParentId(null)
                          setInvalidDropTopicId(null)
                          setInvalidDropSheetId(null)
                          setInvalidDragHint(null)
                          clearPendingAutoExpand()
                          void (async () => {
                            await session.moveTopicToSheet(
                              draggingTopicId,
                              sheet.id,
                              sheet.rootTopic.id,
                              `拖拽移动主题到画布“${sheet.title}”根主题`,
                            )
                            markDropSuccessHighlight(sheet.rootTopic.id, sheet.id, sheet.rootTopic.id)
                          })()
                        }}
                        onDragLeave={(event) => {
                          const container = event.currentTarget.closest('li')
                          const nextTarget = event.relatedTarget

                          if (
                            container &&
                            nextTarget instanceof Node &&
                            container.contains(nextTarget)
                          ) {
                            return
                          }

                          if (dropTargetSheetId === sheet.id) {
                            setDropTargetSheetId(null)
                            setDropTargetSheetParentId(null)
                          }
                          if (invalidDropSheetId === sheet.id) {
                            setInvalidDropSheetId(null)
                            setInvalidDragHint(null)
                          }
                          clearPendingAutoExpand()
                        }}
                      >
                        {sheet.title}
                        {sheet.id === session.summary?.activeSheetId ? '（当前）' : ''}
                      </button>
                      <button
                        className="panel__action"
                        type="button"
                        disabled={index === 0}
                        onClick={() => void session.moveSheet(sheet.id, 'up')}
                      >
                        上移
                      </button>
                      <button
                        className="panel__action"
                        type="button"
                        disabled={index === (session.document?.sheets.length ?? 0) - 1}
                        onClick={() => void session.moveSheet(sheet.id, 'down')}
                      >
                        下移
                      </button>
                    </div>
                    {((draggingTopicId && dropTargetSheetId === sheet.id) ||
                      recentDropSheetId === sheet.id) ? (
                      <div className="sheet-drop-targets">
                        <p className="sheet-drop-targets__label">
                          {draggingTopicId ? '拖到画布中的目标父主题' : '刚刚投放到的目标父主题'}
                        </p>
                        <div className="sheet-drop-targets__list">
                          {sheetDropParentEntriesById[sheet.id]?.map((entry) => {
                            const isRootTarget = entry.topicId === sheet.rootTopic.id
                            const isActiveDropParent = dropTargetSheetParentId === entry.topicId
                            const isRecentDropParent =
                              recentDropSheetId === sheet.id && recentDropSheetParentId === entry.topicId

                            return (
                              <button
                                key={entry.topicId}
                                className={`sheet-drop-target${isActiveDropParent ? ' sheet-drop-target--active' : ''}${isRecentDropParent ? ' sheet-drop-target--success' : ''}`}
                                data-drop-sheet-id={sheet.id}
                                data-drop-parent-id={entry.topicId}
                                type="button"
                                disabled={!draggingTopicId}
                                onDragOver={(event) => {
                                  if (!canDropDraggedTopicOnSheet(sheet.id)) {
                                    return
                                  }

                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = 'move'
                                  setDropTargetTopicId(null)
                                  setDropTargetSheetId(sheet.id)
                                  setDropTargetSheetParentId(entry.topicId)
                                  setInvalidDropTopicId(null)
                                  setInvalidDropSheetId(null)
                                  setInvalidDragHint(null)
                                }}
                                onDrop={(event) => {
                                  event.preventDefault()

                                  if (!draggingTopicId || !canDropDraggedTopicOnSheet(sheet.id)) {
                                    return
                                  }

                                  setDraggingTopicId(null)
                                  setDropTargetTopicId(null)
                                  setDropTargetSheetId(null)
                                  setDropTargetSheetParentId(null)
                                  setInvalidDropTopicId(null)
                                  setInvalidDropSheetId(null)
                                  setInvalidDragHint(null)
                                  clearPendingAutoExpand()
                                  void (async () => {
                                    await session.moveTopicToSheet(
                                      draggingTopicId,
                                      sheet.id,
                                      entry.topicId,
                                      `拖拽移动主题到画布“${sheet.title}”的“${entry.path.join(' / ')}”下面`,
                                    )
                                    markDropSuccessHighlight(entry.topicId, sheet.id, entry.topicId)
                                  })()
                                }}
                              >
                                {isRootTarget ? `根主题 / ${entry.text}` : entry.path.join(' / ')}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  )
}
