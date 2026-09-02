import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import type { TopicRenderNode } from './render-tree'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import { renderSceneToSvg } from './svg-renderer'
import { decodeImage, preloadTopicImages } from './png-exporter'
import { getNodePadding } from './style-constants'
import { TOPIC_IMAGE_TITLE_OFFSET, computeTopicImageRect } from './topic-image-constants'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

const emptyVisualStates: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const emptyOverlays: InteractionOverlays = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

function makeRoot(): TopicSnapshot {
  return {
    id: 'root',
    text: 'Root',
    collapsed: false,
    children: [
      { id: 'a', text: 'Alpha', collapsed: false, children: [], image: { assetId: 'asset-1' } },
      { id: 'b', text: 'Beta', collapsed: false, children: [] },
    ],
  }
}

function buildTestScene(topicImageUrls?: Record<string, string>) {
  const layout = computeMindMapLayout(makeRoot())
  return buildScene({
    layout,
    viewport: { width: 1200, height: 800 },
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: emptyVisualStates,
    overlays: emptyOverlays,
    enableCulling: false,
    topicImageUrls,
  })
}

function topicNode(scene: ReturnType<typeof buildTestScene>, id: string): TopicRenderNode {
  const node = scene.nodes.find((n): n is TopicRenderNode => n.type === 'topic' && n.id === id)
  if (!node) {
    throw new Error(`测试场景里找不到主题 ${id}`)
  }
  return node
}

/** 与 svg-renderer 内部 fmt() 保持一致，便于断言坐标字符串。 */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

describe('导出场景中的主题图片投影', () => {
  it('未提供 topicImageUrls 时不投影 image；无其它富内容时 rich 仍为 undefined', () => {
    const scene = buildTestScene()
    expect(topicNode(scene, 'a').rich).toBeUndefined()
  })

  it('提供 topicImageUrls 时按 topicId 投影到对应主题', () => {
    const scene = buildTestScene({ a: DATA_URL })

    expect(topicNode(scene, 'a').rich?.image).toBe(DATA_URL)
    // 未配置 URL 的主题不应带上 image
    expect(topicNode(scene, 'b').rich).toBeUndefined()
  })
})

describe('SVG 导出绘制主题图片', () => {
  it('有图时输出 <image>，同时带 href 与 xlink:href', () => {
    const svg = renderSceneToSvg(buildTestScene({ a: DATA_URL }))

    expect(svg).toContain('<image')
    expect(svg).toContain(`href="${DATA_URL}"`)
    expect(svg).toContain(`xlink:href="${DATA_URL}"`)
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"')
  })

  it('无图时不产生 <image> 元素', () => {
    const svg = renderSceneToSvg(buildTestScene())
    expect(svg).not.toContain('<image')
  })

  it('图片几何与 computeTopicImageRect 一致（与 DOM 同源）', () => {
    const scene = buildTestScene({ a: DATA_URL })
    const node = topicNode(scene, 'a')
    const rect = computeTopicImageRect(node.bounds, getNodePadding(node.depth))
    const svg = renderSceneToSvg(scene)

    const match = svg.match(
      /<image x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/,
    )
    expect(match).not.toBeNull()

    expect(Number(match![1])).toBeCloseTo(rect.x, 1)
    expect(Number(match![2])).toBeCloseTo(rect.y, 1)
    expect(Number(match![3])).toBeCloseTo(rect.width, 1)
    expect(Number(match![4])).toBeCloseTo(rect.height, 1)
  })

  it('有图时标题下移，位置 = 节点顶边 + 内边距 + 标题下移量', () => {
    const scene = buildTestScene({ a: DATA_URL })
    const node = topicNode(scene, 'a')
    const padding = getNodePadding(node.depth)
    const svg = renderSceneToSvg(scene)

    const expectedTitleY = node.bounds.y + padding + TOPIC_IMAGE_TITLE_OFFSET
    expect(svg).toContain(`y="${fmt(expectedTitleY)}"`)
  })
})

describe('PNG 导出的图片预加载容错', () => {
  it('场景无图片时返回空表，不发起任何解码', async () => {
    const result = await preloadTopicImages(buildTestScene())
    expect(result.size).toBe(0)
  })

  it('坏 data URL 解码失败时返回 null，不抛错、不挂起', async () => {
    await expect(decodeImage('not-a-data-url', 0)).resolves.toBeNull()
  })

  it('解码不完成时静默跳过该图，不阻断导出', async () => {
    // timeoutMs=0：jsdom 无真实解码能力，onload/onerror 都不会触发，
    // 必须靠超时兜底返回，否则整次导出会永久挂起。
    const result = await preloadTopicImages(buildTestScene({ a: DATA_URL }), 0)
    expect(result.size).toBe(0)
  })
})
