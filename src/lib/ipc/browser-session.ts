import { CURRENT_SCHEMA_VERSION, createDefaultDocument, createId, createSheet, createTopic } from '../document/default-document'
import { getActiveRootTopic, getActiveSheet, getSheetById } from '../document/sheets'
import { countTopics, findParentTopicByChildId, findTopicById } from '../document/tree'
import type {
  ChartType,
  DocumentSessionSnapshot,
  DocumentSnapshot,
  EdgeType,
  SheetBranchStyle,
  TopicLink,
  TopicMarker,
  TopicSnapshot,
  TopicStyleOverrides,
  TopicTask,
} from '../document/types'

const RECOVERY_STORAGE_KEY = 'mindgrid:recovery:v1'

interface BrowserRecoverySnapshot {
  document: DocumentSnapshot
  activeTopicId: string | null
  lastAutosavedAtMs: number
}

interface HistoryEntry {
  document: DocumentSnapshot
  actionLabel: string
}

let currentDocument: DocumentSnapshot | null = null
let history: HistoryEntry[] = []
let future: HistoryEntry[] = []
let activeTopicId: string | null = null
let filePath: string | null = null
let lastSavedAtMs: number | null = null
let lastAutosavedAtMs: number | null = null
let hasUnsavedChanges = false
let recoveredFromAutosave = false
let repairReport: DocumentSessionSnapshot['repairReport'] = null
let recoveryStorageFallback: string | null = null
/**
 * 浏览器开发态的资源表：assetId → data URL。
 *
 * 浏览器环境无法读取本地绝对路径，因此 set_topic_image 在此只接受 data: URL 或
 * 可 fetch 的 http(s) 地址，读入内存后登记到本表，read_asset_data_url 再按 id 取回。
 * 与 Rust 侧的 assets/ 资源表行为对齐（仅生命周期为进程内）。
 */
const browserAssetDataUrls = new Map<string, string>()

/** 将图片内容登记进浏览器资源表并返回 assetId（同内容复用已有 id，避免重复膨胀）。 */
function registerBrowserAssetDataUrl(dataUrl: string): string {
  for (const [assetId, existing] of browserAssetDataUrls) {
    if (existing === dataUrl) {
      return assetId
    }
  }

  const assetId = createId('asset')
  browserAssetDataUrls.set(assetId, dataUrl)
  return assetId
}

/** 把 sourcePath 解析为 data URL：data: 原样返回，http(s) 走 fetch，其余不支持。 */
async function resolveBrowserImageDataUrl(sourcePath: string): Promise<string> {
  if (sourcePath.startsWith('data:')) {
    return sourcePath
  }

  if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
    const response = await fetch(sourcePath)

    if (!response.ok) {
      throw new Error(`图片下载失败（HTTP ${response.status}）`)
    }

    const blob = await response.blob()

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(blob)
    })
  }

  throw new Error('浏览器开发态暂不支持读取本地图片路径，请使用桌面版运行')
}

function getRecoveryStorageItem() {
  try {
    return typeof localStorage === 'undefined'
      ? recoveryStorageFallback
      : localStorage.getItem(RECOVERY_STORAGE_KEY)
  } catch {
    return recoveryStorageFallback
  }
}

function setRecoveryStorageItem(value: string) {
  recoveryStorageFallback = value

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECOVERY_STORAGE_KEY, value)
    }
  } catch {
    // Ignore storage errors in the browser fallback test/runtime shim.
  }
}

function removeRecoveryStorageItem() {
  recoveryStorageFallback = null

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(RECOVERY_STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors in the browser fallback test/runtime shim.
  }
}

function cloneDocument(document: DocumentSnapshot) {
  return structuredClone(document)
}

function cloneTopicBranch(topic: TopicSnapshot): TopicSnapshot {
  // 保留全部富字段（样式 / 标记 / 备注 / 链接 / 图片 / 任务 / 布局提示 / 扩展），
  // 仅重新生成 ID，与 Rust 侧 clone_topic_branch 行为一致。
  return {
    ...topic,
    id: createTopic(topic.text).id,
    children: topic.children.map((child) => cloneTopicBranch(child)),
  }
}

/** 克隆主题分支并记录 oldId → newId 映射，用于 regenerateDocumentIds。 */
function cloneTopicBranchWithMap(
  topic: TopicSnapshot,
  idMap: Map<string, string>,
): TopicSnapshot {
  const newId = createTopic(topic.text).id
  idMap.set(topic.id, newId)
  return {
    ...topic,
    id: newId,
    children: topic.children.map((child) => cloneTopicBranchWithMap(child, idMap)),
  }
}

/** 重新生成文档所有 ID 并更新引用，与 Rust DocumentSnapshot::regenerate_ids 镜像。 */
function regenerateDocumentIds(document: DocumentSnapshot): DocumentSnapshot {
  const topicIdMap = new Map<string, string>()
  const sheetIdMap = new Map<string, string>()

  const sheets = document.sheets.map((sheet) => {
    const newSheetId = createId('sheet')
    sheetIdMap.set(sheet.id, newSheetId)
    const newRoot = cloneTopicBranchWithMap(sheet.rootTopic, topicIdMap)

    const boundaries = (sheet.boundaries ?? []).map((b) => ({
      ...b,
      id: createId('bnd'),
      topicIds: b.topicIds.map((id) => topicIdMap.get(id) ?? id),
    }))

    const summaries = (sheet.summaries ?? []).map((s) => ({
      ...s,
      id: createId('sum'),
      topicIds: s.topicIds.map((id) => topicIdMap.get(id) ?? id),
    }))

    return {
      ...sheet,
      id: newSheetId,
      rootTopic: newRoot,
      boundaries,
      summaries,
    }
  })

  const activeSheetId = sheetIdMap.get(document.activeSheetId) ?? sheets[0]?.id ?? ''

  const relationships = (document.relationships ?? []).map((r) => ({
    ...r,
    id: createId('rel'),
    fromTopicId: topicIdMap.get(r.fromTopicId) ?? r.fromTopicId,
    toTopicId: topicIdMap.get(r.toTopicId) ?? r.toTopicId,
  }))

  return {
    ...document,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentId: createId('doc'),
    revision: 1,
    activeSheetId,
    sheets,
    relationships,
  }
}

function takeTopic(topic: TopicSnapshot, topicId: string): TopicSnapshot | null {
  const directChildIndex = topic.children.findIndex((child) => child.id === topicId)

  if (directChildIndex >= 0) {
    return topic.children.splice(directChildIndex, 1)[0] ?? null
  }

  for (const child of topic.children) {
    const found = takeTopic(child, topicId)

    if (found) {
      return found
    }
  }

  return null
}

function normalizeTopicIdsForBatch(rootTopic: TopicSnapshot, topicIds: string[], excludeRoot = true) {
  const normalizedTopicIds: string[] = []

  for (const topicId of topicIds) {
    if (excludeRoot && topicId === rootTopic.id) {
      continue
    }

    const topic = findTopicById(rootTopic, topicId)

    if (!topic || normalizedTopicIds.includes(topicId)) {
      continue
    }

    if (
      normalizedTopicIds.some((selectedId) => {
        const selectedTopic = findTopicById(rootTopic, selectedId)
        return selectedTopic ? !!findTopicById(selectedTopic, topicId) : false
      })
    ) {
      continue
    }

    for (let index = normalizedTopicIds.length - 1; index >= 0; index -= 1) {
      const selectedTopic = findTopicById(rootTopic, normalizedTopicIds[index]!)

      if (selectedTopic && findTopicById(topic, selectedTopic.id)) {
        normalizedTopicIds.splice(index, 1)
      }
    }

    normalizedTopicIds.push(topicId)
  }

  return normalizedTopicIds
}

function ensureActiveSheet(document: DocumentSnapshot) {
  const activeSheet = getSheetById(document, document.activeSheetId) ?? document.sheets[0]

  if (activeSheet.id !== document.activeSheetId) {
    document.activeSheetId = activeSheet.id
  }

  return activeSheet
}

/// 在文档任意画布中查找主题，用于文档级关系线两端主题的存在性校验。
/// 与 Rust `DocumentEditor::document_contains_topic` 行为一致。
function documentContainsTopic(document: DocumentSnapshot, topicId: string) {
  return document.sheets.some((sheet) => !!findTopicById(sheet.rootTopic, topicId))
}

/// 保持当前活动主题不变；若失效则回退到当前画布根主题。
/// 关系线 / 边界 / 概要的创建删除不改变主题选中状态。
function keepActiveTopicId(document: DocumentSnapshot) {
  const rootTopic = getActiveSheet(document).rootTopic
  return activeTopicId && findTopicById(rootTopic, activeTopicId) ? activeTopicId : rootTopic.id
}

function ensureActiveTopicForDocument(document: DocumentSnapshot) {
  const rootTopic = ensureActiveSheet(document).rootTopic

  if (!activeTopicId || !findTopicById(rootTopic, activeTopicId)) {
    activeTopicId = rootTopic.id
  }

  return rootTopic
}

function createSnapshot(document: DocumentSnapshot): DocumentSessionSnapshot {
  const rootTopic = ensureActiveTopicForDocument(document)

  return {
    document,
    summary: {
      documentId: document.documentId,
      revision: document.revision,
      activeSheetId: document.activeSheetId,
      sheetCount: document.sheets.length,
      topicCount: countTopics(rootTopic),
      rootTopicText: rootTopic.text,
    },
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    nextUndoAction: history[history.length - 1]?.actionLabel ?? null,
    nextRedoAction: future[future.length - 1]?.actionLabel ?? null,
    activeTopicId: activeTopicId ?? rootTopic.id,
    filePath,
    lastSavedAtMs,
    lastAutosavedAtMs,
    hasUnsavedChanges,
    recoveredFromAutosave,
    repairReport,
  }
}

function readRecoverySnapshot(): BrowserRecoverySnapshot | null {
  const raw = getRecoveryStorageItem()

  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as BrowserRecoverySnapshot
  } catch {
    removeRecoveryStorageItem()

    return null
  }
}

function persistRecoverySnapshot(document: DocumentSnapshot) {
  lastAutosavedAtMs = Date.now()

  const recoverySnapshot: BrowserRecoverySnapshot = {
    document,
    activeTopicId,
    lastAutosavedAtMs,
  }

  setRecoveryStorageItem(JSON.stringify(recoverySnapshot))
}

function restoreRecoverySnapshot() {
  const snapshot = readRecoverySnapshot()

  if (!snapshot) {
    return null
  }

  currentDocument = snapshot.document
  history = []
  future = []
  activeTopicId = snapshot.activeTopicId
  filePath = null
  lastSavedAtMs = null
  lastAutosavedAtMs = snapshot.lastAutosavedAtMs
  hasUnsavedChanges = true
  recoveredFromAutosave = true
  repairReport = null

  ensureActiveTopicForDocument(currentDocument)

  return snapshot.document
}

function ensureDocument() {
  if (!currentDocument) {
    throw new Error('当前没有打开的文档')
  }

  return currentDocument
}

function applyMutation(actionLabel: string, mutate: (draft: DocumentSnapshot) => string) {
  const previous = ensureDocument()
  const draft = cloneDocument(previous)
  const nextActiveTopicId = mutate(draft)

  draft.revision += 1
  history.push({
    document: previous,
    actionLabel,
  })
  future = []
  currentDocument = draft
  activeTopicId = nextActiveTopicId
  hasUnsavedChanges = true
  recoveredFromAutosave = false
  repairReport = null
  persistRecoverySnapshot(draft)

  return createSnapshot(draft)
}

function getActionLabel(payload: Record<string, unknown>, fallback: string) {
  return typeof payload.action_label === 'string' && payload.action_label.trim()
    ? payload.action_label.trim()
    : fallback
}

export function resetBrowserSessionForTests(preserveRecovery = false) {
  currentDocument = null
  history = []
  future = []
  activeTopicId = null
  filePath = null
  lastSavedAtMs = null
  lastAutosavedAtMs = null
  hasUnsavedChanges = false
  recoveredFromAutosave = false
  repairReport = null
  browserAssetDataUrls.clear()

  if (!preserveRecovery) {
    removeRecoveryStorageItem()
  }
}

export async function invokeBrowserCommand<TResult>(
  command: string,
  payload: Record<string, unknown> = {},
) {
  switch (command) {
    case 'create_document': {
      currentDocument = createDefaultDocument()
      history = []
      future = []
      activeTopicId = getActiveRootTopic(currentDocument).id
      filePath = null
      lastSavedAtMs = null
      hasUnsavedChanges = false
      recoveredFromAutosave = false
      repairReport = null
      persistRecoverySnapshot(currentDocument)
      return createSnapshot(currentDocument) as TResult
    }
    case 'create_document_from_template': {
      const templateDocument = payload.document as DocumentSnapshot
      currentDocument = regenerateDocumentIds(templateDocument)
      history = []
      future = []
      activeTopicId = getActiveRootTopic(currentDocument).id
      filePath = null
      lastSavedAtMs = null
      hasUnsavedChanges = false
      recoveredFromAutosave = false
      repairReport = null
      persistRecoverySnapshot(currentDocument)
      return createSnapshot(currentDocument) as TResult
    }
    case 'get_document_state': {
      const document = currentDocument ?? restoreRecoverySnapshot()

      return (document ? createSnapshot(document) : null) as TResult
    }
    case 'clear_repair_report': {
      const document = ensureDocument()

      repairReport = null

      return createSnapshot(document) as TResult
    }
    case 'export_markdown_file': {
      throw new Error('浏览器开发态暂不支持 Markdown 导出，请使用桌面版运行')
    }
    case 'import_markdown_file': {
      throw new Error('浏览器开发态暂不支持 Markdown 导入，请使用桌面版运行')
    }
    case 'export_opml_file': {
      throw new Error('浏览器开发态暂不支持 OPML 导出，请使用桌面版运行')
    }
    case 'import_opml_file': {
      throw new Error('浏览器开发态暂不支持 OPML 导入，请使用桌面版运行')
    }
    case 'import_docx_file': {
      throw new Error('浏览器开发态暂不支持 Word 导入，请使用桌面版运行')
    }
    case 'set_document_setting': {
      const key = String(payload.key ?? '').trim()
      if (!key) {
        throw new Error('设置键不能为空')
      }

      // 视图偏好不走历史栈：直接改内存文档并返回快照（与 Rust 行为一致）。
      const document = ensureDocument()
      const settings = { ...(document.settings ?? {}) }
      if (payload.value === null || payload.value === undefined) {
        delete settings[key]
      } else {
        settings[key] = payload.value
      }
      document.settings = settings
      document.revision += 1
      hasUnsavedChanges = true
      recoveredFromAutosave = false
      persistRecoverySnapshot(document)

      return createSnapshot(document) as TResult
    }
    case 'export_png_file': {
      throw new Error('浏览器开发态暂不支持 PNG 导出，请使用桌面版运行')
    }
    case 'export_svg_file': {
      throw new Error('浏览器开发态暂不支持 SVG 导出，请使用桌面版运行')
    }
    case 'select_sheet': {
      return applyMutation('切换画布', (draft) => {
        const sheetId = String(payload.sheet_id)
        const nextSheet = getSheetById(draft, sheetId)

        if (!nextSheet) {
          throw new Error('找不到需要切换的画布')
        }

        draft.activeSheetId = sheetId

        return nextSheet.rootTopic.id
      }) as TResult
    }
    case 'create_sheet': {
      return applyMutation('创建画布', (draft) => {
        const nextSheet = createSheet(`画布 ${draft.sheets.length + 1}`)

        draft.sheets.push(nextSheet)
        draft.activeSheetId = nextSheet.id

        return nextSheet.rootTopic.id
      }) as TResult
    }
    case 'rename_sheet': {
      return applyMutation('重命名画布', (draft) => {
        const sheetId = String(payload.sheet_id)
        const title = String(payload.title ?? '').trim()

        if (!title) {
          throw new Error('画布名称不能为空')
        }

        const sheet = getSheetById(draft, sheetId)

        if (!sheet) {
          throw new Error('找不到需要重命名的画布')
        }

        sheet.title = title

        return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
          ? activeTopicId
          : getActiveSheet(draft).rootTopic.id
      }) as TResult
    }
    case 'delete_sheet': {
      return applyMutation('删除画布', (draft) => {
        const sheetId = String(payload.sheet_id)

        if (draft.sheets.length <= 1) {
          throw new Error('至少需要保留一个画布')
        }

        const sheetIndex = draft.sheets.findIndex((sheet) => sheet.id === sheetId)

        if (sheetIndex === -1) {
          throw new Error('找不到需要删除的画布')
        }

        draft.sheets.splice(sheetIndex, 1)

        if (draft.activeSheetId === sheetId) {
          const nextSheet = draft.sheets[Math.max(0, sheetIndex - 1)] ?? draft.sheets[0]
          draft.activeSheetId = nextSheet.id

          return nextSheet.rootTopic.id
        }

        return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
          ? activeTopicId
          : getActiveSheet(draft).rootTopic.id
      }) as TResult
    }
    case 'move_sheet': {
      return applyMutation(payload.direction === 'down' ? '下移画布' : '上移画布', (draft) => {
        const sheetId = String(payload.sheet_id)
        const direction = payload.direction === 'down' ? 'down' : 'up'
        const currentIndex = draft.sheets.findIndex((sheet) => sheet.id === sheetId)

        if (currentIndex === -1) {
          throw new Error('找不到需要移动的画布')
        }

        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

        if (nextIndex < 0 || nextIndex >= draft.sheets.length) {
          throw new Error('当前画布不能继续移动')
        }

        const [movingSheet] = draft.sheets.splice(currentIndex, 1)
        draft.sheets.splice(nextIndex, 0, movingSheet)

        return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
          ? activeTopicId
          : getActiveSheet(draft).rootTopic.id
      }) as TResult
    }
    case 'set_sheet_chart_type': {
      return applyMutation('切换图表类型', (draft) => {
        const sheetId = String(payload.sheet_id)
        const rawChartType = String(payload.chart_type ?? '').trim().toLowerCase()
        const allowedChartTypes = [
          'mindmap',
          'logic',
          'tree',
          'org',
          'fishbone',
          'timeline',
          'brace',
          'matrix',
          'bubble',
        ] as const

        if (!allowedChartTypes.includes(rawChartType as (typeof allowedChartTypes)[number])) {
          throw new Error(
            `不支持的图表类型“${rawChartType}”，支持 mindmap / logic / tree / org / fishbone / timeline / brace / matrix / bubble`,
          )
        }

        const sheet = getSheetById(draft, sheetId)

        if (!sheet) {
          throw new Error('找不到需要切换图表类型的画布')
        }

        const nextChartType = rawChartType as ChartType
        if (sheet.chartType === nextChartType) {
          return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
            ? activeTopicId
            : getActiveSheet(draft).rootTopic.id
        }

        sheet.chartType = nextChartType

        return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
          ? activeTopicId
          : getActiveSheet(draft).rootTopic.id
      }) as TResult
    }
    case 'set_sheet_branch_style': {
      return applyMutation('设置分支样式', (draft) => {
        const sheetId = String(payload.sheet_id)
        const sheet = getSheetById(draft, sheetId)
        if (!sheet) {
          throw new Error('找不到需要设置分支样式的画布')
        }

        // branch_style 为 null/undefined 时清除覆盖
        const rawBranchStyle = payload.branch_style
        if (rawBranchStyle == null) {
          sheet.branchStyle = undefined
          return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
            ? activeTopicId
            : getActiveSheet(draft).rootTopic.id
        }

        const raw = rawBranchStyle as Record<string, unknown>
        // 校验 edge_type（如提供）
        let edgeType: EdgeType | undefined
        if (raw.edgeType != null) {
          const candidate = String(raw.edgeType).trim().toLowerCase()
          const allowed = ['curve', 'straight', 'elbow'] as const
          if (!allowed.includes(candidate as (typeof allowed)[number])) {
            throw new Error(
              `不支持的连线类型“${candidate}”，支持 curve / straight / elbow`,
            )
          }
          edgeType = candidate as EdgeType
        }

        // 校验 thickness（如提供）
        let thickness: number | undefined
        if (raw.thickness != null) {
          const num = Number(raw.thickness)
          if (!Number.isFinite(num) || num < 0.1 || num > 10) {
            throw new Error('连线粗细超出范围（0.1–10.0）')
          }
          thickness = num
        }

        // 校验 colorPalette（如提供）
        let colorPalette: string[] | undefined
        if (raw.colorPalette != null) {
          if (!Array.isArray(raw.colorPalette)) {
            throw new Error('分支色板必须是字符串数组')
          }
          colorPalette = raw.colorPalette.map((c) => String(c))
        }

        const nextBranchStyle: SheetBranchStyle = {}
        if (edgeType !== undefined) nextBranchStyle.edgeType = edgeType
        if (thickness !== undefined) nextBranchStyle.thickness = thickness
        if (colorPalette !== undefined) nextBranchStyle.colorPalette = colorPalette

        // noop：相同值不入历史栈（与 Rust set_sheet_branch_style_raw 一致）
        if (JSON.stringify(sheet.branchStyle) === JSON.stringify(nextBranchStyle)) {
          return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
            ? activeTopicId
            : getActiveSheet(draft).rootTopic.id
        }

        sheet.branchStyle = nextBranchStyle

        return activeTopicId && findTopicById(getActiveSheet(draft).rootTopic, activeTopicId)
          ? activeTopicId
          : getActiveSheet(draft).rootTopic.id
      }) as TResult
    }
    case 'select_topic': {
      const document = ensureDocument()
      const topicId = String(payload.topic_id)
      const rootTopic = getActiveRootTopic(document)

      if (!findTopicById(rootTopic, topicId)) {
        throw new Error('找不到需要选中的主题')
      }

      activeTopicId = topicId
      recoveredFromAutosave = false

      return createSnapshot(document) as TResult
    }
    case 'create_child_topic': {
      const parentId = String(payload.parent_id)

      return applyMutation('创建子主题', (draft) => {
        const parent = findTopicById(getActiveRootTopic(draft), parentId)

        if (!parent) {
          throw new Error('找不到父主题')
        }

        const nextTopic = createTopic('新建子主题')

        parent.collapsed = false
        parent.children.push(nextTopic)

        return nextTopic.id
      }) as TResult
    }
    case 'create_sibling_topic': {
      const topicId = String(payload.topic_id)
      const position = payload.position === 'before' ? 'before' : 'after'
      const label = position === 'before' ? '前插同级主题' : '创建同级主题'

      return applyMutation(label, (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (rootTopic.id === topicId) {
          throw new Error('根主题不支持创建同级主题')
        }

        const parentMatch = findParentTopicByChildId(rootTopic, topicId)

        if (!parentMatch) {
          throw new Error('找不到目标主题的父主题')
        }

        const nextTopic = createTopic('新建同级主题')
        const insertIndex = position === 'before' ? parentMatch.index : parentMatch.index + 1

        parentMatch.parent.children.splice(insertIndex, 0, nextTopic)

        return nextTopic.id
      }) as TResult
    }
    case 'create_parent_topic': {
      const topicId = String(payload.topic_id)

      return applyMutation('插入父主题', (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (rootTopic.id === topicId) {
          throw new Error('根主题不支持创建父主题')
        }

        const parentMatch = findParentTopicByChildId(rootTopic, topicId)

        if (!parentMatch) {
          throw new Error('找不到目标主题的父主题')
        }

        const newParent = createTopic('新建父主题')
        const [removed] = parentMatch.parent.children.splice(parentMatch.index, 1)
        parentMatch.parent.children.splice(parentMatch.index, 0, newParent)
        newParent.children.push(removed)

        return newParent.id
      }) as TResult
    }
    case 'create_floating_topic': {
      const text = String(payload.text ?? '新建浮动主题')
      const offsetX = Number(payload.offset_x ?? 0)
      const offsetY = Number(payload.offset_y ?? 0)

      return applyMutation('创建浮动主题', (draft) => {
        const sheet = getActiveSheet(draft)
        const newTopic = createTopic(text)
        newTopic.layoutHints = {
          offsetX,
          offsetY,
        }
        if (!sheet.floatingTopics) {
          sheet.floatingTopics = []
        }
        sheet.floatingTopics.push(newTopic)

        return newTopic.id
      }) as TResult
    }
    case 'rename_topic': {
      const topicId = String(payload.topic_id)
      const text = String(payload.text ?? '').trim()

      if (!text) {
        throw new Error('主题文本不能为空')
      }

      return applyMutation('重命名主题', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)

        if (!topic) {
          throw new Error('找不到需要重命名的主题')
        }

        topic.text = text

        return topicId
      }) as TResult
    }
    case 'delete_topic': {
      const topicId = String(payload.topic_id)

      return applyMutation('删除主题', (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (rootTopic.id === topicId) {
          throw new Error('根主题不能删除')
        }

        const parentMatch = findParentTopicByChildId(rootTopic, topicId)

        if (!parentMatch) {
          throw new Error('找不到目标主题的父主题')
        }

        parentMatch.parent.children.splice(parentMatch.index, 1)

        return parentMatch.parent.id
      }) as TResult
    }
    case 'delete_topics': {
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((topicId) => String(topicId))
        : []

      return applyMutation(getActionLabel(payload, `删除 ${topicIds.length} 个主题`), (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (topicIds.includes(rootTopic.id)) {
          throw new Error('根主题不能删除')
        }

        const normalizedTopicIds = topicIds.filter(
          (topicId, index) =>
            !!findTopicById(rootTopic, topicId) &&
            topicIds.indexOf(topicId) === index &&
            !topicIds.some((candidateId) => {
              if (candidateId === topicId) {
                return false
              }

              const candidateTopic = findTopicById(rootTopic, candidateId)

              return candidateTopic ? !!findTopicById(candidateTopic, topicId) : false
            }),
        )

        if (normalizedTopicIds.length === 0) {
          throw new Error('没有可删除的主题')
        }

        let nextActiveTopicId = rootTopic.id

        for (const topicId of normalizedTopicIds) {
          const parentMatch = findParentTopicByChildId(rootTopic, topicId)

          if (!parentMatch) {
            continue
          }

          parentMatch.parent.children.splice(parentMatch.index, 1)
          nextActiveTopicId = parentMatch.parent.id
        }

        return nextActiveTopicId
      }) as TResult
    }
    case 'toggle_topic_collapsed': {
      const topicId = String(payload.topic_id)

      return applyMutation('切换主题折叠状态', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)

        if (!topic) {
          throw new Error('找不到需要折叠的主题')
        }

        if (topic.children.length === 0) {
          throw new Error('当前主题没有可折叠的子主题')
        }

        topic.collapsed = !topic.collapsed

        return topicId
      }) as TResult
    }
    case 'set_topic_notes': {
      const topicId = String(payload.topic_id)
      const nextNotes = payload.notes == null ? undefined : String(payload.notes)

      return applyMutation('编辑备注', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑备注的主题')
        }
        topic.notes = nextNotes
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_image': {
      const topicId = String(payload.topic_id)
      const sourcePath = String(payload.source_path ?? '')
      const dataUrl = await resolveBrowserImageDataUrl(sourcePath)
      const assetId = registerBrowserAssetDataUrl(dataUrl)

      return applyMutation('插入图片', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要插入图片的主题')
        }
        topic.image = { assetId }
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'remove_topic_image': {
      const topicId = String(payload.topic_id)

      return applyMutation('移除图片', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要移除图片的主题')
        }
        topic.image = undefined
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'read_asset_data_url': {
      // 资源缺失时返回空串，渲染层静默降级（不显示图片）
      return (browserAssetDataUrls.get(String(payload.asset_id)) ?? '') as TResult
    }
    case 'set_topic_link': {
      const topicId = String(payload.topic_id)
      const nextLink = (payload.link == null ? undefined : (payload.link as TopicLink)) ?? undefined

      return applyMutation('编辑链接', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑链接的主题')
        }
        topic.link = nextLink
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_markers': {
      const topicId = String(payload.topic_id)
      const nextMarkers = Array.isArray(payload.markers)
        ? (payload.markers as TopicMarker[])
        : []

      return applyMutation('编辑标记', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑标记的主题')
        }
        topic.markers = nextMarkers
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_labels': {
      const topicId = String(payload.topic_id)
      const nextLabels = Array.isArray(payload.labels) ? (payload.labels as string[]) : []

      return applyMutation('编辑标签', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑标签的主题')
        }
        topic.labels = nextLabels
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_task': {
      const topicId = String(payload.topic_id)
      const nextTask = (payload.task == null ? undefined : (payload.task as TopicTask)) ?? undefined

      return applyMutation('编辑任务', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑任务的主题')
        }
        topic.task = nextTask
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_style_ref': {
      const topicId = String(payload.topic_id)
      const nextStyleRef =
        payload.style_ref == null ? undefined : String(payload.style_ref)

      return applyMutation('编辑样式', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑样式的主题')
        }
        topic.styleRef = nextStyleRef
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_topic_style_overrides': {
      const topicId = String(payload.topic_id)
      const nextOverrides =
        payload.style_overrides == null
          ? undefined
          : (payload.style_overrides as TopicStyleOverrides)

      return applyMutation('编辑样式', (draft) => {
        const topic = findTopicById(getActiveRootTopic(draft), topicId)
        if (!topic) {
          throw new Error('找不到需要编辑样式的主题')
        }
        topic.styleOverrides = nextOverrides
        return activeTopicId ?? topicId
      }) as TResult
    }
    case 'set_document_theme': {
      const rawThemeId =
        payload.theme_id == null ? null : String(payload.theme_id).trim()
      const nextThemeId = rawThemeId && rawThemeId.length > 0 ? rawThemeId : null

      // noop：相同主题不入历史栈（与 Rust set_document_theme_raw 一致）
      const currentThemeId = ensureDocument().theme?.id ?? null
      if (currentThemeId === nextThemeId) {
        return createSnapshot(ensureDocument()) as TResult
      }

      return applyMutation('切换文档主题', (draft) => {
        draft.theme = nextThemeId ? { id: nextThemeId } : undefined
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'create_relationship': {
      const fromTopicId = String(payload.from_topic_id)
      const toTopicId = String(payload.to_topic_id)
      const label =
        payload.label == null ? undefined : String(payload.label)

      return applyMutation('创建关系线', (draft) => {
        if (fromTopicId === toTopicId) {
          throw new Error('关系线的两端不能是同一个主题')
        }
        if (!documentContainsTopic(draft, fromTopicId)) {
          throw new Error('找不到关系线的起始主题')
        }
        if (!documentContainsTopic(draft, toTopicId)) {
          throw new Error('找不到关系线的目标主题')
        }

        if (!draft.relationships) {
          draft.relationships = []
        }
        draft.relationships.push({
          id: createId('rel'),
          fromTopicId,
          toTopicId,
          label,
        })
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'delete_relationship': {
      const relationshipId = String(payload.relationship_id)

      return applyMutation('删除关系线', (draft) => {
        const relationships = draft.relationships ?? []
        const index = relationships.findIndex((rel) => rel.id === relationshipId)

        if (index === -1) {
          throw new Error('找不到需要删除的关系线')
        }

        relationships.splice(index, 1)
        if (relationships.length === 0) {
          draft.relationships = undefined
        } else {
          draft.relationships = relationships
        }
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'create_boundary': {
      const sheetId = String(payload.sheet_id)
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((id) => String(id))
        : []
      const label = payload.label == null ? undefined : String(payload.label)

      return applyMutation('创建边界', (draft) => {
        const sheet = getSheetById(draft, sheetId)
        if (!sheet) {
          throw new Error('找不到需要创建边界的画布')
        }

        for (const topicId of topicIds) {
          if (!findTopicById(sheet.rootTopic, topicId)) {
            throw new Error('边界包含的主题不存在')
          }
        }

        if (!sheet.boundaries) {
          sheet.boundaries = []
        }
        sheet.boundaries.push({
          id: createId('boundary'),
          topicIds,
          label,
        })
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'delete_boundary': {
      const sheetId = String(payload.sheet_id)
      const boundaryId = String(payload.boundary_id)

      return applyMutation('删除边界', (draft) => {
        const sheet = getSheetById(draft, sheetId)
        if (!sheet) {
          throw new Error('找不到边界所在的画布')
        }

        const boundaries = sheet.boundaries ?? []
        const index = boundaries.findIndex((b) => b.id === boundaryId)

        if (index === -1) {
          throw new Error('找不到需要删除的边界')
        }

        boundaries.splice(index, 1)
        if (boundaries.length === 0) {
          sheet.boundaries = undefined
        } else {
          sheet.boundaries = boundaries
        }
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'create_summary': {
      const sheetId = String(payload.sheet_id)
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((id) => String(id))
        : []
      const label = String(payload.label ?? '').trim()

      return applyMutation('创建概要', (draft) => {
        const sheet = getSheetById(draft, sheetId)
        if (!sheet) {
          throw new Error('找不到需要创建概要的画布')
        }

        for (const topicId of topicIds) {
          if (!findTopicById(sheet.rootTopic, topicId)) {
            throw new Error('概要包含的主题不存在')
          }
        }

        if (!sheet.summaries) {
          sheet.summaries = []
        }
        sheet.summaries.push({
          id: createId('summary'),
          topicIds,
          label,
        })
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'delete_summary': {
      const sheetId = String(payload.sheet_id)
      const summaryId = String(payload.summary_id)

      return applyMutation('删除概要', (draft) => {
        const sheet = getSheetById(draft, sheetId)
        if (!sheet) {
          throw new Error('找不到概要所在的画布')
        }

        const summaries = sheet.summaries ?? []
        const index = summaries.findIndex((s) => s.id === summaryId)

        if (index === -1) {
          throw new Error('找不到需要删除的概要')
        }

        summaries.splice(index, 1)
        if (summaries.length === 0) {
          sheet.summaries = undefined
        } else {
          sheet.summaries = summaries
        }
        return keepActiveTopicId(draft)
      }) as TResult
    }
    case 'move_topic': {
      const topicId = String(payload.topic_id)
      const targetParentId = String(payload.target_parent_id)

      return applyMutation(getActionLabel(payload, '移动主题'), (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (rootTopic.id === topicId) {
          throw new Error('根主题不能移动')
        }

        if (topicId === targetParentId) {
          throw new Error('主题不能移动到自身下面')
        }

        const movingTopic = findTopicById(rootTopic, topicId)

        if (!movingTopic) {
          throw new Error('找不到需要移动的主题')
        }

        if (findTopicById(movingTopic, targetParentId)) {
          throw new Error('主题不能移动到自己的子树下面')
        }

        const parentMatch = findParentTopicByChildId(rootTopic, topicId)

        if (!parentMatch) {
          throw new Error('无法从原位置移除主题')
        }

        const [detachedTopic] = parentMatch.parent.children.splice(parentMatch.index, 1)
        const targetParent = findTopicById(rootTopic, targetParentId)

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        targetParent.collapsed = false
        targetParent.children.push(detachedTopic)

        return topicId
      }) as TResult
    }
    case 'move_topics': {
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((topicId) => String(topicId))
        : []
      const targetParentId = String(payload.target_parent_id)

      return applyMutation(getActionLabel(payload, `批量移动 ${topicIds.length} 个主题`), (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (topicIds.includes(rootTopic.id)) {
          throw new Error('根主题不能批量移动')
        }

        const normalizedTopicIds = normalizeTopicIdsForBatch(rootTopic, topicIds)

        if (normalizedTopicIds.length === 0) {
          throw new Error('没有可移动的主题')
        }

        for (const topicId of normalizedTopicIds) {
          if (topicId === targetParentId) {
            throw new Error('主题不能移动到自身下面')
          }

          const movingTopic = findTopicById(rootTopic, topicId)

          if (!movingTopic) {
            continue
          }

          if (findTopicById(movingTopic, targetParentId)) {
            throw new Error('主题不能移动到自己的子树下面')
          }
        }

        const targetParent = findTopicById(rootTopic, targetParentId)

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        targetParent.collapsed = false
        let nextActiveTopicId = normalizedTopicIds[0] ?? rootTopic.id
        let movedCount = 0

        for (const topicId of normalizedTopicIds) {
          const parentMatch = findParentTopicByChildId(rootTopic, topicId)

          if (parentMatch?.parent.id === targetParentId) {
            continue
          }

          const detachedTopic = takeTopic(rootTopic, topicId)

          if (!detachedTopic) {
            continue
          }

          targetParent.children.push(detachedTopic)
          nextActiveTopicId = topicId
          movedCount += 1
        }

        if (movedCount === 0) {
          throw new Error('所选主题已经都在这个父主题下面了')
        }

        return nextActiveTopicId
      }) as TResult
    }
    case 'move_topic_in_parent': {
      const topicId = String(payload.topic_id)
      const direction = payload.direction === 'down' ? 'down' : 'up'

      return applyMutation(direction === 'down' ? '下移主题' : '上移主题', (draft) => {
        const rootTopic = getActiveRootTopic(draft)

        if (rootTopic.id === topicId) {
          throw new Error('根主题不能调整同级顺序')
        }

        const parentMatch = findParentTopicByChildId(rootTopic, topicId)

        if (!parentMatch) {
          throw new Error('找不到目标主题的父主题')
        }

        const nextIndex = direction === 'up' ? parentMatch.index - 1 : parentMatch.index + 1

        if (nextIndex < 0 || nextIndex >= parentMatch.parent.children.length) {
          throw new Error('当前主题不能继续移动')
        }

        const [movingTopic] = parentMatch.parent.children.splice(parentMatch.index, 1)

        parentMatch.parent.children.splice(nextIndex, 0, movingTopic)

        return topicId
      }) as TResult
    }
    case 'move_topic_to_sheet': {
      const topicId = String(payload.topic_id)
      const targetSheetId = String(payload.target_sheet_id)
      const targetParentId =
        typeof payload.target_parent_id === 'string' && payload.target_parent_id.trim()
          ? payload.target_parent_id.trim()
          : null

      return applyMutation(getActionLabel(payload, '移动主题到其他画布'), (draft) => {
        const sourceSheetIndex = draft.sheets.findIndex((sheet) =>
          findTopicById(sheet.rootTopic, topicId),
        )
        const targetSheetIndex = draft.sheets.findIndex((sheet) => sheet.id === targetSheetId)

        if (sourceSheetIndex === -1) {
          throw new Error('找不到需要移动的主题')
        }

        if (targetSheetIndex === -1) {
          throw new Error('找不到目标画布')
        }

        if (draft.sheets[sourceSheetIndex].rootTopic.id === topicId) {
          throw new Error('根主题不能移动到其他画布')
        }

        if (sourceSheetIndex === targetSheetIndex) {
          throw new Error('当前主题已经在目标画布中')
        }

        const detachedTopic = takeTopic(draft.sheets[sourceSheetIndex].rootTopic, topicId)

        if (!detachedTopic) {
          throw new Error('无法从原位置移除主题')
        }

        const targetRootTopic = draft.sheets[targetSheetIndex].rootTopic
        const targetParent = targetParentId
          ? findTopicById(targetRootTopic, targetParentId)
          : targetRootTopic

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        targetParent.collapsed = false
        targetParent.children.push(detachedTopic)
        draft.activeSheetId = targetSheetId

        return topicId
      }) as TResult
    }
    case 'move_topics_to_sheet': {
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((topicId) => String(topicId))
        : []
      const targetSheetId = String(payload.target_sheet_id)
      const targetParentId =
        typeof payload.target_parent_id === 'string' && payload.target_parent_id.trim()
          ? payload.target_parent_id.trim()
          : null

      return applyMutation(
        getActionLabel(payload, `批量移动 ${topicIds.length} 个主题到其他画布`),
        (draft) => {
        const activeRootTopic = getActiveRootTopic(draft)

        if (topicIds.includes(activeRootTopic.id)) {
          throw new Error('根主题不能移动到其他画布')
        }

        const normalizedTopicIds = normalizeTopicIdsForBatch(activeRootTopic, topicIds)

        if (normalizedTopicIds.length === 0) {
          throw new Error('没有可移动的主题')
        }

        const sourceSheetIndex = draft.sheets.findIndex(
          (sheet) => sheet.id === draft.activeSheetId,
        )
        const targetSheetIndex = draft.sheets.findIndex((sheet) => sheet.id === targetSheetId)

        if (sourceSheetIndex === -1) {
          throw new Error('找不到当前画布')
        }

        if (targetSheetIndex === -1) {
          throw new Error('找不到目标画布')
        }

        if (sourceSheetIndex === targetSheetIndex) {
          throw new Error('所选主题已经都在目标画布中')
        }

        const targetRootTopic = draft.sheets[targetSheetIndex].rootTopic
        const targetParent = targetParentId
          ? findTopicById(targetRootTopic, targetParentId)
          : targetRootTopic

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        targetParent.collapsed = false
        let nextActiveTopicId = normalizedTopicIds[0] ?? targetRootTopic.id
        let movedCount = 0

        for (const topicId of normalizedTopicIds) {
          const detachedTopic = takeTopic(draft.sheets[sourceSheetIndex].rootTopic, topicId)

          if (!detachedTopic) {
            continue
          }

          targetParent.children.push(detachedTopic)
          nextActiveTopicId = topicId
          movedCount += 1
        }

        if (movedCount === 0) {
          throw new Error('没有可移动的主题')
        }

        draft.activeSheetId = targetSheetId

        return nextActiveTopicId
        },
      ) as TResult
    }
    case 'copy_topic_to_sheet': {
      const topicId = String(payload.topic_id)
      const targetSheetId = String(payload.target_sheet_id)
      const targetParentId =
        typeof payload.target_parent_id === 'string' && payload.target_parent_id.trim()
          ? payload.target_parent_id.trim()
          : null

      return applyMutation(getActionLabel(payload, '复制主题到其他画布'), (draft) => {
        const sourceSheet = draft.sheets.find((sheet) => findTopicById(sheet.rootTopic, topicId))
        const targetSheet = draft.sheets.find((sheet) => sheet.id === targetSheetId)

        if (!sourceSheet) {
          throw new Error('找不到需要复制的主题')
        }

        if (!targetSheet) {
          throw new Error('找不到目标画布')
        }

        if (sourceSheet.rootTopic.id === topicId) {
          throw new Error('根主题不能复制到其他画布')
        }

        const sourceTopic = findTopicById(sourceSheet.rootTopic, topicId)

        if (!sourceTopic) {
          throw new Error('找不到需要复制的主题')
        }

        const targetParent = targetParentId
          ? findTopicById(targetSheet.rootTopic, targetParentId)
          : targetSheet.rootTopic

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        const clonedTopic = cloneTopicBranch(sourceTopic)

        targetParent.collapsed = false
        targetParent.children.push(clonedTopic)
        draft.activeSheetId = targetSheetId

        return clonedTopic.id
      }) as TResult
    }
    case 'copy_topics_to_sheet': {
      const topicIds = Array.isArray(payload.topic_ids)
        ? payload.topic_ids.map((topicId) => String(topicId))
        : []
      const targetSheetId = String(payload.target_sheet_id)
      const targetParentId =
        typeof payload.target_parent_id === 'string' && payload.target_parent_id.trim()
          ? payload.target_parent_id.trim()
          : null

      return applyMutation(
        getActionLabel(payload, `批量复制 ${topicIds.length} 个主题到其他画布`),
        (draft) => {
        const sourceSheet = draft.sheets.find((sheet) => sheet.id === draft.activeSheetId)
        const targetSheet = draft.sheets.find((sheet) => sheet.id === targetSheetId)

        if (!sourceSheet) {
          throw new Error('找不到当前画布')
        }

        if (!targetSheet) {
          throw new Error('找不到目标画布')
        }

        if (topicIds.includes(sourceSheet.rootTopic.id)) {
          throw new Error('根主题不能复制到其他画布')
        }

        const normalizedTopicIds = normalizeTopicIdsForBatch(sourceSheet.rootTopic, topicIds)

        if (normalizedTopicIds.length === 0) {
          throw new Error('没有可复制的主题')
        }

        const targetParent = targetParentId
          ? findTopicById(targetSheet.rootTopic, targetParentId)
          : targetSheet.rootTopic

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        targetParent.collapsed = false
        let nextActiveTopicId = targetParent.id

        for (const topicId of normalizedTopicIds) {
          const sourceTopic = findTopicById(sourceSheet.rootTopic, topicId)

          if (!sourceTopic) {
            continue
          }

          const clonedTopic = cloneTopicBranch(sourceTopic)
          nextActiveTopicId = clonedTopic.id
          targetParent.children.push(clonedTopic)
        }

        draft.activeSheetId = targetSheetId

        return nextActiveTopicId
        },
      ) as TResult
    }
    case 'paste_topics': {
      const topics = Array.isArray(payload.topics) ? payload.topics : []
      const targetParentId = String(payload.target_parent_id)

      return applyMutation('粘贴主题', (draft) => {
        const targetParent = findTopicById(getActiveRootTopic(draft), targetParentId)

        if (!targetParent) {
          throw new Error('找不到目标父主题')
        }

        if (topics.length === 0) {
          throw new Error('没有可粘贴的主题')
        }

        targetParent.collapsed = false

        const clonedTopics = topics.map((topic) =>
          cloneTopicBranch(topic as DocumentSnapshot['sheets'][number]['rootTopic']),
        )

        targetParent.children.push(...clonedTopics)

        return clonedTopics[0].id
      }) as TResult
    }
    case 'undo_document_command': {
      if (history.length === 0) {
        throw new Error('没有可撤销的操作')
      }

      const previous = history.pop()!
      future.push({
        document: ensureDocument(),
        actionLabel: previous.actionLabel,
      })
      currentDocument = previous.document
      hasUnsavedChanges = true
      repairReport = null

      ensureActiveTopicForDocument(previous.document)

      recoveredFromAutosave = false
      persistRecoverySnapshot(previous.document)

      return createSnapshot(previous.document) as TResult
    }
    case 'redo_document_command': {
      if (future.length === 0) {
        throw new Error('没有可重做的操作')
      }

      const next = future.pop()!
      history.push({
        document: ensureDocument(),
        actionLabel: next.actionLabel,
      })
      currentDocument = next.document
      hasUnsavedChanges = true
      repairReport = null

      ensureActiveTopicForDocument(next.document)

      recoveredFromAutosave = false
      persistRecoverySnapshot(next.document)

      return createSnapshot(next.document) as TResult
    }
    default:
      throw new Error(`浏览器回退层暂不支持命令：${command}`)
  }
}
