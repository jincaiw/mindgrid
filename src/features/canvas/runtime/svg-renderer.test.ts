import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../../lib/document/types'
import { computeMindMapLayout } from '../mindmap-layout'
import { buildScene, type InteractionOverlays, type TopicVisualStates } from './scene-builder'
import type { TopicRenderNode } from './render-tree'
import { renderSceneToSvg } from './svg-renderer'
import { resolveEffectiveTheme } from './effective-theme'
import { RICH_ICON_SIZE, RICH_META_GAP } from './rich-content-constants'

/**
 * `buildScene` 现在要求显式传"**生效主题**"（画布级分支色板已叠加）。
 * 这些用例只关心场景结构与绘制调用，用内置默认主题即可 ——
 * 与改动前不传 themeId 时的缺省行为一致。
 */
const TEST_THEME = resolveEffectiveTheme({ themeId: undefined })


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
    theme: TEST_THEME,
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
    expect(svg).toContain('fill="#ffffff"')
    // 不应出现渐变 URL 引用（滤镜 url(#nodeShadow) 不在此限定范围）
    expect(svg).not.toContain('url(#rootBg)')
    expect(svg).not.toContain('url(#nodeBgLeft)')
    expect(svg).not.toContain('url(#nodeBgRight)')
    expect(svg).toContain('rx="12"')
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
      theme: TEST_THEME,
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

  it('renders dashed borders and aligned titles from node overrides', () => {
    // 复用文件内的 buildTestScene，避免另一套默认值命名
    const scene = buildTestScene()

    const branch = scene.nodes.find(
      (n): n is TopicRenderNode => n.type === 'topic' && n.depth === 1,
    )!
    branch.style = { ...branch.style, borderStyle: 'dotted', textAlign: 'center', borderWidth: 2 }

    const svg = renderSceneToSvg(scene, { themeId: 'classic-blue' })

    expect(svg).toContain('stroke-dasharray')
    expect(svg).toContain('text-anchor="middle"')
  })

  it('renders font family, italic, strikethrough and case transform from node overrides', () => {
    // 同一个场景渲染两次（只差 strikethrough），用 <line> 增量断言删除线
    const withOverrides = (strikethrough: boolean) => {
      const scene = buildTestScene()
      const branch = scene.nodes.find(
        (n): n is TopicRenderNode => n.type === 'topic' && n.depth === 1,
      )!
      // 单个短词，避免 jsdom 的 8px/字符估算把文本折行
      branch.text = 'hello'
      branch.style = {
        ...branch.style,
        fontFamily: '"Songti SC", SimSun, serif',
        italic: true,
        strikethrough,
        textTransform: 'uppercase',
      }
      return { svg: renderSceneToSvg(scene, { themeId: 'classic-blue' }), branch }
    }

    const on = withOverrides(true)

    // 字体族与斜体直接写在 <text> 上，覆盖根元素的画布全局字体
    expect(on.svg).toContain('font-family="&quot;Songti SC&quot;, SimSun, serif"')
    expect(on.svg).toContain('font-style="italic"')
    // 大小写转换只作用于渲染层，不改写文档文本
    expect(on.svg).toContain('>HELLO<')
    expect(on.branch.text).toBe('hello')
    // 删除线用显式 <line>，不依赖 svg2pdf 支持度不明的 text-decoration
    expect(on.svg).not.toContain('text-decoration')
    const countLines = (svg: string) => (svg.match(/<line /g) ?? []).length
    expect(countLines(on.svg)).toBeGreaterThan(countLines(withOverrides(false).svg))
  })

  it('renders toggle button for topics with children', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 根节点和子节点 a/b 都有折叠按钮（root 有 2 子，a/b 有 0 子不显示）
    // 只有 childCount > 0 的节点才显示按钮；XMind 式 16px 按钮（r=8）位于连线起点侧
    expect(svg).toContain('<circle')
    expect(svg).toContain('r="8"')
    // +/− 符号字号 10、字重 600（与 canvas-renderer 一致）
    expect(svg).toContain('font-size="10"')
    expect(svg).toContain('font-weight="600"')
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
      theme: TEST_THEME,
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
    expect(svg).toContain('fill="#f5f5f7"')
  })

  it('uses dark theme background when themeId is dark', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene, { drawBackground: true, themeId: 'dark' })

    expect(svg).toContain('fill="#1a1a2e"')
  })

  it('does not include background rect by default', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 默认不绘制背景矩形（不应出现主题背景色作为 <rect> fill）
    expect(svg).not.toContain('fill="#f5f5f7"')
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

  it('renders rich content (markers/labels/notes/attachment/voice/link/task) on topic nodes', () => {
    const root = makeTopic('root', '中心', [
      {
        id: 'rich_child',
        text: '富内容节点',
        collapsed: false,
        children: [],
        markers: [{ id: 'priority-1' }, { id: 'star' }],
        labels: ['重要', '待办'],
        notes: '这是一段备注',
        attachment: { assetId: 'asset_pdf', name: '方案草案.pdf', byteSize: 2048 },
        voiceNote: { assetId: 'asset_voice', mimeType: 'audio/webm', durationMs: 3200 },
        link: { url: 'https://example.com', title: '示例' },
        task: { status: 'started', priority: 2 },
      },
    ])
    const layout = computeMindMapLayout(root)
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })
    const svg = renderSceneToSvg(scene)

    expect(svg).toContain('aria-label="任务状态 started"')
    // 逐类用**图形独有的片段**判别。原先这里靠 `fill="#f6be00"` / `fill="#5b8cff"`
    // 这种颜色串，而 star 标记与便签同色、任务环与链条同色 —— 判据没有鉴别力，
    // "画错图形"（黄圆 vs 便签纸）根本测不出来。
    expect(svg, 'star 标记').toContain('M7 1l1.8 3.7 4.1.6')
    expect(svg, '备注图标应为便签纸').toContain('M2.5 1.5h6l3 3v8h-9z')
    expect(svg, '附件图标（回形针）在导出里缺失').toContain('M9.5 4.5l-4 4a2 2 0 0 0 2.8 2.8')
    expect(svg, '语音备注图标（话筒）在导出里缺失').toContain('M5.4 3.2L5.4 6.4')
    expect(svg, '链接图标应为链条').toContain('M5.5 8.5l3-3')
    // 标签胶囊背景 + 文字
    expect(svg).toContain('fill="rgba(91,140,255,0.12)"')
    expect(svg).toContain('重要')
    expect(svg).toContain('待办')
  })

  it('meta 图标按约定顺序排列，间距等于 RICH_ICON_SIZE + RICH_META_GAP', () => {
    const root = makeTopic('root', '中心', [
      {
        id: 'rich_child',
        text: '富内容节点',
        collapsed: false,
        children: [],
        notes: '备注',
        attachment: { assetId: 'asset_pdf', name: '方案草案.pdf' },
        voiceNote: { assetId: 'asset_voice', mimeType: 'audio/webm' },
        link: { url: 'https://example.com' },
      },
    ])
    const svg = renderSceneToSvg(
      buildScene({
        layout: computeMindMapLayout(root),
        viewport: { width: 800, height: 600 },
        camera: { x: 0, y: 0, zoom: 1 },
        visualStates: emptyVisualStates,
        overlays: emptyOverlays,
        theme: TEST_THEME,
        enableCulling: false,
      }),
    )

    // meta 图标是 `<g transform="translate(x y)">图形</g>`；用图形片段认领各自的 x。
    const groupRe = /<g transform="translate\(([\d.-]+) [\d.-]+\)">(.*?)<\/g>/g
    const found: Array<{ x: number; kind: string }> = []
    for (const match of svg.matchAll(groupRe)) {
      const x = Number(match[1])
      const inner = match[2]
      if (inner.includes('M2.5 1.5h6l3 3v8h-9z')) found.push({ x, kind: 'notes' })
      else if (inner.includes('M9.5 4.5l-4 4a2 2 0 0 0 2.8 2.8')) found.push({ x, kind: 'attachment' })
      else if (inner.includes('M5.4 3.2L5.4 6.4')) found.push({ x, kind: 'voiceNote' })
      else if (inner.includes('M5.5 8.5l3-3')) found.push({ x, kind: 'link' })
    }

    found.sort((a, b) => a.x - b.x)
    expect(found.map((item) => item.kind)).toEqual(['notes', 'attachment', 'voiceNote', 'link'])
    // 相邻间距固定（14 + 4）——顺序或计数错了这一步会先崩
    for (let i = 1; i < found.length; i += 1) {
      expect(found[i].x - found[i - 1].x).toBeCloseTo(RICH_ICON_SIZE + RICH_META_GAP, 5)
    }
  })

  it('centers the label row including the +N overflow pill (>3 labels)', () => {
    const root = makeTopic('root', '中心', [
      {
        id: 'many_labels',
        text: '多标签节点',
        collapsed: false,
        children: [],
        labels: ['甲', '乙', '丙', '丁', '戊'],
      },
    ])
    const layout = computeMindMapLayout(root)
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })
    const svg = renderSceneToSvg(scene)

    // 节点中心（DOM 基线：标签行整体 translateX(-50%) 居中，含 +N）
    const topicNode = scene.nodes.find(
      (n): n is Extract<typeof n, { type: 'topic' }> =>
        n.type === 'topic' && n.id === 'many_labels',
    )
    if (!topicNode) throw new Error('场景里找不到 many_labels')
    const nodeCenter = topicNode.bounds.x + topicNode.bounds.width / 2

    const pillMatches = [
      ...svg.matchAll(
        /<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.-]+)" height="18"[^>]*fill="rgba\(91,140,255,0\.12\)"/g,
      ),
    ]
    // 3 个展示标签 + 1 个 +N
    expect(pillMatches.length).toBe(4)

    const rowLeft = parseFloat(pillMatches[0][1])
    const lastPill = pillMatches[pillMatches.length - 1]
    const rowRight = parseFloat(lastPill[1]) + parseFloat(lastPill[2])
    // 整行（含 +N）必须以节点中心对称；若 +N 未计入居中宽度会右偏 (28+4)/2 = 16px
    expect((rowLeft + rowRight) / 2).toBeCloseTo(nodeCenter, 5)
  })

  it('omits rich content elements when topic has none', () => {
    const scene = buildTestScene()
    const svg = renderSceneToSvg(scene)

    // 无富内容的节点不应出现任务 aria-label 或标签胶囊背景
    expect(svg).not.toContain('aria-label="任务状态')
    expect(svg).not.toContain('fill="rgba(91,140,255,0.12)"')
  })
})

/**
 * 贴纸的导出序列化。
 *
 * 屏幕上有、导出里没有是最难发现的一类缺陷（用户只在导出后才发现），
 * 而 SVG 端没有 canvas 依赖，可以在 jsdom 里直接断言。
 * PNG 端与 SVG 端共用 computeTopicStickerPlacement，几何不会各算一套。
 */
describe('贴纸导出', () => {
  it('把贴纸序列化进 SVG，且位移与旋转都来自计算的落点', () => {
    const stickered: TopicSnapshot = {
      id: 'a',
      text: 'Alpha',
      collapsed: false,
      children: [],
      stickers: [{ id: 's1', stickerId: 'star', offsetX: -14, offsetY: -14, rotation: 30 }],
    }
    const root = makeTopic('root', 'Root', [stickered, makeTopic('b', 'Beta')])
    const layout = computeMindMapLayout(root)
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })

    const svg = renderSceneToSvg(scene, {})

    // 贴纸用 <g> 包一组 <path>，并带上 translate/rotate/scale
    expect(svg).toContain('rotate(30)')
    expect(svg).toContain('scale(')
    // 星星的填充色必须出现在导出里（否则等于没画）
    expect(svg).toContain('#f6be00')

    // 只贴了一张：这个旋转角在整份 SVG 里只该出现一次
    expect(svg.split('rotate(30)').length - 1).toBe(1)
  })

  it('未识别的贴纸 id 被跳过（旧文档里的自定义贴纸不该让导出失败）', () => {
    const unknown: TopicSnapshot = {
      id: 'a',
      text: 'Alpha',
      collapsed: false,
      children: [],
      stickers: [{ id: 's1', stickerId: '来自未来的贴纸' }],
    }
    const root = makeTopic('root', 'Root', [unknown])
    const layout = computeMindMapLayout(root)
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })

    expect(() => renderSceneToSvg(scene, {})).not.toThrow()
  })
})

describe('画布级插画导出', () => {
  it('把插画画成 <g transform>：平移用中心坐标、缩放用 size/viewBox', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      illustrations: [{ id: 'ill_1', illustrationId: 'rocket', x: 120, y: -80, size: 128 }],
      theme: TEST_THEME,
      enableCulling: false,
    })

    const svg = renderSceneToSvg(scene)

    const cx = 120 + layout.offsetX
    const cy = -80 + layout.offsetY
    // scale(128/64) = 2；再 translate(-32,-32) 把 viewBox 中心对到 (cx,cy)
    expect(svg).toContain(
      `translate(${cx} ${cy}) scale(2) translate(-32 -32)`,
    )
  })

  it('没有插画时不产生插画分组', () => {
    const layout = computeMindMapLayout(makeRoot())
    const scene = buildScene({
      layout,
      viewport: { width: 800, height: 600 },
      camera: { x: 0, y: 0, zoom: 1 },
      visualStates: emptyVisualStates,
      overlays: emptyOverlays,
      theme: TEST_THEME,
      enableCulling: false,
    })

    // 标题文字里不会出现 scale(2) translate(-32 -32) 这种组合
    expect(renderSceneToSvg(scene)).not.toContain('translate(-32 -32)')
  })
})
