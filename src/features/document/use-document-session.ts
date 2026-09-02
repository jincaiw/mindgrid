import { useCallback, useEffect, useMemo, useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import {
  clearRepairReport,
  copyTopicToSheet,
  copyTopicsToSheet,
  createBoundary,
  createChildTopic,
  createDocument,
  createDocumentFromTemplate,
  createRelationship,
  createSheet,
  createSiblingTopic,
  createParentTopic,
  createFloatingTopic,
  createSummary,
  deleteBoundary,
  deleteRelationship,
  deleteSheet,
  deleteSummary,
  deleteTopic,
  deleteTopics,
  exportMarkdownFile,
  exportOpmlFile,
  exportPdfFile,
  exportPngFile,
  exportRecoveryCopy,
  exportSvgFile,
  getDocumentState,
  importDocxFile,
  importMarkdownFile,
  importOpmlFile,
  moveSheet,
  moveTopic,
  moveTopics,
  moveTopicInParent,
  moveTopicToSheet,
  moveTopicsToSheet,
  openDocumentFile,
  pasteTopics,
  repairDocumentFile,
  readAssetDataUrl,
  redoDocumentCommand,
  removeTopicImage,
  renameSheet,
  renameTopic,
  saveDocumentFile,
  saveDocumentToCurrentFile,
  selectSheet,
  selectTopic,
  setDocumentSetting,
  setDocumentTheme,
  setSheetChartType,
  setSheetBranchStyle,
  setTopicImage,
  setTopicLabels,
  setTopicLink,
  setTopicMarkers,
  setTopicNotes,
  setTopicStyleOverrides,
  setTopicStyleRef,
  setTopicTask,
  toggleTopicCollapsed,
  undoDocumentCommand,
} from '../../lib/ipc/commands'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import type {
  ChartType,
  DocumentSnapshot,
  SheetBranchStyle,
  TopicLink,
  TopicMarker,
  TopicSnapshot,
  TopicStyleOverrides,
  TopicTask,
} from '../../lib/document/types'
import { getActiveSheet } from '../../lib/document/sheets'
import { computeLayout } from '../canvas/layouts'
import {
  collectTopicImageAssetIds,
  collectTopicImageRefs,
} from '../canvas/runtime/topic-image-store'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from '../canvas/runtime/scene-builder'
import { renderSceneToSvg } from '../canvas/runtime/svg-renderer'
import { renderSceneToPngBytes } from '../canvas/runtime/png-exporter'
import { renderSceneToPdfBytes } from '../canvas/runtime/pdf-exporter'
import { buildGanttSvg, renderGanttSvgToPngBytes } from '../gantt/export-gantt-svg'
import type { GanttZoom } from '../gantt/collect-gantt-tasks'
import {
  fromSnapshot,
  initialDocumentSessionState,
  type RecentActionRecord,
  type DocumentSessionState,
} from './document-session-store'

export interface DocumentSession extends DocumentSessionState {
  createNewDocument: () => Promise<void>
  createFromTemplate: (document: DocumentSnapshot) => Promise<void>
  openDocument: () => Promise<void>
  repairLastFailedOpen: () => Promise<void>
  clearRepairReport: () => Promise<void>
  saveDocument: () => Promise<void>
  saveDocumentAs: () => Promise<void>
  exportMarkdownOutline: () => Promise<void>
  importMarkdownOutline: () => Promise<void>
  exportOpmlOutline: () => Promise<void>
  importOpmlOutline: () => Promise<void>
  importDocxOutline: () => Promise<void>
  setDocumentSetting: (key: string, value: unknown) => Promise<void>
  exportPngImage: () => Promise<void>
  exportSvgImage: () => Promise<void>
  /** 甘特图导出（批次 26/27）：全文档任务时间轴另存为矢量/位图，粒度跟随视图（日/周/月） */
  exportGanttImage: (zoom?: 'day' | 'week' | 'month') => Promise<void>
  exportGanttPng: (zoom?: 'day' | 'week' | 'month') => Promise<void>
  exportPdfDocument: () => Promise<void>
  exportRecoveryCopy: () => Promise<void>
  selectSheet: (sheetId: string) => Promise<void>
  createSheet: () => Promise<void>
  renameSheet: (sheetId: string, title: string) => Promise<void>
  deleteSheet: (sheetId: string) => Promise<void>
  moveSheet: (sheetId: string, direction: 'up' | 'down') => Promise<void>
  setSheetChartType: (sheetId: string, chartType: ChartType) => Promise<void>
  setSheetBranchStyle: (
    sheetId: string,
    branchStyle: SheetBranchStyle | null,
  ) => Promise<void>
  selectTopic: (topicId: string) => Promise<void>
  createChildTopic: (parentId: string) => Promise<void>
  createSiblingTopic: (topicId: string, position?: 'before' | 'after') => Promise<void>
  createParentTopic: (topicId: string) => Promise<void>
  createFloatingTopic: (text: string, offsetX: number, offsetY: number) => Promise<void>
  renameTopic: (topicId: string, text: string) => Promise<void>
  deleteTopic: (topicId: string) => Promise<void>
  deleteTopics: (topicIds: string[], actionLabel?: string) => Promise<void>
  toggleTopicCollapsed: (topicId: string) => Promise<void>
  setTopicNotes: (topicId: string, notes: string | null) => Promise<void>
  /** 插入主题图片：sourcePath 为本地绝对路径（Tauri），浏览器开发态传 data: URL。 */
  setTopicImage: (topicId: string, sourcePath: string) => Promise<void>
  removeTopicImage: (topicId: string) => Promise<void>
  /** 读取资源 data URL 供画布渲染（不入历史栈）。 */
  readAssetDataUrl: (assetId: string) => Promise<string>
  setTopicLink: (topicId: string, link: TopicLink | null) => Promise<void>
  setTopicMarkers: (topicId: string, markers: TopicMarker[]) => Promise<void>
  setTopicLabels: (topicId: string, labels: string[]) => Promise<void>
  setTopicTask: (topicId: string, task: TopicTask | null) => Promise<void>
  setTopicStyleRef: (topicId: string, styleRef: string | null) => Promise<void>
  setTopicStyleOverrides: (
    topicId: string,
    styleOverrides: TopicStyleOverrides | null,
  ) => Promise<void>
  setDocumentTheme: (themeId: string | null) => Promise<void>
  createRelationship: (fromTopicId: string, toTopicId: string, label: string | null) => Promise<void>
  deleteRelationship: (relationshipId: string) => Promise<void>
  createBoundary: (sheetId: string, topicIds: string[], label: string | null) => Promise<void>
  deleteBoundary: (sheetId: string, boundaryId: string) => Promise<void>
  createSummary: (sheetId: string, topicIds: string[], label: string) => Promise<void>
  deleteSummary: (sheetId: string, summaryId: string) => Promise<void>
  moveTopic: (topicId: string, targetParentId: string, actionLabel?: string) => Promise<void>
  moveTopics: (topicIds: string[], targetParentId: string, actionLabel?: string) => Promise<void>
  moveTopicInParent: (topicId: string, direction: 'up' | 'down') => Promise<void>
  moveTopicToSheet: (
    topicId: string,
    targetSheetId: string,
    targetParentId?: string,
    actionLabel?: string,
  ) => Promise<void>
  moveTopicsToSheet: (
    topicIds: string[],
    targetSheetId: string,
    targetParentId?: string,
    actionLabel?: string,
  ) => Promise<void>
  copyTopicToSheet: (
    topicId: string,
    targetSheetId: string,
    targetParentId?: string,
    actionLabel?: string,
  ) => Promise<void>
  copyTopicsToSheet: (
    topicIds: string[],
    targetSheetId: string,
    targetParentId?: string,
    actionLabel?: string,
  ) => Promise<void>
  pasteTopics: (topics: Parameters<typeof pasteTopics>[0], targetParentId: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
}

interface ApplySnapshotOptions {
  resetRecentActions?: boolean
  clearRecentActions?: boolean
}

interface RunCommandOptions {
  resetRecentActionsOnSuccess?: boolean
  clearRecentActionsOnSuccess?: boolean
}

const MAX_RECENT_ACTIONS = 4

function shouldTrackRecentAction(action: string) {
  if (!action.startsWith('已')) {
    return false
  }

  return ![
    '已打开文档',
    '已保存文档',
    '已另存文档',
    '已导出 Markdown 大纲',
    '已导入 Markdown 大纲',
    '已导出 OPML 大纲',
    '已导入 OPML 大纲',
    '已导出 PNG 图片',
    '已导出 SVG 矢量图',
    '已导出恢复副本',
    '已修复文档并打开副本',
    '已恢复当前文档',
    '已创建默认文档',
    '已创建新文档',
    '已收起修复摘要',
  ].some((prefix) => action.startsWith(prefix))
}

function toRecentActionRecord(action: string): RecentActionRecord {
  const detail = action.replace(/^已/, '')
  const crossSheetTarget = detail.match(/到画布“([^”]+)”/)

  if (crossSheetTarget) {
    return {
      label: detail.startsWith('重做 ') || detail.startsWith('撤销 ') ? '历史' : '跨画布',
      scope: crossSheetTarget[1],
      detail,
      count: 1,
    }
  }

  if (detail.startsWith('重做 ') || detail.startsWith('撤销 ')) {
    return {
      label: '历史',
      scope: null,
      detail,
      count: 1,
    }
  }

  if (detail.startsWith('删除 ')) {
    return {
      label: '删除',
      scope: null,
      detail,
      count: 1,
    }
  }

  if (detail.includes('到“') && detail.includes('”下面')) {
    return {
      label: '改挂',
      scope: null,
      detail,
      count: 1,
    }
  }

  if (detail.startsWith('创建')) {
    return {
      label: '创建',
      scope: null,
      detail,
      count: 1,
    }
  }

  return {
    label: '结构',
    scope: null,
    detail,
    count: 1,
  }
}

function appendRecentActions(currentActions: RecentActionRecord[], action: string) {
  if (!shouldTrackRecentAction(action)) {
    return currentActions
  }

  const nextRecord = toRecentActionRecord(action)
  const currentRecord = currentActions[0]

  if (
    currentRecord &&
    currentRecord.label === nextRecord.label &&
    currentRecord.scope === nextRecord.scope &&
    currentRecord.detail === nextRecord.detail
  ) {
    return [
      {
        ...currentRecord,
        count: currentRecord.count + 1,
      },
      ...currentActions.slice(1),
    ].slice(0, MAX_RECENT_ACTIONS)
  }

  return [
    nextRecord,
    ...currentActions.filter(
      (entry) =>
        !(
          entry.label === nextRecord.label &&
          entry.scope === nextRecord.scope &&
          entry.detail === nextRecord.detail
        ),
    ),
  ].slice(0, MAX_RECENT_ACTIONS)
}

/** 导出用的空交互状态（无选中/激活/搜索态，确保导出图不含运行态视觉标记）。 */
const EXPORT_VISUAL_STATES: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const EXPORT_OVERLAYS: InteractionOverlays = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

/**
 * 把当前工作表里主题引用的图片资产解析为 data URL：topicId → data URL。
 *
 * 渲染端需要的是字节本身（`<image href>` / `drawImage` 都吃 data URL），
 * 而文档里只存 assetId，所以导出前必须做这一次解析。
 *
 * 单个资产解析失败（资源缺失 / 后端未就绪）时**静默跳过**该主题：
 * 导出不应因为一张坏图就整体失败，退化为「该主题无图」但版式与其余内容完整。
 */
async function resolveTopicImageUrls(rootTopic: TopicSnapshot): Promise<Record<string, string>> {
  const refs = collectTopicImageRefs(rootTopic)
  if (refs.length === 0) {
    return {}
  }

  // 按 assetId 去重，同一张图被多个主题引用时只请求一次
  const assetIds = collectTopicImageAssetIds(refs.map((ref) => ({ assetId: ref.assetId })))

  const entries = await Promise.all(
    assetIds.map(async (assetId) => {
      try {
        return { assetId, dataUrl: await readAssetDataUrl(assetId) }
      } catch {
        return { assetId, dataUrl: '' }
      }
    }),
  )

  const dataUrlByAssetId = new Map<string, string>()
  for (const entry of entries) {
    if (entry.dataUrl) {
      dataUrlByAssetId.set(entry.assetId, entry.dataUrl)
    }
  }

  const result: Record<string, string> = {}
  for (const ref of refs) {
    const dataUrl = dataUrlByAssetId.get(ref.assetId)
    if (dataUrl) {
      result[ref.topicId] = dataUrl
    }
  }

  return result
}

/** 从文档构建全量导出场景（关闭视口剔除，渲染所有节点，并解析主题图片）。 */
async function buildExportScene(document: DocumentSnapshot) {
  const sheet = getActiveSheet(document)
  const layout = computeLayout(sheet.rootTopic, sheet.chartType ?? 'mindmap')
  const topicImageUrls = await resolveTopicImageUrls(sheet.rootTopic)

  return buildScene({
    layout,
    viewport: { width: layout.width, height: layout.height },
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: EXPORT_VISUAL_STATES,
    overlays: EXPORT_OVERLAYS,
    relationships: document.relationships,
    boundaries: sheet.boundaries,
    summaries: sheet.summaries,
    themeId: document.theme?.id,
    branchStyle: sheet.branchStyle,
    enableCulling: false,
    topicImageUrls,
  })
}

export function useDocumentSession(): DocumentSession {
  const [state, setState] = useState<DocumentSessionState>(initialDocumentSessionState)
  const [lastFailedOpenPath, setLastFailedOpenPath] = useState<string | null>(null)

  const applySnapshot = useCallback((nextState: DocumentSessionState, options?: ApplySnapshotOptions) => {
    setState((current) => ({
      ...nextState,
      recentActions: appendRecentActions(
        options?.resetRecentActions || options?.clearRecentActions ? [] : current.recentActions,
        nextState.recentAction,
      ),
    }))
    setLastFailedOpenPath(null)
  }, [])

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : '文档服务暂时不可用'

    setState((current) => ({
      ...current,
      status: current.summary ? 'ready' : 'error',
      error: message,
      canRepairLastFailedOpen: false,
      recentAction: current.summary ? '最近一次操作失败' : '加载失败',
    }))
    setLastFailedOpenPath(null)
  }, [])

  const runCommand = useCallback(
    async (
      actionLabel: string,
      action: () => Promise<Parameters<typeof fromSnapshot>[0]>,
      pendingStatus: DocumentSessionState['status'] = 'ready',
      options?: RunCommandOptions,
    ) => {
      setState((current) => ({
        ...current,
        status: current.summary ? pendingStatus : 'loading',
        error: null,
        recentAction: `正在${actionLabel}`,
      }))

      try {
        const snapshot = await action()
        applySnapshot(fromSnapshot(snapshot, `已${actionLabel}`), {
          resetRecentActions: options?.resetRecentActionsOnSuccess,
          clearRecentActions: options?.clearRecentActionsOnSuccess,
        })
      } catch (error) {
        handleError(error)
      }
    },
    [applySnapshot, handleError],
  )

  const createNewDocument = useCallback(async () => {
    if (
      state.hasUnsavedChanges &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('当前文档还有未保存更改。确定要新建文档吗？未保存内容仍可从恢复区继续找回。')
    ) {
      return
    }

    await runCommand('创建新文档', createDocument, 'loading', {
      resetRecentActionsOnSuccess: true,
    })
  }, [runCommand, state.hasUnsavedChanges])

  const createFromTemplate = useCallback(
    async (document: DocumentSnapshot) => {
      if (
        state.hasUnsavedChanges &&
        typeof window !== 'undefined' &&
        typeof window.confirm === 'function' &&
        !window.confirm('当前文档还有未保存更改。确定要从模板新建文档吗？未保存内容仍可从恢复区继续找回。')
      ) {
        return
      }

      await runCommand(
        '从模板创建文档',
        () => createDocumentFromTemplate(document),
        'loading',
        { resetRecentActionsOnSuccess: true },
      )
    },
    [runCommand, state.hasUnsavedChanges],
  )

  const pickOpenPath = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持正式文件打开，请使用桌面版运行')
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'MindGrid 文档', extensions: ['mgd'] }],
    })

    return typeof selected === 'string' ? selected : null
  }, [])

  const pickSavePath = useCallback(async (defaultPath?: string | null) => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持正式文件保存，请使用桌面版运行')
    }

    const selected = await save({
      defaultPath: defaultPath ?? 'MindGrid.mgd',
      filters: [{ name: 'MindGrid 文档', extensions: ['mgd'] }],
    })

    if (!selected) {
      return selected
    }

    return selected.toLowerCase().endsWith('.mgd') ? selected : `${selected}.mgd`
  }, [])

  const openCurrentDocument = useCallback(async () => {
    if (
      state.hasUnsavedChanges &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('当前文档还有未保存更改。确定要打开其他文档吗？未保存内容仍可从恢复区继续找回。')
    ) {
      return
    }

    const selectedPath = await pickOpenPath()

    if (!selectedPath) {
      return
    }

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
      canRepairLastFailedOpen: false,
      recentAction: '正在打开文档',
    }))

    try {
      const snapshot = await openDocumentFile(selectedPath)
      applySnapshot(fromSnapshot(snapshot, '已打开文档'), {
        resetRecentActions: true,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '文档服务暂时不可用'
      setLastFailedOpenPath(selectedPath)

      setState((current) => ({
        ...current,
        status: current.summary ? 'ready' : 'error',
        error: message,
        canRepairLastFailedOpen: true,
        recentAction: current.summary ? '打开文档失败' : '加载失败',
      }))
    }
  }, [applySnapshot, pickOpenPath, state.hasUnsavedChanges])

  const repairLastFailedOpen = useCallback(async () => {
    if (!lastFailedOpenPath || !state.error || !state.canRepairLastFailedOpen) {
      return
    }

    const repairCopyPath = await pickSavePath(lastFailedOpenPath.replace(/\.mgd$/i, '-修复副本.mgd'))

    if (!repairCopyPath) {
      return
    }

    await runCommand(
      '修复文档并打开副本',
      () => repairDocumentFile(lastFailedOpenPath, repairCopyPath),
      'loading',
      {
        resetRecentActionsOnSuccess: true,
      },
    )
  }, [lastFailedOpenPath, pickSavePath, runCommand, state.canRepairLastFailedOpen, state.error])

  const dismissRepairReport = useCallback(async () => {
    if (!state.repairReport) {
      return
    }

    await runCommand('收起修复摘要', clearRepairReport)
  }, [runCommand, state.repairReport])

  const saveCurrentDocumentAs = useCallback(async () => {
    const selectedPath = await pickSavePath(state.filePath ?? `${state.summary?.rootTopicText ?? 'MindGrid'}.mgd`)

    if (!selectedPath) {
      return
    }

    await runCommand('另存文档', () => saveDocumentFile(selectedPath), 'ready', {
      clearRecentActionsOnSuccess: true,
    })
  }, [pickSavePath, runCommand, state.filePath, state.summary?.rootTopicText])

  const saveCurrentDocument = useCallback(async () => {
    if (!state.summary) {
      return
    }

    if (state.filePath) {
      await runCommand('保存文档', saveDocumentToCurrentFile, 'ready', {
        clearRecentActionsOnSuccess: true,
      })
      return
    }

    await saveCurrentDocumentAs()
  }, [runCommand, saveCurrentDocumentAs, state.filePath, state.summary])

  const exportCurrentRecoveryCopy = useCallback(async () => {
    const selectedPath = await pickSavePath(
      state.filePath
        ? state.filePath.replace(/\.mgd$/i, '-恢复副本.mgd')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}-恢复副本.mgd`,
    )

    if (!selectedPath) {
      return
    }

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出恢复副本',
    }))

    try {
      await exportRecoveryCopy(selectedPath)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出恢复副本',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, pickSavePath, state.filePath, state.summary?.rootTopicText])

  const exportCurrentMarkdownOutline = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 Markdown 导出，请使用桌面版运行')
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '.md')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}-大纲.md`,
      filters: [{ name: 'Markdown 文档', extensions: ['md'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.md') ? selected : `${selected}.md`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出 Markdown 大纲',
    }))

    try {
      await exportMarkdownFile(selectedPath)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出 Markdown 大纲',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.filePath, state.summary?.rootTopicText])

  const importMarkdownOutline = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 Markdown 导入，请使用桌面版运行')
    }

    if (
      state.hasUnsavedChanges &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('当前文档还有未保存更改。确定要导入 Markdown 吗？未保存内容仍可从恢复区继续找回。')
    ) {
      return
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Markdown 文档', extensions: ['md', 'markdown', 'txt'] }],
    })

    if (!selected || typeof selected !== 'string') {
      return
    }

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
      canRepairLastFailedOpen: false,
      recentAction: '正在导入 Markdown 大纲',
    }))

    try {
      const snapshot = await importMarkdownFile(selected)
      applySnapshot(fromSnapshot(snapshot, '已导入 Markdown 大纲'), {
        resetRecentActions: true,
      })
    } catch (error) {
      handleError(error)
    }
  }, [applySnapshot, handleError, state.hasUnsavedChanges])

  const exportCurrentOpmlOutline = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 OPML 导出，请使用桌面版运行')
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '.opml')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}-大纲.opml`,
      filters: [{ name: 'OPML 文档', extensions: ['opml', 'xml'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.opml') || selected.toLowerCase().endsWith('.xml')
      ? selected
      : `${selected}.opml`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出 OPML 大纲',
    }))

    try {
      await exportOpmlFile(selectedPath)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出 OPML 大纲',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.filePath, state.summary?.rootTopicText])

  const importOpmlOutline = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 OPML 导入，请使用桌面版运行')
    }

    if (
      state.hasUnsavedChanges &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('当前文档还有未保存更改。确定要导入 OPML 吗？未保存内容仍可从恢复区继续找回。')
    ) {
      return
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'OPML 文档', extensions: ['opml', 'xml'] }],
    })

    if (!selected || typeof selected !== 'string') {
      return
    }

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
      canRepairLastFailedOpen: false,
      recentAction: '正在导入 OPML 大纲',
    }))

    try {
      const snapshot = await importOpmlFile(selected)
      applySnapshot(fromSnapshot(snapshot, '已导入 OPML 大纲'), {
        resetRecentActions: true,
      })
    } catch (error) {
      handleError(error)
    }
  }, [applySnapshot, handleError, state.hasUnsavedChanges])

  const importDocxOutline = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 Word 导入，请使用桌面版运行')
    }

    if (
      state.hasUnsavedChanges &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function' &&
      !window.confirm('当前文档还有未保存更改。确定要导入 Word 吗？未保存内容仍可从恢复区继续找回。')
    ) {
      return
    }

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    })

    if (!selected || typeof selected !== 'string') {
      return
    }

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null,
      canRepairLastFailedOpen: false,
      recentAction: '正在导入 Word 大纲',
    }))

    try {
      const snapshot = await importDocxFile(selected)
      applySnapshot(fromSnapshot(snapshot, '已导入 Word 大纲'), {
        resetRecentActions: true,
      })
    } catch (error) {
      handleError(error)
    }
  }, [applySnapshot, handleError, state.hasUnsavedChanges])

  const exportCurrentPngImage = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 PNG 导出，请使用桌面版运行')
    }

    if (!state.document) {
      return
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '.png')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.png') ? selected : `${selected}.png`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出 PNG 图片',
    }))

    try {
      const scene = await buildExportScene(state.document)
      const bytes = await renderSceneToPngBytes(scene, { scale: 2 })
      await exportPngFile(selectedPath, bytes)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出 PNG 图片',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.document, state.filePath, state.summary?.rootTopicText])

  const exportCurrentSvgImage = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 SVG 导出，请使用桌面版运行')
    }

    if (!state.document) {
      return
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '.svg')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}.svg`,
      filters: [{ name: 'SVG 矢量图', extensions: ['svg'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.svg') ? selected : `${selected}.svg`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出 SVG 矢量图',
    }))

    try {
      const scene = await buildExportScene(state.document)
      const svgContent = renderSceneToSvg(scene)
      await exportSvgFile(selectedPath, svgContent)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出 SVG 矢量图',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.document, state.filePath, state.summary?.rootTopicText])

  // 批次 26/27：甘特图导出（全文档任务时间轴，粒度跟随视图）
  const exportCurrentGanttSvg = useCallback(async (zoom: GanttZoom = 'day') => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持甘特图导出，请使用桌面版运行')
    }

    if (!state.document) {
      return
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '-甘特图.svg')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}-甘特图.svg`,
      filters: [{ name: 'SVG 矢量图', extensions: ['svg'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.svg') ? selected : `${selected}.svg`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出甘特图',
    }))

    try {
      const svgContent = buildGanttSvg(state.document, Date.now(), zoom)
      await exportSvgFile(selectedPath, svgContent)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出甘特图',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.document, state.filePath, state.summary?.rootTopicText])

  const exportCurrentGanttPng = useCallback(async (zoom: GanttZoom = 'day') => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持甘特图导出，请使用桌面版运行')
    }

    if (!state.document) {
      return
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '-甘特图.png')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}-甘特图.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.png') ? selected : `${selected}.png`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出甘特图',
    }))

    try {
      const svgContent = buildGanttSvg(state.document, Date.now(), zoom)
      const bytes = await renderGanttSvgToPngBytes(svgContent, 2)
      await exportPngFile(selectedPath, bytes)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出甘特图',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.document, state.filePath, state.summary?.rootTopicText])

  // 批次 20：PDF 矢量文档导出（SVG → jsPDF + svg2pdf.js）
  const exportCurrentPdfDocument = useCallback(async () => {
    if (!hasTauriRuntime()) {
      throw new Error('浏览器开发态暂不支持 PDF 导出，请使用桌面版运行')
    }

    if (!state.document) {
      return
    }

    const selected = await save({
      defaultPath: state.filePath
        ? state.filePath.replace(/\.mgd$/i, '.pdf')
        : `${state.summary?.rootTopicText ?? 'MindGrid'}.pdf`,
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
    })

    if (!selected) {
      return
    }

    const selectedPath = selected.toLowerCase().endsWith('.pdf') ? selected : `${selected}.pdf`

    setState((current) => ({
      ...current,
      error: null,
      recentAction: '正在导出 PDF 文档',
    }))

    try {
      const scene = await buildExportScene(state.document)
      const bytes = await renderSceneToPdfBytes(scene)
      await exportPdfFile(selectedPath, bytes)

      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        recentAction: '已导出 PDF 文档',
      }))
    } catch (error) {
      handleError(error)
    }
  }, [handleError, state.document, state.filePath, state.summary?.rootTopicText])

  const selectActiveSheet = useCallback(
    async (sheetId: string) => {
      await runCommand('切换画布', () => selectSheet(sheetId))
    },
    [runCommand],
  )

  const createDocumentSheet = useCallback(async () => {
    await runCommand('创建画布', createSheet)
  }, [runCommand])

  const renameDocumentSheet = useCallback(
    async (sheetId: string, title: string) => {
      await runCommand('重命名画布', () => renameSheet(sheetId, title))
    },
    [runCommand],
  )

  const deleteDocumentSheet = useCallback(
    async (sheetId: string) => {
      await runCommand('删除画布', () => deleteSheet(sheetId))
    },
    [runCommand],
  )

  const moveDocumentSheet = useCallback(
    async (sheetId: string, direction: 'up' | 'down') => {
      await runCommand(direction === 'up' ? '上移画布' : '下移画布', () => moveSheet(sheetId, direction))
    },
    [runCommand],
  )

  const setDocumentSheetChartType = useCallback(
    async (sheetId: string, chartType: ChartType) => {
      await runCommand('切换图表类型', () => setSheetChartType(sheetId, chartType))
    },
    [runCommand],
  )

  const setDocumentSheetBranchStyle = useCallback(
    async (sheetId: string, branchStyle: SheetBranchStyle | null) => {
      await runCommand('设置分支样式', () => setSheetBranchStyle(sheetId, branchStyle))
    },
    [runCommand],
  )

  const selectActiveTopic = useCallback(
    async (topicId: string) => {
      await runCommand('切换选中主题', () => selectTopic(topicId))
    },
    [runCommand],
  )

  const createChild = useCallback(
    async (parentId: string) => {
      await runCommand('创建子主题', () => createChildTopic(parentId))
    },
    [runCommand],
  )

  const createSibling = useCallback(
    async (topicId: string, position?: 'before' | 'after') => {
      const label = position === 'before' ? '前插同级主题' : '创建同级主题'
      await runCommand(label, () => createSiblingTopic(topicId, position))
    },
    [runCommand],
  )

  const createParent = useCallback(
    async (topicId: string) => {
      await runCommand('插入父主题', () => createParentTopic(topicId))
    },
    [runCommand],
  )

  const createFloating = useCallback(
    async (text: string, offsetX: number, offsetY: number) => {
      await runCommand('创建浮动主题', () => createFloatingTopic(text, offsetX, offsetY))
    },
    [runCommand],
  )

  const renameActiveTopic = useCallback(
    async (topicId: string, text: string) => {
      await runCommand('重命名主题', () => renameTopic(topicId, text))
    },
    [runCommand],
  )

  const deleteActiveTopic = useCallback(
    async (topicId: string) => {
      await runCommand('删除主题', () => deleteTopic(topicId))
    },
    [runCommand],
  )

  const deleteMultipleTopics = useCallback(
    async (topicIds: string[], actionLabel = '批量删除主题') => {
      await runCommand(actionLabel, () => deleteTopics(topicIds, actionLabel))
    },
    [runCommand],
  )

  const toggleCollapsedTopic = useCallback(
    async (topicId: string) => {
      await runCommand('切换主题折叠状态', () => toggleTopicCollapsed(topicId))
    },
    [runCommand],
  )

  const updateTopicNotes = useCallback(
    async (topicId: string, notes: string | null) => {
      await runCommand('编辑备注', () => setTopicNotes(topicId, notes))
    },
    [runCommand],
  )

  const updateTopicImage = useCallback(
    async (topicId: string, sourcePath: string) => {
      await runCommand('插入图片', () => setTopicImage(topicId, sourcePath))
    },
    [runCommand],
  )

  const clearTopicImage = useCallback(
    async (topicId: string) => {
      await runCommand('移除图片', () => removeTopicImage(topicId))
    },
    [runCommand],
  )

  // 延迟取用命令绑定：渲染期不访问模块属性，避免单元测试对 commands 做部分 mock 时误触发
  const updateTopicLink = useCallback(
    async (topicId: string, link: TopicLink | null) => {
      await runCommand('编辑链接', () => setTopicLink(topicId, link))
    },
    [runCommand],
  )

  const updateTopicMarkers = useCallback(
    async (topicId: string, markers: TopicMarker[]) => {
      await runCommand('编辑标记', () => setTopicMarkers(topicId, markers))
    },
    [runCommand],
  )

  const updateTopicLabels = useCallback(
    async (topicId: string, labels: string[]) => {
      await runCommand('编辑标签', () => setTopicLabels(topicId, labels))
    },
    [runCommand],
  )

  const updateTopicTask = useCallback(
    async (topicId: string, task: TopicTask | null) => {
      await runCommand('编辑任务', () => setTopicTask(topicId, task))
    },
    [runCommand],
  )

  const updateTopicStyleRef = useCallback(
    async (topicId: string, styleRef: string | null) => {
      await runCommand('编辑样式', () => setTopicStyleRef(topicId, styleRef))
    },
    [runCommand],
  )

  const updateTopicStyleOverrides = useCallback(
    async (topicId: string, styleOverrides: TopicStyleOverrides | null) => {
      await runCommand('编辑样式', () => setTopicStyleOverrides(topicId, styleOverrides))
    },
    [runCommand],
  )

  const updateDocumentTheme = useCallback(
    async (themeId: string | null) => {
      await runCommand('切换文档主题', () => setDocumentTheme(themeId))
    },
    [runCommand],
  )

  const updateDocumentSetting = useCallback(
    async (key: string, value: unknown) => {
      await runCommand('更新画布设置', () => setDocumentSetting(key, value))
    },
    [runCommand],
  )

  const createDocumentRelationship = useCallback(
    async (fromTopicId: string, toTopicId: string, label: string | null) => {
      await runCommand('创建关系线', () => createRelationship(fromTopicId, toTopicId, label))
    },
    [runCommand],
  )

  const deleteDocumentRelationship = useCallback(
    async (relationshipId: string) => {
      await runCommand('删除关系线', () => deleteRelationship(relationshipId))
    },
    [runCommand],
  )

  const createDocumentBoundary = useCallback(
    async (sheetId: string, topicIds: string[], label: string | null) => {
      await runCommand('创建边界', () => createBoundary(sheetId, topicIds, label))
    },
    [runCommand],
  )

  const deleteDocumentBoundary = useCallback(
    async (sheetId: string, boundaryId: string) => {
      await runCommand('删除边界', () => deleteBoundary(sheetId, boundaryId))
    },
    [runCommand],
  )

  const createDocumentSummary = useCallback(
    async (sheetId: string, topicIds: string[], label: string) => {
      await runCommand('创建概要', () => createSummary(sheetId, topicIds, label))
    },
    [runCommand],
  )

  const deleteDocumentSummary = useCallback(
    async (sheetId: string, summaryId: string) => {
      await runCommand('删除概要', () => deleteSummary(sheetId, summaryId))
    },
    [runCommand],
  )

  const moveActiveTopic = useCallback(
    async (topicId: string, targetParentId: string, actionLabel = '移动主题') => {
      await runCommand(actionLabel, () => moveTopic(topicId, targetParentId, actionLabel))
    },
    [runCommand],
  )

  const moveSelectedTopics = useCallback(
    async (topicIds: string[], targetParentId: string, actionLabel = '批量移动主题') => {
      await runCommand(actionLabel, () => moveTopics(topicIds, targetParentId, actionLabel))
    },
    [runCommand],
  )

  const moveActiveTopicInParent = useCallback(
    async (topicId: string, direction: 'up' | 'down') => {
      await runCommand(direction === 'up' ? '上移主题' : '下移主题', () =>
        moveTopicInParent(topicId, direction),
      )
    },
    [runCommand],
  )

  const moveActiveTopicToSheet = useCallback(
    async (
      topicId: string,
      targetSheetId: string,
      targetParentId?: string,
      actionLabel = '移动主题到其他画布',
    ) => {
      await runCommand(actionLabel, () =>
        moveTopicToSheet(topicId, targetSheetId, targetParentId, actionLabel),
      )
    },
    [runCommand],
  )

  const moveSelectedTopicsToSheet = useCallback(
    async (
      topicIds: string[],
      targetSheetId: string,
      targetParentId?: string,
      actionLabel = '批量移动主题到其他画布',
    ) => {
      await runCommand(actionLabel, () =>
        moveTopicsToSheet(topicIds, targetSheetId, targetParentId, actionLabel),
      )
    },
    [runCommand],
  )

  const copyActiveTopicToSheet = useCallback(
    async (
      topicId: string,
      targetSheetId: string,
      targetParentId?: string,
      actionLabel = '复制主题到其他画布',
    ) => {
      await runCommand(actionLabel, () =>
        copyTopicToSheet(topicId, targetSheetId, targetParentId, actionLabel),
      )
    },
    [runCommand],
  )

  const copySelectedTopicsToSheet = useCallback(
    async (
      topicIds: string[],
      targetSheetId: string,
      targetParentId?: string,
      actionLabel = '批量复制主题到其他画布',
    ) => {
      await runCommand(actionLabel, () =>
        copyTopicsToSheet(topicIds, targetSheetId, targetParentId, actionLabel),
      )
    },
    [runCommand],
  )

  const pasteCopiedTopics = useCallback(
    async (topics: Parameters<typeof pasteTopics>[0], targetParentId: string) => {
      await runCommand('粘贴主题', () => pasteTopics(topics, targetParentId))
    },
    [runCommand],
  )

  const undo = useCallback(async () => {
    await runCommand(
      state.nextUndoAction ? `撤销 ${state.nextUndoAction}` : '撤销操作',
      undoDocumentCommand,
    )
  }, [runCommand, state.nextUndoAction])

  const redo = useCallback(async () => {
    await runCommand(
      state.nextRedoAction ? `重做 ${state.nextRedoAction}` : '重做操作',
      redoDocumentCommand,
    )
  }, [runCommand, state.nextRedoAction])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState((current) => ({
        ...current,
        status: 'loading',
        error: null,
        recentAction: '正在连接文档服务',
      }))

      try {
        const snapshot = await getDocumentState()

        if (cancelled) {
          return
        }

        if (snapshot) {
          applySnapshot(fromSnapshot(snapshot, '已恢复当前文档'), {
            resetRecentActions: true,
          })
          return
        }

        const nextSnapshot = await createDocument()

        if (!cancelled) {
          applySnapshot(fromSnapshot(nextSnapshot, '已创建默认文档'), {
            resetRecentActions: true,
          })
        }
      } catch (error) {
        if (!cancelled) {
          handleError(error)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [applySnapshot, handleError])

  return useMemo(
    () => ({
      ...state,
      createNewDocument,
      createFromTemplate,
      openDocument: openCurrentDocument,
      repairLastFailedOpen,
      clearRepairReport: dismissRepairReport,
      saveDocument: saveCurrentDocument,
      saveDocumentAs: saveCurrentDocumentAs,
      exportMarkdownOutline: exportCurrentMarkdownOutline,
      importMarkdownOutline,
      exportOpmlOutline: exportCurrentOpmlOutline,
      importOpmlOutline,
      importDocxOutline,
      exportPngImage: exportCurrentPngImage,
      exportSvgImage: exportCurrentSvgImage,
      exportGanttImage: exportCurrentGanttSvg,
      exportGanttPng: exportCurrentGanttPng,
      exportPdfDocument: exportCurrentPdfDocument,
      exportRecoveryCopy: exportCurrentRecoveryCopy,
      selectSheet: selectActiveSheet,
      createSheet: createDocumentSheet,
      renameSheet: renameDocumentSheet,
      deleteSheet: deleteDocumentSheet,
      moveSheet: moveDocumentSheet,
      setSheetChartType: setDocumentSheetChartType,
      setSheetBranchStyle: setDocumentSheetBranchStyle,
      selectTopic: selectActiveTopic,
      createChildTopic: createChild,
      createSiblingTopic: createSibling,
      createParentTopic: createParent,
      createFloatingTopic: createFloating,
      renameTopic: renameActiveTopic,
      deleteTopic: deleteActiveTopic,
      deleteTopics: deleteMultipleTopics,
      toggleTopicCollapsed: toggleCollapsedTopic,
      setTopicNotes: updateTopicNotes,
      setTopicImage: updateTopicImage,
      removeTopicImage: clearTopicImage,
      readAssetDataUrl,
      setTopicLink: updateTopicLink,
      setTopicMarkers: updateTopicMarkers,
      setTopicLabels: updateTopicLabels,
      setTopicTask: updateTopicTask,
      setTopicStyleRef: updateTopicStyleRef,
      setTopicStyleOverrides: updateTopicStyleOverrides,
      setDocumentTheme: updateDocumentTheme,
      setDocumentSetting: updateDocumentSetting,
      createRelationship: createDocumentRelationship,
      deleteRelationship: deleteDocumentRelationship,
      createBoundary: createDocumentBoundary,
      deleteBoundary: deleteDocumentBoundary,
      createSummary: createDocumentSummary,
      deleteSummary: deleteDocumentSummary,
      moveTopic: moveActiveTopic,
      moveTopics: moveSelectedTopics,
      moveTopicInParent: moveActiveTopicInParent,
      moveTopicToSheet: moveActiveTopicToSheet,
      moveTopicsToSheet: moveSelectedTopicsToSheet,
      copyTopicToSheet: copyActiveTopicToSheet,
      copyTopicsToSheet: copySelectedTopicsToSheet,
      pasteTopics: pasteCopiedTopics,
      undo,
      redo,
    }),
    [
      createChild,
      createNewDocument,
      createFromTemplate,
      createSibling,
      createParent,
      createFloating,
      deleteActiveTopic,
      deleteMultipleTopics,
      openCurrentDocument,
      repairLastFailedOpen,
      dismissRepairReport,
      toggleCollapsedTopic,
      updateTopicNotes,
      updateTopicImage,
      clearTopicImage,
      updateTopicLink,
      updateTopicMarkers,
      updateTopicLabels,
      updateTopicTask,
      updateTopicStyleRef,
      updateTopicStyleOverrides,
      updateDocumentTheme,
      updateDocumentSetting,
      createDocumentRelationship,
      deleteDocumentRelationship,
      createDocumentBoundary,
      deleteDocumentBoundary,
      createDocumentSummary,
      deleteDocumentSummary,
      moveActiveTopic,
      moveActiveTopicToSheet,
      copyActiveTopicToSheet,
      pasteCopiedTopics,
      redo,
      renameActiveTopic,
      renameDocumentSheet,
      moveDocumentSheet,
      setDocumentSheetChartType,
      setDocumentSheetBranchStyle,
      exportCurrentMarkdownOutline,
      importMarkdownOutline,
      exportCurrentOpmlOutline,
      importOpmlOutline,
      importDocxOutline,
      exportCurrentPngImage,
      exportCurrentSvgImage,
      exportCurrentGanttSvg,
      exportCurrentGanttPng,
      exportCurrentRecoveryCopy,
      saveCurrentDocument,
      saveCurrentDocumentAs,
      selectActiveSheet,
      selectActiveTopic,
      state,
      createDocumentSheet,
      deleteDocumentSheet,
      undo,
    ],
  )
}
