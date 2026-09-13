import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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

    /**
     * ⚠️ 上面那条"DOM 顺序在前"**不足以**证明图片真的在标题上方。
     *
     * 实测教训：节点曾用默认的 `display: flex`（row）排版，图片与标题**并排**
     * ——DOM 顺序确实是 img 在前，但视觉上图片吃掉横向空间、标题被挤成一列单字。
     * 这一条当时全绿，缺陷却真实存在（在 `dev/capture-topic-image.mjs` 的截图里一眼可见）。
     *
     * jsdom 不做布局，量不出上下关系，所以这里改为钉住**决定版面的那个类**：
     * `.mindmap-node--with-image` 把节点改成纵排（见 global.css），
     * 数值本身另有 styles.test.ts 对着 topic-image-constants 的静态守卫。
     */
    expect(withImageNode).toHaveClass('mindmap-node--with-image')
    // 无图节点不能被套上纵排样式，否则图片缺席时会出现多余留白
    expect(withoutImageNode).not.toHaveClass('mindmap-node--with-image')

    // 同一 assetId 只拉取一次
    expect(readAssetDataUrl).toHaveBeenCalledTimes(1)
    expect(readAssetDataUrl).toHaveBeenCalledWith('asset_present')
  })

  it('进入内联编辑时图片仍在、节点版面不变', async () => {
    // 编辑态是**另一条 DOM 分支**：曾经它既不带 depth 类、也不渲染图片，
    // 于是一按重命名，图片凭空消失、内边距也从 20/22 跳回 8/14，节点明显抖动。
    renderWithApp(<CanvasHost session={createSession()} />)

    const scene = screen.getByLabelText('思维导图舞台')
    const node = within(scene).getByRole('button', { name: /有图主题/ })

    await waitFor(() => {
      expect(node.querySelector('img')).not.toBeNull()
    })

    fireEvent.doubleClick(node)

    const editor = await screen.findByRole('textbox', { name: '内联编辑主题' })
    const editingNode = editor.closest('.mindmap-node')!
    expect(editingNode.querySelector('.mindmap-node__image')).not.toBeNull()
    expect(editingNode).toHaveClass('mindmap-node--with-image')
    // 深度类决定内边距（.mindmap-node--depth-N），丢了就会在进入编辑时跳一下
    expect(editingNode).toHaveClass('mindmap-node--depth-1')
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
