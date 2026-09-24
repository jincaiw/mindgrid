/**
 * 节点 meta 图标行（标记 / 备注 / 附件 / 语音备注 / 链接）的三端一致性守卫。
 *
 * ## 这里守的都是"只有并排对照才看得出来"的缺陷
 *
 * 实测发生过三件，全部是静默的：
 *   ① 附件、语音备注：导出端连字段都没接，`rich` 里没有，PNG / SVG 里整个图标消失；
 *   ② 备注：DOM 是黄色便签纸，导出是"黄圆 + 白线"（图形压根不是同一个东西）；
 *   ③ 链接：DOM 是蓝色链条，导出是"蓝圆 + 白箭头"。
 *
 * 所以这一组守卫不只断言"有图标"，而是分别钉住**来源、图形、顺序、可绘制性**四件事。
 */

import { describe, expect, it } from 'vitest'

import { parseSvgInner } from './svg-inner-canvas'
import {
  ATTACHMENT_ICON_SVG_INNER,
  LINK_ICON_SVG_INNER,
  NOTE_ICON_SVG_INNER,
  VOICE_NOTE_ICON_SVG_INNER,
} from './rich-content-constants'
import {
  TOPIC_META_ICON_ORDER,
  buildTopicMetaIcons,
  type TopicMetaIconKind,
} from './topic-meta-icons'
import type { TopicRichContent } from './render-tree'
import canvasHostSource from '../canvas-host.tsx?raw'

/**
 * 约定的 meta 行顺序（自左向右）。
 *
 * ⚠️ 这里**刻意写成字面量而不是引用 `TOPIC_META_ICON_ORDER`**：
 * 期望值如果也来自顺序表本身，把顺序表调换一下两边一起变，测试照样全绿 ——
 * 那是"没有鉴别力的测试"（本项目已经踩过：一致性守卫只比对"两处是否一样"，
 * 而缺陷恰好是"两处一起错"）。字面量 + 下面那条 DOM 源码顺序守卫，
 * 才是真正独立的两个参照。
 */
const EXPECTED_ORDER: readonly TopicMetaIconKind[] = [
  'marker',
  'notes',
  'attachment',
  'voiceNote',
  'link',
]

/** 五类来源各一个最小 payload（marker 用 `star`，图形固定）。 */
const SOURCES: Array<{ kind: TopicMetaIconKind; patch: Partial<TopicRichContent> }> = [
  { kind: 'marker', patch: { markers: [{ id: 'star' }] } },
  { kind: 'notes', patch: { notes: '一段备注' } },
  { kind: 'attachment', patch: { attachment: { assetId: 'a1', name: '方案.pdf' } } },
  {
    kind: 'voiceNote',
    patch: { voiceNote: { assetId: 'v1', mimeType: 'audio/webm', durationMs: 3000 } },
  },
  { kind: 'link', patch: { link: { url: 'https://example.com' } } },
]

/** 每一类在 DOM 里对应的选择器（用于"DOM 顺序 == 导出顺序"这条守卫）。 */
const DOM_SELECTOR: Record<TopicMetaIconKind, string> = {
  marker: 'mindmap-node__marker',
  notes: 'mindmap-node__note-indicator',
  attachment: 'mindmap-node__attachment-indicator',
  voiceNote: 'mindmap-node__voice-indicator',
  link: 'mindmap-node__link-indicator',
}

/** 按位掩码拼一个 rich（只在需要时出现该字段，避免"空字符串也算有"这类干扰）。 */
function makeRich(mask: number): TopicRichContent {
  const rich: TopicRichContent = {}
  SOURCES.forEach((source, index) => {
    if ((mask & (1 << index)) === 0) return
    Object.assign(rich, source.patch)
  })
  return rich
}

describe('buildTopicMetaIcons —— 顺序与来源', () => {
  it('顺序表恰好覆盖五类且顺序就是约定的那一个', () => {
    expect(TOPIC_META_ICON_ORDER).toEqual(EXPECTED_ORDER)
    expect(new Set(TOPIC_META_ICON_ORDER).size).toBe(SOURCES.length)
    // 顺序表里的每一类都要有对应的来源定义，否则下面按掩码生成的期望值会算错
    for (const kind of TOPIC_META_ICON_ORDER) {
      expect(SOURCES.some((source) => source.kind === kind)).toBe(true)
    }
  })

  /**
   * DOM 与导出端必须按同一个顺序排图标。
   *
   * 图标是一个接一个按 `RICH_ICON_SIZE + RICH_META_GAP` 排开的：顺序不同，
   * 同一个图标在屏幕和导出里会落在不同的 x 上（而"有没有画"全都对，很难发现）。
   * 这里从 `canvas-host.tsx` 的 meta 块里逐个取选择器的**首次出现位置**，
   * 断言相对次序与 `TOPIC_META_ICON_ORDER` 一致 —— 这是独立于顺序表的参照。
   */
  it('DOM 里 meta 图标的书写顺序与导出顺序一致', () => {
    const start = canvasHostSource.indexOf('{hasMeta ? (')
    expect(start, 'canvas-host.tsx 里找不到 meta 块入口（选择器或写法变了）').toBeGreaterThan(-1)
    const block = canvasHostSource.slice(start, start + 4000)

    const positions = EXPECTED_ORDER.map((kind) => {
      const index = block.indexOf(DOM_SELECTOR[kind])
      expect(index, `meta 块里找不到 ${DOM_SELECTOR[kind]}（这一类的图标是不是被删了？）`)
        .toBeGreaterThan(-1)
      return { kind, index }
    })

    const sorted = [...positions].sort((a, b) => a.index - b.index).map((item) => item.kind)
    expect(sorted, 'DOM 里的图标顺序与 TOPIC_META_ICON_ORDER 不一致').toEqual([
      ...TOPIC_META_ICON_ORDER,
    ])
  })

  it('没有富内容时为空（不要凭空生出一个图标）', () => {
    expect(buildTopicMetaIcons(undefined)).toEqual([])
    expect(buildTopicMetaIcons({})).toEqual([])
  })

  it('单个来源：只出这一个图标，图形就是该类的常量', () => {
    const expectedInners: Partial<Record<TopicMetaIconKind, string>> = {
      notes: NOTE_ICON_SVG_INNER,
      attachment: ATTACHMENT_ICON_SVG_INNER,
      voiceNote: VOICE_NOTE_ICON_SVG_INNER,
      link: LINK_ICON_SVG_INNER,
    }

    SOURCES.forEach((source, index) => {
      const icons = buildTopicMetaIcons(makeRich(1 << index))
      expect(icons.map((icon) => icon.kind), `${source.kind} 单来源`).toEqual([source.kind])
      const expected = expectedInners[source.kind]
      if (expected) {
        expect(icons[0].inner, `${source.kind} 的图形应来自常量`).toBe(expected)
      }
    })
  })

  it('多个标记各占一格（同一类可以有多个图标）', () => {
    const icons = buildTopicMetaIcons({ markers: [{ id: 'star' }, { id: 'priority-1' }] })
    expect(icons.map((icon) => icon.kind)).toEqual(['marker', 'marker'])
    expect(icons[0].inner).not.toBe(icons[1].inner)
  })

  it('32 种来源组合下，顺序恒为顺序表过滤后的结果（穷举）', () => {
    const total = 1 << SOURCES.length
    let compared = 0

    for (let mask = 0; mask < total; mask += 1) {
      const present = SOURCES.filter((_, index) => (mask & (1 << index)) !== 0)
      const expected = EXPECTED_ORDER.filter((kind) =>
        present.some((source) => source.kind === kind),
      )

      const icons = buildTopicMetaIcons(makeRich(mask))
      expect(
        icons.map((icon) => icon.kind),
        `mask=${mask} 的图标顺序不对（DOM 与导出会因此错位）`,
      ).toEqual(expected)
      // 每个图标都必须带一段非空图形，否则 SVG 里会出现空的 <g>
      for (const icon of icons) {
        expect(icon.inner.length).toBeGreaterThan(0)
      }
      compared += 1
    }

    // 底线：掩码循环写坏（例如 SOURCES 变空）会让上面"零比较"地静默通过
    expect(compared).toBe(total)
    expect(compared).toBe(32)
  })
})

/**
 * 图形唯一来源。
 *
 * DOM 侧（`canvas-host.tsx`）原先自己内联了四个 `<path d="…">`，导出端另有常量，
 * 于是出现了"便签纸 vs 黄圆"这种同名字段、不同图形的情况。
 * 这里既钉住"常量本身是对的"，也钉住"DOM 不再写第二份"。
 */
describe('meta 图标图形唯一来源', () => {
  it('四个常量的图形互不相同（不然就是复制粘贴漏改了颜色/路径）', () => {
    const all = [
      NOTE_ICON_SVG_INNER,
      ATTACHMENT_ICON_SVG_INNER,
      VOICE_NOTE_ICON_SVG_INNER,
      LINK_ICON_SVG_INNER,
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('备注/链接用的是 DOM 的图形，而不是旧的"圆 + 白线"', () => {
    // 负向对照：旧图形的判别串 —— 圆底 + 白色描线
    expect(NOTE_ICON_SVG_INNER).not.toContain('<circle cx="7" cy="7" r="6" fill="#f6be00"/>')
    expect(LINK_ICON_SVG_INNER).not.toContain('<circle cx="7" cy="7" r="6" fill="#5b8cff"/>')
    // 正向：便签纸的折角形状 / 链条的圆环弧
    expect(NOTE_ICON_SVG_INNER).toContain('M2.5 1.5h6l3 3v8h-9z')
    expect(LINK_ICON_SVG_INNER).toContain('M5.5 8.5l3-3')
  })

  it('语音话筒的囊体是 path 而不是 <rect>（导出端会静默跳过 rect）', () => {
    expect(VOICE_NOTE_ICON_SVG_INNER).not.toContain('<rect')
    expect(VOICE_NOTE_ICON_SVG_INNER).toContain('M5.4 3.2L5.4 6.4')
  })

  it('DOM 的四个 Glyph 组件不再内联第二份图形', () => {
    // 从源码里抠出四个组件的定义体（到下一个函数声明为止）
    const bodies = ['AttachmentGlyph', 'VoiceNoteGlyph', 'NoteGlyph', 'LinkGlyph'].map((name) => {
      const start = canvasHostSource.indexOf(`function ${name}(`)
      expect(start, `canvas-host.tsx 里找不到 ${name}`).toBeGreaterThan(-1)
      const rest = canvasHostSource.slice(start)
      const end = rest.indexOf('\nfunction ', 1)
      return rest.slice(0, end === -1 ? rest.length : end)
    })

    for (const [index, body] of bodies.entries()) {
      const name = ['AttachmentGlyph', 'VoiceNoteGlyph', 'NoteGlyph', 'LinkGlyph'][index]
      // 判据：组件体里不该再出现任何 SVG 路径数据或内联图形元素
      expect(body, `${name} 里又出现内联的 d="…"`).not.toMatch(/\sd="/)
      expect(body, `${name} 里又出现内联的 <circle/<rect`).not.toMatch(/<(circle|rect|polygon)/)
      // 正向：它确实从常量取图形（否则"删掉了图形"也会让上面两条通过）
      expect(body, `${name} 应从常量取图形`).toMatch(/_ICON_SVG_INNER/)
    }
  })
})

/**
 * PNG 端要把这些常量交给 `svg-inner-canvas` 光栅化，而那个模块**只支持
 * `<circle>` / `<path>` / `<text>`**，其余元素静默跳过 ——
 * 语音话筒原先是 `<rect>`，照抄过来 PNG 里就只剩弧和支脚。
 *
 * 这条守卫盯的正是"静默跳过"：把字符串里的顶层标签数与真正解析出来的元素数对上。
 */
describe('meta 图标必须能被 PNG 端完整解析', () => {
  const CASES: Array<{ name: string; inner: string }> = [
    { name: '备注', inner: NOTE_ICON_SVG_INNER },
    { name: '附件', inner: ATTACHMENT_ICON_SVG_INNER },
    { name: '语音备注', inner: VOICE_NOTE_ICON_SVG_INNER },
    { name: '链接', inner: LINK_ICON_SVG_INNER },
  ]

  for (const testCase of CASES) {
    it(`${testCase.name}：字符串里的每个元素都被解析出来`, () => {
      const tagCount = (testCase.inner.match(/<[a-zA-Z]+/g) ?? []).length
      const parsed = parseSvgInner(testCase.inner)
      expect(tagCount).toBeGreaterThan(0)
      expect(
        parsed.length,
        `${testCase.name} 有 ${tagCount} 个元素，只解析出 ${parsed.length} 个 —— ` +
          '多出来的会被 PNG 端静默丢掉（多半是用了 svg-inner-canvas 不支持的元素）',
      ).toBe(tagCount)
    })
  }
})
