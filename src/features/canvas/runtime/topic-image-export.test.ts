import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import type { TopicRenderNode } from './render-tree'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import { renderSceneToSvg } from './svg-renderer'
import { decodeImage, preloadTopicImages } from './png-exporter'
import { getNodePadding } from './style-constants'
import {
  TOPIC_IMAGE_RADIUS,
  TOPIC_IMAGE_TITLE_OFFSET,
  computeTopicImageFittedRect,
  computeTopicImageRect,
} from './topic-image-constants'
import { resolveEffectiveTheme } from './effective-theme'

/**
 * `buildScene` 现在要求显式传"**生效主题**"（画布级分支色板已叠加）。
 * 这些用例只关心场景结构与绘制调用，用内置默认主题即可 ——
 * 与改动前不传 themeId 时的缺省行为一致。
 */
const TEST_THEME = resolveEffectiveTheme({ themeId: undefined })


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
    theme: TEST_THEME,
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

/**
 * 主题图片的圆角裁剪：PNG 与 SVG 必须落在**同一个矩形**上。
 *
 * 历史缺陷：Canvas/PNG 裁了图片的实际绘制区域，SVG/PDF 完全没裁——
 * 同一张图在 PNG 里是圆角、在 SVG 里是直角。修法是两端共用
 * `computeTopicImageFittedRect`，并把固有尺寸一路传到 SVG 渲染器。
 */
describe('主题图片的圆角裁剪', () => {
  const SIZE = { width: 400, height: 100 }

  it('提供固有尺寸时生成圆角 clipPath 并挂到 <image> 上', () => {
    const svg = renderSceneToSvg(buildTestScene({ a: DATA_URL }), {
      topicImageSizes: new Map([['a', SIZE]]),
    })

    expect(svg).toContain('<clipPath id="topicImageClip-a">')
    expect(svg).toContain(`rx="${TOPIC_IMAGE_RADIUS}"`)
    expect(svg).toMatch(/<image [^>]*clip-path="url\(#topicImageClip-a\)"\/>/)
  })

  it('clipPath 的矩形就是 Canvas/PNG 用的实际绘制区域（同源函数）', () => {
    const scene = buildTestScene({ a: DATA_URL })
    const node = topicNode(scene, 'a')
    const expected = computeTopicImageFittedRect(
      node.bounds,
      getNodePadding(node.depth),
      SIZE,
    )!

    const svg = renderSceneToSvg(scene, { topicImageSizes: new Map([['a', SIZE]]) })
    const match = svg.match(
      /<clipPath id="topicImageClip-a"><rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/,
    )
    expect(match).not.toBeNull()

    expect(Number(match![1])).toBeCloseTo(expected.x, 5)
    expect(Number(match![2])).toBeCloseTo(expected.y, 5)
    expect(Number(match![3])).toBeCloseTo(expected.width, 5)
    expect(Number(match![4])).toBeCloseTo(expected.height, 5)
  })

  it('取不到固有尺寸时不裁剪（宁可直角，也不拿错尺寸裁坏图片）', () => {
    const svg = renderSceneToSvg(buildTestScene({ a: DATA_URL }))

    expect(svg).not.toContain('clipPath')
    expect(svg).not.toContain('clip-path')
  })

  it('尺寸表里没有该主题 / 尺寸非法时同样不裁剪', () => {
    const otherTopic = renderSceneToSvg(buildTestScene({ a: DATA_URL }), {
      topicImageSizes: new Map([['b', SIZE]]),
    })
    expect(otherTopic).not.toContain('clipPath')

    const zeroSize = renderSceneToSvg(buildTestScene({ a: DATA_URL }), {
      topicImageSizes: new Map([['a', { width: 0, height: 100 }]]),
    })
    expect(zeroSize).not.toContain('clipPath')
  })
})
