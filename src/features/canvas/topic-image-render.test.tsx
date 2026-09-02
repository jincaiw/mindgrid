import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../../test/render'
import { CanvasHost } from './canvas-host'
import type { DocumentSession } from '../document/use-document-session'
import type { DocumentSnapshot } from '../../lib/document/types'

// vi.mock 会被提升到文件顶部，工厂函数只能引用 vi.hoisted 声明的 mock，避免 TDZ 报错。
const { readAssetDataUrl } = vi.hoisted(() => ({
  readAssetDataUrl: vi.fn(async (assetId: string) =>
    assetId === 'asset_present' ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' : '',
  ),
}))

vi.mock('../../lib/ipc/commands', () => ({ readAssetDataUrl }))

const IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

/** 构造最小画布会话：根主题 + 一个带图片的子主题 + 一个不带图片的子主题。 */
function createSession(): DocumentSession {
  const document: DocumentSnapshot = {
    schemaVersion: '1.0.0',
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheets: [
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: {
          id: 'topic_root',
          text: '中心主题',
          collapsed: false,
          children: [
            {
              id: 'topic_with_image',
              text: '有图主题',
              collapsed: false,
              children: [],
              image: { assetId: 'asset_present' },
            },
            {
              id: 'topic_without_image',
              text: '无图主题',
              collapsed: false,
              children: [],
            },
          ],
        },
      },
    ],
  }

  return {
    status: 'ready',
    document,
    summary: {
      documentId: 'doc_1',
      revision: 1,
      activeSheetId: 'sheet_1',
      sheetCount: 1,
      topicCount: 3,
      rootTopicText: '中心主题',
    },
    activeTopicId: 'topic_with_image',
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
    recentAction: '',
    recentActions: [],
  } as unknown as DocumentSession
}

describe('主题图片的画布渲染', () => {
  it('有图主题在标题上方渲染图片，无图主题不渲染图片元素', async () => {
    renderWithApp(<CanvasHost session={createSession()} />)

    const scene = screen.getByLabelText('思维导图舞台')
    const withImageNode = within(scene).getByRole('button', { name: /有图主题/ })
    const withoutImageNode = within(scene).getByRole('button', { name: /无图主题/ })

    expect(withoutImageNode.querySelector('img')).toBeNull()

    await waitFor(() => {
      const image = withImageNode.querySelector('img')
      expect(image).not.toBeNull()
      expect(image).toHaveAttribute('src', IMAGE_DATA_URL)
      expect(image).toHaveClass('mindmap-node__image')
    })

    // 图片元素排在标题之前（渲染于标题上方）
    const image = withImageNode.querySelector('img')
    const title = withImageNode.querySelector('.mindmap-node__title')
    expect(image?.compareDocumentPosition(title!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )

    // 同一 assetId 只拉取一次
    expect(readAssetDataUrl).toHaveBeenCalledTimes(1)
    expect(readAssetDataUrl).toHaveBeenCalledWith('asset_present')
  })

  it('图片资源缺失时不渲染图片，节点仍正常显示', async () => {
    const session = createSession()
    const rootTopic = session.document!.sheets[0].rootTopic
    rootTopic.children[0].image = { assetId: 'asset_missing' }

    renderWithApp(<CanvasHost session={session} />)

    const scene = screen.getByLabelText('思维导图舞台')
    const node = within(scene).getByRole('button', { name: /有图主题/ })

    await waitFor(() => {
      expect(readAssetDataUrl).toHaveBeenCalledWith('asset_missing')
    })

    expect(node.querySelector('img')).toBeNull()
    expect(node).toHaveTextContent('有图主题')
  })
})
