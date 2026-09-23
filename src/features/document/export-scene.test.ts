import { describe, expect, it } from 'vitest'
import type { DocumentSnapshot, TopicSnapshot } from '../../lib/document/types'
import { buildExportScene } from './export-scene'

/**
 * 导出场景的裁剪（「导出选中主题为图片」的核心）。
 *
 * 为什么值得单独测：导出依赖桌面端的保存对话框，浏览器里跑不了整条链路，
 * 所以"裁剪到底生效没有"只能在这一层钉住。这也正是把 buildExportScene
 * 从 hook 里抽出来的原因——藏在 hook 内部时，这段逻辑没有任何可测入口。
 */

function topic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

/**
 * 结构：root → [a → [a1], b]
 *
 * 带两类跨分支装饰：
 * - 联系线 r1：a1 → b（一端在可见集外）
 * - 外框 bd1：框住 [a, b]（**部分**在可见集外）
 */
function makeDocument(): DocumentSnapshot {
  return {
    schemaVersion: '1.0.0',
    documentId: 'doc_1',
    revision: 1,
    activeSheetId: 'sheet_1',
    sheets: [
      {
        id: 'sheet_1',
        title: '主画布',
        rootTopic: topic('root', '中心主题', [
          topic('a', '分支 A', [topic('a1', 'A 的子主题')]),
          topic('b', '分支 B'),
        ]),
        boundaries: [{ id: 'bd1', topicIds: ['a', 'b'], label: '一组' }],
        illustrations: [
          { id: 'ill_1', illustrationId: 'rocket', x: 500, y: 300, size: 120 },
        ],
      },
    ],
    relationships: [{ id: 'r1', fromTopicId: 'a1', toTopicId: 'b' }],
  }
}

function topicIdsOf(scene: Awaited<ReturnType<typeof buildExportScene>>): string[] {
  return scene.nodes
    .filter((node) => node.type === 'topic')
    .map((node) => node.id)
    .sort()
}

const VISIBLE_A = new Set(['root', 'a', 'a1'])

describe('buildExportScene · 裁剪', () => {
  it('不传可见集时导出整幅图', async () => {
    const scene = await buildExportScene(makeDocument())

    expect(topicIdsOf(scene)).toEqual(['a', 'a1', 'b', 'root'])
    expect(scene.nodes.some((node) => node.type === 'boundary')).toBe(true)
  })

  it('传可见集时只导出这部分（含中心主题到目标的路径）', async () => {
    const scene = await buildExportScene(makeDocument(), VISIBLE_A)

    expect(topicIdsOf(scene)).toEqual(['a', 'a1', 'root'])
  })

  it('部分可见的外框被整块裁掉（而不是缩水成只剩可见主题的小圈）', async () => {
    // 这条是本文件里**真正有鉴别力**的断言：`topicGroupBounds` 对缺失主题是
    // "跳过"，所以不裁的话外框会缩成只套住 a 的小圈——比"留一条看得见的线"更隐蔽。
    const scene = await buildExportScene(makeDocument(), VISIBLE_A)

    expect(scene.nodes.some((node) => node.type === 'boundary')).toBe(false)
  })

  it('一端在可见集外的联系线也不出现', async () => {
    // ⚠️ 这条的鉴别力**有限**：buildScene 对"引用已不存在节点"的关系线本来就会跳过，
    // 所以即使不裁也看不到它。留着当安全网；真正区分两种实现的是上面外框那条
    // （写这条时先跑了负向对照，"装饰不裁"在这里仍然是绿的，才发现它测不出东西）。
    const scene = await buildExportScene(makeDocument(), VISIBLE_A)

    expect(scene.nodes.some((node) => node.type === 'relationship')).toBe(false)
  })

  it('空可见集按"不裁剪"处理，避免产出一张空图', async () => {
    // ⚠️ 这条是实测出来的：直接把空集合交给 restrictLayoutToTopicIds 会把主题全裁掉，
    // 导出结果是一张空图。空集合在调用侧只可能是"没指定范围"，所以按不裁剪处理。
    const scene = await buildExportScene(makeDocument(), new Set())

    expect(topicIdsOf(scene)).toEqual(['a', 'a1', 'b', 'root'])
  })
})

describe('buildExportScene · 画布级插画', () => {
  it('导出整幅图时带上插画', async () => {
    const scene = await buildExportScene(makeDocument())

    expect(scene.nodes.filter((node) => node.type === 'illustration')).toHaveLength(1)
  })

  it('有可见集限制时插画整体排除（不裁一半、也不撑大导出尺寸）', async () => {
    // 插画不属于任何分支，没有"裁一部分"的说法；留着它会让导出宽高
    // （取所有节点的紧包围盒）被一张远处的图形撑开。
    const scene = await buildExportScene(makeDocument(), VISIBLE_A)

    expect(scene.nodes.some((node) => node.type === 'illustration')).toBe(false)
  })
})
