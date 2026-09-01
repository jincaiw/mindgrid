import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import type { DocumentSession } from '../document/use-document-session'
import { SheetTabBar } from './sheet-tab-bar'

/** 构造最小可用 DocumentSession 子集（仅画布相关字段），其余以 no-op 占位。 */
function makeSession(overrides: {
  sheets?: Array<{ id: string; title: string; rootTopic: { id: string; text: string } }>
  activeSheetId?: string
  selectSheet?: ReturnType<typeof vi.fn>
  createSheet?: ReturnType<typeof vi.fn>
  renameSheet?: ReturnType<typeof vi.fn>
  deleteSheet?: ReturnType<typeof vi.fn>
  moveSheet?: ReturnType<typeof vi.fn>
} = {}): DocumentSession {
  const sheets =
    overrides.sheets ?? [
      { id: 'sheet_1', title: '主画布', rootTopic: { id: 'topic_root', text: '中心主题' } },
      { id: 'sheet_2', title: '第二画布', rootTopic: { id: 'topic_root_2', text: '第二中心主题' } },
    ]
  const noop = vi.fn(async () => {})
  return {
    status: 'ready',
    document: {
      schemaVersion: '1.0.0',
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: overrides.activeSheetId ?? sheets[0].id,
      sheets,
    },
    summary: {
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: overrides.activeSheetId ?? sheets[0].id,
      sheetCount: sheets.length,
      topicCount: 2,
      rootTopicText: '中心主题',
    },
    activeTopicId: 'topic_root',
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
    exportPngImage: noop,
    exportSvgImage: noop,
    exportRecoveryCopy: noop,
    selectSheet: overrides.selectSheet ?? noop,
    createSheet: overrides.createSheet ?? noop,
    renameSheet: overrides.renameSheet ?? noop,
    deleteSheet: overrides.deleteSheet ?? noop,
    moveSheet: overrides.moveSheet ?? noop,
    setSheetChartType: noop,
    setSheetBranchStyle: noop,
    selectTopic: noop,
    createChildTopic: noop,
    createSiblingTopic: noop,
    createParentTopic: noop,
    createFloatingTopic: noop,
    renameTopic: noop,
    deleteTopic: noop,
    deleteTopics: noop,
    toggleTopicCollapsed: noop,
    setTopicNotes: noop,
    setTopicLink: noop,
    setTopicMarkers: noop,
    setTopicLabels: noop,
    setTopicTask: noop,
    setTopicStyleRef: noop,
    setTopicStyleOverrides: noop,
    setDocumentTheme: noop,
    createRelationship: noop,
    deleteRelationship: noop,
    createBoundary: noop,
    deleteBoundary: noop,
    createSummary: noop,
    deleteSummary: noop,
    moveTopic: noop,
    moveTopics: noop,
    moveTopicInParent: noop,
    moveTopicToSheet: noop,
    moveTopicsToSheet: noop,
    copyTopicToSheet: noop,
    copyTopicsToSheet: noop,
    pasteTopics: noop,
    undo: noop,
    redo: noop,
  } as unknown as DocumentSession
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SheetTabBar', () => {
  it('renders one tab per sheet and marks the active sheet', () => {
    renderWithApp(<SheetTabBar session={makeSession({ activeSheetId: 'sheet_2' })} />)

    const bar = screen.getByRole('tablist', { name: '画布标签栏' })
    const tabs = within(bar).getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(within(bar).getByText('主画布')).toBeInTheDocument()
    expect(within(bar).getByText('第二画布')).toBeInTheDocument()
    expect(within(bar).getByText('第二画布').closest('[data-sheet-tab]')).toHaveClass(
      'sheet-tab-bar__tab--active',
    )
  })

  it('switches sheets on click', () => {
    const selectSheet = vi.fn(async () => {})
    renderWithApp(<SheetTabBar session={makeSession({ selectSheet })} />)

    fireEvent.click(screen.getByText('第二画布'))
    expect(selectSheet).toHaveBeenCalledWith('sheet_2')
  })

  it('creates a new sheet via the + button', () => {
    const createSheet = vi.fn(async () => {})
    renderWithApp(<SheetTabBar session={makeSession({ createSheet })} />)

    fireEvent.click(screen.getByRole('button', { name: '新建画布' }))
    expect(createSheet).toHaveBeenCalledTimes(1)
  })

  it('renames a sheet inline on double-click and commits on Enter', () => {
    const renameSheet = vi.fn(async () => {})
    renderWithApp(<SheetTabBar session={makeSession({ renameSheet })} />)

    fireEvent.doubleClick(screen.getByText('第二画布'))
    const input = screen.getByRole('textbox', { name: '重命名画布' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '重命名画布' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(renameSheet).toHaveBeenCalledWith('sheet_2', '重命名画布')
  })

  it('cancels rename on Escape without calling renameSheet', () => {
    const renameSheet = vi.fn(async () => {})
    renderWithApp(<SheetTabBar session={makeSession({ renameSheet })} />)

    fireEvent.doubleClick(screen.getByText('主画布'))
    const input = screen.getByRole('textbox', { name: '重命名画布' })
    fireEvent.change(input, { target: { value: '不该提交' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(renameSheet).not.toHaveBeenCalled()
  })

  it('exposes sheet management actions via the context menu', () => {
    const deleteSheet = vi.fn(async () => {})
    const moveSheet = vi.fn(async () => {})
    renderWithApp(<SheetTabBar session={makeSession({ deleteSheet, moveSheet })} />)

    // 右键第二画布标签打开菜单
    fireEvent.contextMenu(screen.getByText('第二画布'))
    const menu = screen.getByRole('menu', { name: '画布操作' })

    // 第二画布（index=1）位于末尾，右移应禁用
    const moveRight = within(menu).getByRole('menuitem', { name: '右移' })
    expect(moveRight).toBeDisabled()

    fireEvent.click(within(menu).getByRole('menuitem', { name: '删除画布' }))
    expect(deleteSheet).toHaveBeenCalledWith('sheet_2')
  })

  it('does not allow deleting the last remaining sheet', () => {
    const deleteSheet = vi.fn(async () => {})
    renderWithApp(
      <SheetTabBar
        session={makeSession({
          sheets: [{ id: 'sheet_1', title: '唯一画布', rootTopic: { id: 'r', text: '根' } }],
          deleteSheet,
        })}
      />,
    )

    fireEvent.contextMenu(screen.getByText('唯一画布'))
    expect(screen.getByRole('menuitem', { name: '删除画布' })).toBeDisabled()
  })
})
