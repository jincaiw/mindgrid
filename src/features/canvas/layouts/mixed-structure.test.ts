/**
 * 混合骨架（节点级「结构 / 方向」）的几何与留白。
 *
 * 关注四件事：
 * 1. **真实层级**：子树换骨架后仍按它在整幅图里的层级取节点尺寸与 `depth`，
 *    不能因为"自己成了子布局的根"就被当成中心主题（字号/内边距都会变大）。
 * 2. **只替换后代**：嫁接保留该主题自身的节点与父连线，换掉的只是它下面那部分几何。
 * 3. **留白**：换骨架的子树占地变大后，同侧兄弟分支必须被推开，不能压在一起。
 * 4. **方向**：节点级 `structure.direction` 覆盖自动分配 / 继承来的朝向。
 */

import { describe, expect, it } from 'vitest'

import { BRANCH_CHART_TYPES, type TopicSnapshot } from '../../../lib/document/types'
import { computeLayout } from './index'

/** 可作为分支骨架的类型（不含脑图本身；脑图那档由"方向"覆盖即可）。 */
const COMBOS = BRANCH_CHART_TYPES.filter((type) => type !== 'mindmap')

function topic(
  id: string,
  text: string,
  children: TopicSnapshot[] = [],
  structure?: TopicSnapshot['structure'],
): TopicSnapshot {
  return {
    id,
    text,
    collapsed: false,
    children,
    ...(structure ? { structure } : {}),
  }
}

function boundsOf(
  nodes: { id: string; x: number; y: number; width: number; height: number }[],
  ids: string[],
) {
  const picked = nodes.filter((node) => ids.includes(node.id))
  const minY = Math.min(...picked.map((n) => n.y - n.height / 2))
  const maxY = Math.max(...picked.map((n) => n.y + n.height / 2))
  const minX = Math.min(...picked.map((n) => n.x - n.width / 2))
  const maxX = Math.max(...picked.map((n) => n.x + n.width / 2))
  return { minY, maxY, minX, maxX }
}

/** 简单的「结构」画布：两个右侧分支 + 一个左侧分支。 */
function makeCanvas(thirdStructure?: TopicSnapshot['structure']) {
  return topic('root', '中心主题', [
    topic('r1', '右一', [topic('r1a', '右一子')]),
    topic('l1', '左一', [topic('l1a', '左一子')]),
    topic('r2', '右二', [
      topic('r2a', '右二子一'),
      topic('r2b', '右二子二'),
      topic('r2c', '右二子三'),
    ], thirdStructure),
  ])
}

describe('混合骨架 · 嫁接', () => {
  it('无覆盖时与普通布局完全一致（不引入任何偏移）', () => {
    const plain = computeLayout(makeCanvas(), 'mindmap')
    const rerun = computeLayout(makeCanvas(), 'mindmap', undefined, {})

    expect(rerun.nodes.map((n) => [n.id, n.x, n.y, n.depth])).toEqual(
      plain.nodes.map((n) => [n.id, n.x, n.y, n.depth]),
    )
  })

  it('子树换骨架后仍保留真实层级（不套用中心主题尺寸）', () => {
    const layout = computeLayout(makeCanvas({ chartType: 'org' }), 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    // r2 是深度 1 的分支，换骨架后它自己仍是 1；它的子主题在整幅图里是 2
    expect(byId.get('r2')?.depth).toBe(1)
    expect(byId.get('r2a')?.depth).toBe(2)
    expect(byId.get('r2b')?.depth).toBe(2)

    // 层级没被当成根：节点高度应等于深度 2 的口径（padY9×2 + 一行 18 = 36），
    // 若被误判成 depth 1 会是 11×2 + 19 = 41
    expect(byId.get('r2a')?.height).toBe(36)
  })

  it('按目标骨架排布（组织结构图把子主题放在下方）', () => {
    const layout = computeLayout(makeCanvas({ chartType: 'org' }), 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const parent = byId.get('r2')!
    const child = byId.get('r2a')!

    // 组织结构图：子主题在下一行（ROW_HEIGHT = 100）
    expect(child.y - parent.y).toBe(100)
    const second = byId.get('r2b')!
    expect(second.y).toBe(child.y)
    expect(second.x).not.toBe(child.x)
  })

  it('只替换后代：该主题自身的节点与父连线仍在，且总数正确', () => {
    const layout = computeLayout(makeCanvas({ chartType: 'org' }), 'mindmap')

    // root + r1 + r1a + l1 + l1a + r2 + r2a + r2b + r2c
    expect(layout.nodes).toHaveLength(9)
    expect(layout.edges.some((e) => e.childId === 'r2')).toBe(true)
    expect(layout.edges.some((e) => e.parentId === 'r2' && e.childId === 'r2a')).toBe(true)
    // 旧骨架下 r2 的后代连线不会残留在结果里
    const duplicateChildren = layout.edges.filter((e) => e.childId === 'r2a')
    expect(duplicateChildren).toHaveLength(1)
  })

  it('深层覆盖同样生效（覆盖主题不在顶层）', () => {
    const root = topic('root', '中心主题', [
      topic('a', '甲', [topic('b', '乙', [topic('b1', '乙一')], { chartType: 'tree' })]),
    ])
    const layout = computeLayout(root, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    // b 在整幅图里是深度 2，它的子主题是深度 3
    expect(byId.get('b')?.depth).toBe(2)
    expect(byId.get('b1')?.depth).toBe(3)
  })

  it('嵌套覆盖：内层换骨架后仍按自己的骨架排', () => {
    const root = topic('root', '中心主题', [
      topic('a', '甲', [
        topic('b', '乙', [topic('b1', '乙一', [topic('b1x', '乙一子')])], { chartType: 'org' }),
      ]),
    ])
    // 乙一自己再换成逻辑图（向右展开）
    root.children[0].children[0].children[0].structure = { chartType: 'logic' }

    const layout = computeLayout(root, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    expect(byId.get('b1x')?.depth).toBe(4)
    // 逻辑图向右展开 → 子节点在父节点右侧
    expect(byId.get('b1x')!.x).toBeGreaterThan(byId.get('b1')!.x)
  })

  it('折叠的覆盖主题不参与布局（只保留它自己）', () => {
    const root = makeCanvas({ chartType: 'org' })
    root.children[2].collapsed = true

    const layout = computeLayout(root, 'mindmap')
    expect(layout.nodes.some((node) => node.id === 'r2a')).toBe(false)
    expect(layout.nodes.some((node) => node.id === 'r2')).toBe(true)
  })
})

describe('混合骨架 · 留白', () => {
  it('换骨架的子树变大后，同侧兄弟分支被推开（不重叠）', () => {
    const canvas = makeCanvas({ chartType: 'org' })
    const layout = computeLayout(canvas, 'mindmap')

    // r1 与 r2 同在右侧（index 0 与 2 都是 right）
    const r1 = boundsOf(layout.nodes, ['r1a'])
    const r2 = boundsOf(layout.nodes, ['r2a', 'r2b', 'r2c'])

    expect(r2.maxX - r2.minX).toBeGreaterThan(0)
    // 右侧两簇的纵向区间不重叠
    expect(r1.maxY).toBeLessThanOrEqual(r2.minY + 0.001)
  })

  it('换骨架后全图任意两个节点都不重叠（留白足够容纳子树）', () => {
    for (const chartType of COMBOS) {
      const layout = computeLayout(makeCanvas({ chartType }), 'mindmap')
      for (let i = 0; i < layout.nodes.length; i += 1) {
        for (let j = i + 1; j < layout.nodes.length; j += 1) {
          const a = layout.nodes[i]
          const b = layout.nodes[j]
          const apart =
            a.x + a.width / 2 <= b.x - b.width / 2 + 0.001 ||
            b.x + b.width / 2 <= a.x - a.width / 2 + 0.001 ||
            a.y + a.height / 2 <= b.y - b.height / 2 + 0.001 ||
            b.y + b.height / 2 <= a.y - a.height / 2 + 0.001
          expect(apart, `${chartType}: ${a.id} 与 ${b.id} 重叠`).toBe(true)
        }
      }
    }
  })
})

describe('节点级分支方向', () => {
  it('一级分支声明向左后固定在左侧', () => {
    const canvas = makeCanvas()
    canvas.children[0].structure = { direction: 'left' }

    const layout = computeLayout(canvas, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    expect(byId.get('r1')!.x).toBeLessThan(0)
    // 子树跟随：子主题也在左侧、且比父更靠左
    expect(byId.get('r1a')!.x).toBeLessThan(byId.get('r1')!.x)
  })

  it('深处主题声明向右后，其子主题向右展开（即使所在分支在左侧）', () => {
    // root → a(左) → b → c：在 b 上声明"子主题向右"，c 必须越过 b 向右走
    const root = topic('root', '中心主题', [
      topic('a', '甲', [topic('b', '乙', [topic('c', '丙')])]),
      topic('d', '丁'),
    ])
    root.children[0].structure = { direction: 'left' }
    root.children[0].children[0].structure = { direction: 'right' }

    const layout = computeLayout(root, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    expect(byId.get('a')!.x).toBeLessThan(0)
    expect(byId.get('b')!.x).toBeLessThan(byId.get('a')!.x)
    // 丙相对乙是"向右展开"
    expect(byId.get('c')!.x).toBeGreaterThan(byId.get('b')!.x)
  })

  it("'balanced' 与缺省一样不指定朝向", () => {
    const declared = makeCanvas()
    declared.children[0].structure = { direction: 'balanced' }
    const plain = computeLayout(declared, 'mindmap')
    const baseline = computeLayout(makeCanvas(), 'mindmap')

    expect(plain.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
      baseline.nodes.map((n) => [n.id, n.x, n.y]),
    )
  })

  it('子布局的脑图朝向跟随所在分支（不会越过中心主题）', () => {
    // 左侧分支换回脑图骨架：它的子主题必须继续向左，而不是被平分到右侧
    const canvas = makeCanvas()
    canvas.children[1].structure = { chartType: 'mindmap', direction: 'left' }

    const layout = computeLayout(canvas, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    expect(byId.get('l1')!.x).toBeLessThan(0)
    expect(byId.get('l1a')!.x).toBeLessThan(byId.get('l1')!.x)
  })
})

describe('混合骨架 · 跨骨架组合', () => {

  it('每种骨架都能作为子树骨架嫁接且不丢节点', () => {
    for (const chartType of COMBOS) {
      const layout = computeLayout(makeCanvas({ chartType }), 'mindmap')
      const ids = layout.nodes.map((node) => node.id)
      expect(ids, `${chartType} 丢了节点`).toHaveLength(9)
      expect(new Set(ids).size, `${chartType} 出现重复节点`).toBe(9)
      // 每个非根节点都有一条入边，且没有重复
      for (const id of ids.filter((id) => id !== 'root')) {
        const incoming = layout.edges.filter((edge) => edge.childId === id)
        expect(incoming, `${chartType} 的 ${id} 入边异常`).toHaveLength(1)
      }
    }
  })

  it('左侧分支换「向右流动」的骨架时会镜像，朝外（向左）生长', () => {
    const canvas = makeCanvas()
    canvas.children[1].structure = { chartType: 'logic' }

    const layout = computeLayout(canvas, 'mindmap')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))
    const parent = byId.get('l1')!
    const child = byId.get('l1a')!

    expect(parent.x).toBeLessThan(0)
    // 未镜像的话子主题会在父节点右侧（也就是朝中心主题方向）
    expect(child.x).toBeLessThan(parent.x)
  })

  it('非脑图画布上换骨架同样生效（顶层是组织结构图）', () => {
    const root = topic('root', '中心主题', [
      topic('a', '甲', [topic('a1', '甲一', [topic('a1x', '甲一子')])], {
        chartType: 'logic',
      }),
      topic('b', '乙'),
    ])
    const layout = computeLayout(root, 'org')
    const byId = new Map(layout.nodes.map((node) => [node.id, node]))

    expect(byId.get('a1')?.depth).toBe(2)
    expect(byId.get('a1x')?.depth).toBe(3)
    // 逻辑图向右：孙节点在子节点右侧
    expect(byId.get('a1x')!.x).toBeGreaterThan(byId.get('a1')!.x)
  })
})
