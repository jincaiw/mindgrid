/**
 * 节点尺寸估算的双实现一致性 + 字号覆盖缩放。
 *
 * `mindmap-layout.estimateNodeSize` 与 `layouts/layout-utils.estimateNodeSize`
 * 是历史遗留的两份副本，一处漂移就会让思维导图与其它骨架的同深度节点大小不同。
 * 这里用同一批输入对两份实现逐项比对，把"两处保持一致"从注释约定变成可执行断言。
 */

import { describe, expect, it } from 'vitest'

import type { ChartType, TopicSnapshot } from '../../lib/document/types'
import { computeLayout } from './layouts'
import { estimateNodeSize as estimateFromMindMap } from './mindmap-layout'
import { estimateNodeSize as estimateFromLayoutUtils } from './layouts/layout-utils'
import {
  TOPIC_EQUATION_BLOCK,
  TOPIC_EQUATION_MIN_WIDTH,
} from './runtime/topic-equation-constants'
import { TOPIC_IMAGE_BLOCK } from './runtime/topic-image-constants'

function makeTopic(overrides: Partial<TopicSnapshot> = {}): TopicSnapshot {
  return {
    id: 'topic_1',
    text: '一个普通长度的主题文本',
    collapsed: false,
    children: [],
    ...overrides,
  }
}

const DEPTHS = [0, 1, 2, 3] as const

/**
 * 影响节点尺寸的富内容与样式开关。
 *
 * ⚠️ **新增影响节点尺寸的字段时把它加进来** —— 下面的守卫会跑**全部组合**，
 * 所以不必再逐个手写用例（这正是本文件此前漏掉"带图片"那一格的原因：
 * 手写用例只覆盖了作者当时想到的那几种）。
 */
const SIZE_FEATURES: Array<{ name: string; patch: Partial<TopicSnapshot> }> = [
  { name: '图片', patch: { image: { assetId: 'asset_1' } } },
  { name: '方程', patch: { equation: { latex: 'x' } } },
  { name: '空方程', patch: { equation: { latex: '   ' } } },
  { name: '固定宽度', patch: { styleOverrides: { width: 260 } } },
  { name: '字号覆盖', patch: { styleOverrides: { fontSize: 24 } } },
  { name: '任务', patch: { task: { status: 'started', priority: 2 } } },
  { name: '标记', patch: { markers: [{ id: 'star' }] } },
  { name: '标签', patch: { labels: ['重要', '紧急'] } },
  { name: '备注', patch: { notes: '一段备注' } },
  { name: '链接', patch: { link: { url: 'https://example.com' } } },
  { name: '折叠', patch: { collapsed: true } },
]

/** 按位掩码构造一个主题：多个 patch 合并，`styleOverrides` 逐键合并而不是整体覆盖。 */
function makeCombination(mask: number): TopicSnapshot {
  const merged: Partial<TopicSnapshot> = {}
  const styleOverrides: NonNullable<TopicSnapshot['styleOverrides']> = {}
  SIZE_FEATURES.forEach((feature, index) => {
    if ((mask & (1 << index)) === 0) return
    const { styleOverrides: patchStyle, ...rest } = feature.patch
    Object.assign(merged, rest)
    if (patchStyle) {
      Object.assign(styleOverrides, patchStyle)
    }
  })
  if (Object.keys(styleOverrides).length > 0) {
    merged.styleOverrides = styleOverrides
  }
  return makeTopic(merged)
}

describe('estimateNodeSize 双实现一致性', () => {
  it('全部富内容 / 样式开关的组合下，两处完全一致（笛卡尔积）', () => {
    const total = 1 << SIZE_FEATURES.length
    let compared = 0
    for (let mask = 0; mask < total; mask += 1) {
      const topic = makeCombination(mask)
      for (const depth of DEPTHS) {
        const fromMindMap = estimateFromMindMap(topic, depth)
        const fromLayoutUtils = estimateFromLayoutUtils(topic, depth)
        expect(
          fromLayoutUtils,
          `组合 mask=${mask} depth=${depth} 下两处不一致：` +
            `mindmap=${JSON.stringify(fromMindMap)} layout-utils=${JSON.stringify(fromLayoutUtils)}`,
        ).toEqual(fromMindMap)
        compared += 1
      }
    }
    // 底线：掩码循环一旦写坏（比如 SIZE_FEATURES 变成空数组），上面会"零比较"地静默通过
    expect(compared).toBe(total * DEPTHS.length)
    expect(compared).toBeGreaterThan(1000)
  })

  /**
   * ⭐ 这一格此前**缺失**，而漂移恰好就在它上面：两份实现里 `mindmap-layout` 给图片预留
   * `TOPIC_IMAGE_BLOCK`，`layouts/layout-utils`（所有非思维导图骨架都用它）**一点没留** ——
   * 于是鱼骨 / 气泡 / 时间轴 / 组织架构 / 矩阵这五种骨架里给主题加图片，
   * 布局只给"文字高度"，而三端都照着 `TOPIC_IMAGE_TITLE_OFFSET` 往下画 →
   * 内容溢出节点框 96px、压到相邻节点上。
   * 现在两处共用 `applyRichContentBlocks`，这条守卫也留作回归。
   */
  it('图片块在两处都被预留（回归：非思维导图骨架曾漏掉它）', () => {
    for (const depth of DEPTHS) {
      const plain = makeTopic({ text: '短' })
      const withImage = makeTopic({ text: '短', image: { assetId: 'asset_1' } })
      for (const estimate of [estimateFromMindMap, estimateFromLayoutUtils]) {
        expect(estimate(withImage, depth).height - estimate(plain, depth).height).toBe(
          TOPIC_IMAGE_BLOCK,
        )
      }
    }
  })

  it('图片 + 方程是**累加**（不是取最大）：两处都加两块', () => {
    const plain = makeTopic({ text: '短' })
    const both = makeTopic({
      text: '短',
      image: { assetId: 'asset_1' },
      equation: { latex: 'x' },
    })
    for (const estimate of [estimateFromMindMap, estimateFromLayoutUtils]) {
      expect(estimate(both, 1).height - estimate(plain, 1).height).toBe(
        TOPIC_IMAGE_BLOCK + TOPIC_EQUATION_BLOCK,
      )
    }
  })

  it('方程槽位会抬高节点、并保证最小宽度', () => {
    const plain = estimateFromMindMap(makeTopic({ text: '短' }), 1)
    const withEquation = estimateFromMindMap(
      makeTopic({ text: '短', equation: { latex: 'x' } }),
      1,
    )

    expect(withEquation.height - plain.height).toBe(TOPIC_EQUATION_BLOCK)
    expect(withEquation.width).toBeGreaterThanOrEqual(TOPIC_EQUATION_MIN_WIDTH)
  })

  it('图片与方程可以叠加（各自预留一块）', () => {
    const imageOnly = estimateFromMindMap(makeTopic({ image: { assetId: 'a' } }), 1)
    const both = estimateFromMindMap(
      makeTopic({ image: { assetId: 'a' }, equation: { latex: 'x' } }),
      1,
    )
    expect(both.height - imageOnly.height).toBe(TOPIC_EQUATION_BLOCK)
  })
})

describe('estimateNodeSize 字号覆盖缩放', () => {
  it('未设置字号时几何与历史一致（比例 1）', () => {
    for (const depth of DEPTHS) {
      expect(estimateFromMindMap(makeTopic(), depth)).toEqual(
        estimateFromMindMap(makeTopic({ styleOverrides: {} }), depth),
      )
    }
  })

  it('放大字号会同时放大行高与字宽（否则文字溢出节点框）', () => {
    // 用短文本避免撞上 maxW 夹取，才能断言精确行高：
    // 深度 1 默认字号 14 / 行高 19 → 覆盖成 28 时行高 38，padY 11×2 = 22 不变
    const short = makeTopic({ text: '短标题' })
    const base = estimateFromMindMap(short, 1)
    const doubled = estimateFromMindMap(
      makeTopic({ text: '短标题', styleOverrides: { fontSize: 28 } }),
      1,
    )

    expect(base.height).toBe(22 + 19)
    expect(doubled.height).toBe(22 + 38)
    expect(doubled.width).toBeGreaterThan(base.width)
  })

  it('缩小字号同样生效，且不低于最小宽', () => {
    const base = estimateFromMindMap(makeTopic(), 1)
    const smaller = estimateFromMindMap(makeTopic({ styleOverrides: { fontSize: 8 } }), 1)

    expect(smaller.height).toBeLessThan(base.height)
    expect(smaller.width).toBeGreaterThanOrEqual(100)
  })

  it('非法字号回落默认几何（不产生 NaN / 负尺寸）', () => {
    const base = estimateFromMindMap(makeTopic(), 1)
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(estimateFromMindMap(makeTopic({ styleOverrides: { fontSize: bad } }), 1)).toEqual(base)
    }
  })

  it('固定宽度与字号覆盖可以叠加（宽度锁定、高度随字号增长）', () => {
    const small = estimateFromMindMap(
      makeTopic({ styleOverrides: { width: 200, fontSize: 14 } }),
      1,
    )
    const large = estimateFromMindMap(
      makeTopic({ styleOverrides: { width: 200, fontSize: 28 } }),
      1,
    )

    expect(small.width).toBe(200)
    expect(large.width).toBe(200)
    expect(large.height).toBeGreaterThan(small.height)
  })
})

/**
 * 全部骨架（不只是思维导图）都必须给富内容预留高度。
 *
 * ## 为什么要有这一层
 *
 * 双实现对照只能证明"两处一致"；而"分配高度装不装得下内容"是**另一个**问题 ——
 * 三端渲染器都无条件按 `TOPIC_IMAGE_TITLE_OFFSET` / `TOPIC_EQUATION_TITLE_OFFSET`
 * 把内容往下画，所以只要布局少给一块，内容就会跑到节点形状外面。
 *
 * 这条此前没人看：`layouts/layout-utils` 服务鱼骨 / 气泡 / 时间轴 / 组织架构 / 矩阵，
 * 却长期没给图片预留 —— 实测布局给 41px，三端要 137px。
 * 现在把它固化成"每种骨架 × 每种富内容组合"的断言。
 */
describe('每种骨架都为富内容预留高度', () => {
  /**
   * ⚠️ 写成 `Record<ChartType, true>` 而不是数组：新增一种骨架时 TS 会在这里报错，
   * 逼着把新骨架纳入下面的穷举。此前这里是一串手写的字面量，**漏掉了
   * `logic` / `tree` / `brace` 三种** —— 而"守卫覆盖度 = 作者当时想到的几种"
   * 正是上一轮那个图片溢出缺陷的成因。
   */
  const CHART_TYPE_MATRIX: Record<ChartType, true> = {
    mindmap: true,
    logic: true,
    tree: true,
    org: true,
    fishbone: true,
    timeline: true,
    brace: true,
    matrix: true,
    bubble: true,
    treetable: true,
  }
  const CHART_TYPES = Object.keys(CHART_TYPE_MATRIX) as ChartType[]

  function buildRoot(patch: Partial<TopicSnapshot>): TopicSnapshot {
    return makeTopic({
      id: 'root',
      text: '中心主题',
      children: [
        makeTopic({ id: 'annotated', text: '带富内容的主题', ...patch }),
        makeTopic({ id: 'control', text: '对照主题' }),
      ],
    })
  }

  function heightOf(root: TopicSnapshot, chartType: ChartType, id: string): number | null {
    const layout = computeLayout(root, chartType)
    return layout.nodes.find((node) => node.id === id)?.height ?? null
  }

  const CASES: Array<{ label: string; patch: Partial<TopicSnapshot>; extra: number }> = [
    { label: '图片', patch: { image: { assetId: 'asset_1' } }, extra: TOPIC_IMAGE_BLOCK },
    {
      label: '方程',
      patch: { equation: { latex: 'a^2+b^2=c^2' } },
      extra: TOPIC_EQUATION_BLOCK,
    },
    {
      label: '图片 + 方程',
      patch: { image: { assetId: 'asset_1' }, equation: { latex: 'x' } },
      extra: TOPIC_IMAGE_BLOCK + TOPIC_EQUATION_BLOCK,
    },
  ]

  for (const chartType of CHART_TYPES) {
    for (const testCase of CASES) {
      it(`${chartType} · ${testCase.label}：分配高度多出 ${testCase.extra}px，且不影响其它节点`, () => {
        const plain = buildRoot({})
        const withRich = buildRoot(testCase.patch)

        const before = heightOf(plain, chartType, 'annotated')
        const after = heightOf(withRich, chartType, 'annotated')
        expect(before, `${chartType} 里找不到 annotated 节点`).not.toBeNull()
        expect(after).not.toBeNull()
        expect(after! - before!).toBeCloseTo(testCase.extra, 5)

        // 对照节点不受影响（改动没有波及整幅图的节点尺寸）
        expect(heightOf(withRich, chartType, 'control')).toBe(
          heightOf(plain, chartType, 'control'),
        )
      })
    }
  }

  /**
   * 附件与语音备注**刻意不参与节点尺寸**：节点上只有一个 14×14 的图标
   * （回形针 / 话筒），画在节点右侧的 meta 行上，不占节点内部空间。
   *
   * 这条断言两个方向都盯住：
   *   - 有人给它们加了高度块 → 尺寸变了，红；
   *   - 有人"顺手"把它们从 `rich` 里摘掉（以为不影响布局）→ 由
   *     `scene-builder.test.ts` 里那两条"只带附件/只带语音"的用例兜住。
   * 之所以要显式写出来，是因为 `SIZE_FEATURES` 的笛卡尔积只验证"两处实现一致"，
   * 并不表达"这两个字段**不该**影响尺寸"这个契约。
   */
  const SIZE_NEUTRAL_FIELDS: Array<{ label: string; patch: Partial<TopicSnapshot> }> = [
    { label: '附件', patch: { attachment: { assetId: 'asset_pdf', name: '方案草案.pdf' } } },
    {
      label: '语音备注',
      patch: { voiceNote: { assetId: 'asset_voice', mimeType: 'audio/webm', durationMs: 3200 } },
    },
  ]

  for (const field of SIZE_NEUTRAL_FIELDS) {
    it(`${field.label}不参与节点尺寸（不应在布局里预留高度）`, () => {
      for (const chartType of CHART_TYPES) {
        const plain = buildRoot({})
        const withField = buildRoot(field.patch)

        for (const id of ['annotated', 'control']) {
          expect(
            heightOf(withField, chartType, id),
            `${chartType} 里 ${field.label} 改变了节点高（应保持不变）`,
          ).toBe(heightOf(plain, chartType, id))
        }
        // 宽度同样不该被改动
        for (const estimate of [estimateFromMindMap, estimateFromLayoutUtils]) {
          expect(estimate(makeTopic({ text: '短', ...field.patch }), 1)).toEqual(
            estimate(makeTopic({ text: '短' }), 1),
          )
        }
      }
    })
  }
})
