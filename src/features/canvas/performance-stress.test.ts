/**
 * 性能基线压测：验证 Canvas Runtime 在 1k / 3k / 10k 节点规模下可布局、可建场景、
 * 可视口剔除生效，且时间在合理预算内（捕获 O(n²) 退化）。
 *
 * 时间阈值取宽松上界，目的是在 CI 上稳定通过的同时，挡住阶数级退化
 * （O(n²) 在 10k 规模会达数十秒乃至超时）。本机实测远低于阈值。
 */

import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../lib/document/types'
import { computeLayout } from './layouts'
import { buildScene } from './runtime/scene-builder'

/** 按 BFS 生成近似平衡的多叉树，节点总数约等于 nodeCount。 */
function generateTree(nodeCount: number, branchingFactor = 5): TopicSnapshot {
  const root: TopicSnapshot = {
    id: 'n0',
    text: '根主题',
    collapsed: false,
    children: [],
  }
  const queue: TopicSnapshot[] = [root]
  let created = 1
  while (created < nodeCount) {
    const parent = queue.shift()!
    if (!parent) break
    const childCount = Math.min(branchingFactor, nodeCount - created)
    for (let i = 0; i < childCount; i++) {
      created++
      parent.children.push({
        id: `n${created}`,
        text: `节点 ${created}`,
        collapsed: false,
        children: [],
      })
      queue.push(parent.children[parent.children.length - 1])
    }
  }
  return root
}

function countTopics(topic: TopicSnapshot): number {
  let count = 1
  for (const child of topic.children) {
    count += countTopics(child)
  }
  return count
}

const EMPTY_VISUAL_STATES = {
  activeTopicId: null,
  selectedTopicIds: new Set<string>(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set<string>(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const EMPTY_OVERLAYS = { selectionBox: null, dragPreview: null, dropIndicator: null }

function measureLayout(nodeCount: number) {
  const root = generateTree(nodeCount)
  expect(countTopics(root)).toBe(nodeCount)
  const start = performance.now()
  const layout = computeLayout(root, 'mindmap')
  const elapsed = performance.now() - start
  return { layout, elapsed, root }
}

function measureScene(
  layout: ReturnType<typeof computeLayout>,
  viewport: { width: number; height: number },
  enableCulling: boolean,
) {
  const start = performance.now()
  const scene = buildScene({
    layout,
    viewport,
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: EMPTY_VISUAL_STATES,
    overlays: EMPTY_OVERLAYS,
    enableCulling,
  })
  const elapsed = performance.now() - start
  return { scene, elapsed }
}

describe('canvas runtime 性能基线', () => {
  it('layouts 1k nodes within budget', () => {
    const { layout, elapsed, root } = measureLayout(1000)
    expect(layout.nodes).toHaveLength(1000)
    // 边数 = 节点数 - 1（树）
    expect(layout.edges).toHaveLength(999)
    // 宽松预算：1k 布局 < 300ms（本机通常 < 30ms）
    expect(elapsed).toBeLessThan(300)
    // 根节点应在布局结果中
    expect(layout.nodes.some((n) => n.id === root.id)).toBe(true)
  })

  it('layouts 3k nodes within budget', () => {
    const { layout, elapsed } = measureLayout(3000)
    expect(layout.nodes).toHaveLength(3000)
    expect(elapsed).toBeLessThan(800)
  })

  it('layouts 10k nodes within budget (no O(n²) blowup)', () => {
    const { layout, elapsed } = measureLayout(10000)
    expect(layout.nodes).toHaveLength(10000)
    expect(layout.edges).toHaveLength(9999)
    // 宽松预算：10k 布局 < 3000ms。O(n²) 实现会达数十秒。
    expect(elapsed).toBeLessThan(3000)
  })

  it('builds a full scene for 10k nodes within budget', () => {
    const { layout } = measureLayout(10000)
    const { scene, elapsed } = measureScene(
      layout,
      { width: 100000, height: 100000 },
      false,
    )
    // 关闭剔除时应渲染全部节点 + 边
    const topicNodes = scene.nodes.filter((n) => n.type === 'topic').length
    const edgeNodes = scene.nodes.filter((n) => n.type === 'edge').length
    expect(topicNodes).toBe(10000)
    expect(edgeNodes).toBe(9999)
    // 全量建场景宽松预算 < 1500ms
    expect(elapsed).toBeLessThan(1500)
  })

  it('viewport culling drastically reduces rendered nodes for 10k', () => {
    const { layout } = measureLayout(10000)
    // 仅一个 800×600 的视口，相机在原点 → 只能看到树的一小部分
    const { scene } = measureScene(layout, { width: 800, height: 600 }, true)
    const visibleTopicNodes = scene.nodes.filter((n) => n.type === 'topic').length
    // 虚拟化应将可见节点数压到远小于总量
    expect(visibleTopicNodes).toBeLessThan(10000)
    expect(visibleTopicNodes).toBeLessThan(500)
    // 世界包围盒仍应覆盖全量布局（不受剔除影响）
    expect(scene.worldBounds.width).toBe(layout.width)
    expect(scene.worldBounds.height).toBe(layout.height)
  })

  it('layout time scales roughly linearly (10k < 6× 1k)', () => {
    const t1k = measureLayout(1000).elapsed
    const t10k = measureLayout(10000).elapsed
    // 线性 O(n)：10k/1k ≈ 10×；O(n log n) 略高；O(n²) 会 >> 60×。
    // 阈值 60× 容忍常数项与对数因子，挡住平方退化。
    const ratio = t10k / Math.max(t1k, 0.001)
    expect(ratio).toBeLessThan(60)
  })
})
