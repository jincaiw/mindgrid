import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import { renderSceneToSvg } from './svg-renderer'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function makeRoot(): TopicSnapshot {
  return makeTopic('root', 'Root', [
    makeTopic('a', 'Alpha'),
    makeTopic('b', 'Beta'),
  ])
}

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

function buildTestScene() {
  const layout = computeMindMapLayout(makeRoot())
  return buildScene({
    layout,
    viewport: { width: 800, height: 600 },
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: emptyVisualStates,
    overlays: emptyOverlays,
    enableCulling: false,
  })
}

describe('renderSceneToSvg', () => {
  it('produces a valid SVG root element with viewBox', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="')
    expect(svg).toContain('width="')
    expect(svg).toContain('height="')
    expect(svg).toContain('font-family=')
    expect(svg.trim().endsWith('</svg>')).toBe(true)
  })

  it('includes filter definitions in defs (no gradients for V1 flat themes)', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    expect(svg).toContain('<defs>')
    expect(svg).toContain('id="nodeShadow"')
    // V1 主题为纯色填充，不再使用渐变定义
    expect(svg).not.toContain('id="rootBg"')
    expect(svg).not.toContain('id="nodeBgLeft"')
    expect(svg).not.toContain('id="nodeBgRight"')
  })

  it('renders topic nodes as rect with resolved theme fill', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 根节点用 classic-blue 主题 root.fill（纯色，非渐变 URL）
    expect(svg).toContain('fill="rgba(91, 140, 255, 0.96)"')
    // 分支节点用 classic-blue 主题 branch.fill
    expect(svg).toContain('fill="rgba(255, 255, 255, 0.94)"')
    // 不应出现渐变 URL 引用（滤镜 url(#nodeShadow) 不在此限定范围）
    expect(svg).not.toContain('url(#rootBg)')
    expect(svg).not.toContain('url(#nodeBgLeft)')
    expect(svg).not.toContain('url(#nodeBgRight)')
    expect(svg).toContain('rx="20"')
  })

  it('renders topic text with escaped special characters', () => {
    const layout = computeMindMapLayout(
      makeTopic('root', 'A < B & C > D', [makeTopic('a', '"quoted"')]),
    )
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      enableCulling: false,
    })
    const svg = renderSceneToSvg(scene)

    expect(svg).toContain('A &lt; B &amp; C &gt; D')
    expect(svg).toContain('&quot;quoted&quot;')
    expect(svg).not.toContain('A < B & C > D')
  })

  it('renders edges as bezier paths', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 贝塞尔曲线路径
    expect(svg).toContain('<path d="M ')
    expect(svg).toContain(' C ')
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke-linecap="round"')
  })

  it('renders toggle button for topics with children', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 根节点和子节点 a/b 都有折叠按钮（root 有 2 子，a/b 有 0 子不显示）
    // 只有 childCount > 0 的节点才显示按钮
    expect(svg).toContain('<circle')
    expect(svg).toContain('r="15"')
  })

  it('does not render overlay nodes', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: {
        selectionBox: { x: 0, y: 0, width: 100, height: 100 },
        dragPreview: null,
        dropIndicator: null,
      },
      enableCulling: false,
    })
    const svg = renderSceneToSvg(scene)

    // selection-box 不应出现在 SVG 中
    expect(svg).not.toContain('selection-box')
  })

  it('includes themed background rect when drawBackground option is true', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene, { drawBackground: true })

    // classic-blue 主题背景色
    expect(svg).toContain('fill="rgba(238, 244, 255, 0.82)"')
  })

  it('uses dark theme background when themeId is dark', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene, { drawBackground: true, themeId: 'dark' })

    expect(svg).toContain('fill="#0b1220"')
  })

  it('does not include background rect by default', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 默认不绘制背景矩形（不应出现主题背景色作为 <rect> fill）
    expect(svg).not.toContain('fill="rgba(238, 244, 255, 0.82)"')
  })

  it('applies custom padding to viewBox bounds', () => {
    const scene = buildTestScene()
    const svgNoPadding = renderSceneToSvg(scene, { padding: 0 })
    const svgWithPadding = renderSceneToSvg(scene, { padding: 50 })

    // 提取 viewBox
    const extractWidth = (s: string) => {
      const m = s.match(/width="([\d.]+)"/)
      return m ? parseFloat(m[1]) : 0
    }
    const w1 = extractWidth(svgNoPadding)
    const w2 = extractWidth(svgWithPadding)

    expect(w2).toBeGreaterThan(w1)
  })
})
