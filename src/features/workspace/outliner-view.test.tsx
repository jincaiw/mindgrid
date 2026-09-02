import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { TopicSnapshot } from '../../lib/document/types'
import type { DocumentSession } from '../document/use-document-session'
import { OutlinerView } from './outliner-view'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

/** 构造最小可用 DocumentSession 子集（仅主题相关字段），其余以 no-op 占位。 */
function makeSession(overrides: {
  rootTopic?: ReturnType<typeof makeTopic>
  activeTopicId?: string
  selectTopic?: ReturnType<typeof vi.fn>
  createChildTopic?: ReturnType<typeof vi.fn>
  createSiblingTopic?: ReturnType<typeof vi.fn>
  moveTopicInParent?: ReturnType<typeof vi.fn>
  deleteTopic?: ReturnType<typeof vi.fn>
  renameTopic?: ReturnType<typeof vi.fn>
  toggleTopicCollapsed?: ReturnType<typeof vi.fn>
} = {}): DocumentSession {
  const rootTopic =
    overrides.rootTopic ??
    makeTopic('topic_root', '中心主题', [
      makeTopic('topic_plan', '规划主题'),
      makeTopic('topic_review', '复盘主题'),
    ])
  const noop = vi.fn(async () => {})
  return {
    status: 'ready',
    document: {
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheets: [{ id: 'sheet_1', title: '主画布', rootTopic }],
    },
    summary: {
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheetCount: 1,
      topicCount: 3,
      rootTopicText: '中心主题',
    },
    activeTopicId: overrides.activeTopicId ?? 'topic_root',
    canUndo: false,
    canRedo: false,
    nextUndoAction: null,
    nextRedoAction: null,
    filePath: null,
    lastSavedAtMs: null,
    lastAutosavedAtMs: null,
    hasUnsavedChanges: false,
    recoveredFromAutosave: false,
    repairReport: null,
    error: null,
    canRepairLastFailedOpen: false,
    recentAction: '已创建默认文档',
    recentActions: [],
    createNewDocument: noop,
    createFromTemplate: noop,
    openDocument: noop,
    repairLastFailedOpen: noop,
    clearRepairReport: noop,
    saveDocument: noop,
    saveDocumentAs: noop,
    exportMarkdownOutline: noop,
    importMarkdownOutline: noop,
    exportOpmlOutline: noop,
importOpmlOutline: noop,
importDocxOutline: noop,
    exportPngImage: noop,
    exportSvgImage: noop,
    exportGanttImage: async () => {},
    exportGanttPng: async () => {},
    exportRecoveryCopy: noop,
    selectSheet: noop,
    createSheet: noop,
    renameSheet: noop,
    deleteSheet: noop,
    moveSheet: noop,
    setSheetChartType: noop,
    setSheetBranchStyle: noop,
    selectTopic: overrides.selectTopic ?? noop,
    createChildTopic: overrides.createChildTopic ?? noop,
    createSiblingTopic: overrides.createSiblingTopic ?? noop,
    createParentTopic: noop,
    createFloatingTopic: noop,
    renameTopic: overrides.renameTopic ?? noop,
    deleteTopic: overrides.deleteTopic ?? noop,
    deleteTopics: noop,
    toggleTopicCollapsed: overrides.toggleTopicCollapsed ?? noop,
    setTopicNotes: noop,
  setTopicImage: noop,
  removeTopicImage: noop,
  readAssetDataUrl: async () => '',
    setTopicLink: noop,
    setTopicMarkers: noop,
    setTopicLabels: noop,
    setTopicTask: noop,
    setTopicStyleRef: noop,
    setTopicStyleOverrides: noop,
    setDocumentTheme: noop,
    setDocumentSetting: noop,
    createRelationship: noop,
    deleteRelationship: noop,
    createBoundary: noop,
    deleteBoundary: noop,
    createSummary: noop,
    deleteSummary: noop,
    moveTopic: noop,
    moveTopics: noop,
    moveTopicInParent: overrides.moveTopicInParent ?? noop,
    moveTopicToSheet: noop,
    moveTopicsToSheet: noop,
    copyTopicToSheet: noop,
    copyTopicsToSheet: noop,
    pasteTopics: noop,
    undo: noop,
    redo: noop,
  } as unknown as DocumentSession
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OutlinerView', () => {
  function renderOutliner(props: {
    session: DocumentSession
    onExit?: () => void
    selectedTopicIds?: string[]
    onSelectedTopicIdsChange?: (topicIds: string[]) => void
  }) {
    const onExit = props.onExit ?? (() => {})
    const onSelectedTopicIdsChange = props.onSelectedTopicIdsChange ?? (() => {})
    const selectedTopicIds = props.selectedTopicIds ?? [props.session.activeTopicId ?? 'topic_root']
    return renderWithApp(
      <OutlinerView
        session={props.session}
        selectedTopicIds={selectedTopicIds}
        onSelectedTopicIdsChange={onSelectedTopicIdsChange}
        onExit={onExit}
      />,
    )
  }

  it('renders the sheet title, topic count, and the full topic tree', () => {
    renderOutliner({ session: makeSession() })

    const region = screen.getByRole('region', { name: '大纲全屏视图' })
    expect(within(region).getByText('主画布')).toBeInTheDocument()
    expect(within(region).getByText('3 个主题')).toBeInTheDocument()
    expect(within(region).getByText('规划主题')).toBeInTheDocument()
    expect(within(region).getByText('复盘主题')).toBeInTheDocument()
  })

  it('disables sibling/move/delete actions for the root topic', () => {
    renderOutliner({ session: makeSession({ activeTopicId: 'topic_root' }) })

    const tree = screen.getByRole('list', { name: '大纲主题树' })
    const rootButton = within(tree).getByText('中心主题').closest('button')!
    expect(rootButton).toHaveClass('topic-tree__button--active')

    expect(screen.getByRole('button', { name: '同级' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上移' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled()
  })

  it('creates a child topic and a sibling topic via the action buttons', () => {
    const createChildTopic = vi.fn(async () => {})
    const createSiblingTopic = vi.fn(async () => {})
    renderOutliner({
      session: makeSession({
        activeTopicId: 'topic_plan',
        createChildTopic,
        createSiblingTopic,
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: '子主题' }))
    expect(createChildTopic).toHaveBeenCalledWith('topic_plan')

    fireEvent.click(screen.getByRole('button', { name: '同级' }))
    expect(createSiblingTopic).toHaveBeenCalledWith('topic_plan', 'after')
  })

  it('renames the active topic via the header input on Enter', () => {
    const renameTopic = vi.fn(async () => {})
    renderOutliner({ session: makeSession({ activeTopicId: 'topic_plan', renameTopic }) })

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '更新后的规划' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(renameTopic).toHaveBeenCalledWith('topic_plan', '更新后的规划')
  })

  it('navigates selection with ArrowDown from the root topic', () => {
    const selectTopic = vi.fn(async () => {})
    renderOutliner({ session: makeSession({ activeTopicId: 'topic_root', selectTopic }) })

    const region = screen.getByRole('region', { name: '大纲全屏视图' })
    ;(region as HTMLElement).focus()
    fireEvent.keyDown(region, { key: 'ArrowDown' })
    expect(selectTopic).toHaveBeenCalledWith('topic_plan')
  })

  it('navigates selection with ArrowUp from the last topic', () => {
    const selectTopic = vi.fn(async () => {})
    renderOutliner({ session: makeSession({ activeTopicId: 'topic_review', selectTopic }) })

    const region = screen.getByRole('region', { name: '大纲全屏视图' })
    ;(region as HTMLElement).focus()
    fireEvent.keyDown(region, { key: 'ArrowUp' })
    expect(selectTopic).toHaveBeenCalledWith('topic_plan')
  })

  it('deletes the active (non-root) topic on Delete', () => {
    const deleteTopic = vi.fn(async () => {})
    renderOutliner({ session: makeSession({ activeTopicId: 'topic_plan', deleteTopic }) })

    const region = screen.getByRole('region', { name: '大纲全屏视图' })
    fireEvent.keyDown(region, { key: 'Delete' })
    expect(deleteTopic).toHaveBeenCalledWith('topic_plan')
  })

  it('exits on Escape', () => {
    const onExit = vi.fn(() => {})
    renderOutliner({ session: makeSession(), onExit })

    const region = screen.getByRole('region', { name: '大纲全屏视图' })
    fireEvent.keyDown(region, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('renders an empty state when there is no document', () => {
    const session = makeSession()
    // 模拟无文档：直接构造一个 document 为 null 的会话
    const emptySession = { ...session, document: null } as unknown as DocumentSession
    renderOutliner({ session: emptySession })

    const region = screen.getByRole('region', { name: '大纲视图' })
    expect(within(region).getByText('当前没有可显示的画布。')).toBeInTheDocument()
  })
})
