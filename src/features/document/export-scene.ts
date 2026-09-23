/**
 * 导出场景的构建（PNG / SVG / PDF / 「导出选中主题为图片」共用）。
 *
 * 为什么从 use-document-session 里抽出来：**「导出选中主题」需要在导出管线里
 * 复用画布那套可见集裁剪**，而"裁剪到底生效没有"必须能被单测直接钉住。
 * 藏在 hook 内部时，只能靠"真导出一次再看图"，而导出又依赖桌面端对话框——
 * 那就等于没法自动验证。
 *
 * 另一个收益：四个导出入口（PNG/SVG/PDF/选中主题）从此共用同一份场景构建，
 * 不会再出现"某个导出忘了传编号/主题"这类只在某一个出口暴露的偏差。
 */

import { resolveCanvasSettings } from '../../lib/document/canvas-settings'
import { restrictToVisibleTopics } from '../../lib/document/focus'
import { getActiveSheet } from '../../lib/document/sheets'
import type { DocumentSnapshot, TopicSnapshot } from '../../lib/document/types'
import { readAssetDataUrl } from '../../lib/ipc/commands'
import { computeLayout, restrictLayoutToTopicIds } from '../canvas/layouts'
import { buildTopicNumbers } from '../canvas/numbering'
import type { Scene } from '../canvas/runtime/render-tree'
import {
  buildScene,
  type InteractionOverlays,
  type TopicVisualStates,
} from '../canvas/runtime/scene-builder'
import { collectTopicImageAssetIds, collectTopicImageRefs } from '../canvas/runtime/topic-image-store'
import { buildFontStack } from '../../lib/document/canvas-settings'

/** 导出时没有任何交互态：选中/搜索/拖拽都不该出现在成品里。 */
const EXPORT_VISUAL_STATES: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const EXPORT_OVERLAYS: InteractionOverlays = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

/**
 * 把当前工作表里主题引用的图片资产解析为 data URL：topicId → data URL。
 *
 * 渲染端需要的是字节本身（`<image href>` / `drawImage` 都吃 data URL），
 * 而文档里只存 assetId，所以导出前必须做这一次解析。
 *
 * 单个资产解析失败（资源缺失 / 后端未就绪）时**静默跳过**该主题：
 * 导出不应因为一张坏图就整体失败，退化为「该主题无图」但版式与其余内容完整。
 */
async function resolveTopicImageUrls(rootTopic: TopicSnapshot): Promise<Record<string, string>> {
  const refs = collectTopicImageRefs(rootTopic)
  if (refs.length === 0) {
    return {}
  }

  // 按 assetId 去重，同一张图被多个主题引用时只请求一次
  const assetIds = collectTopicImageAssetIds(refs.map((ref) => ({ assetId: ref.assetId })))

  const entries = await Promise.all(
    assetIds.map(async (assetId) => {
      try {
        return { assetId, dataUrl: await readAssetDataUrl(assetId) }
      } catch {
        return { assetId, dataUrl: '' }
      }
    }),
  )

  const dataUrlByAssetId = new Map<string, string>()
  for (const entry of entries) {
    if (entry.dataUrl) {
      dataUrlByAssetId.set(entry.assetId, entry.dataUrl)
    }
  }

  const result: Record<string, string> = {}
  for (const ref of refs) {
    const dataUrl = dataUrlByAssetId.get(ref.assetId)
    if (dataUrl) {
      result[ref.topicId] = dataUrl
    }
  }

  return result
}

/**
 * 从文档构建导出场景（关闭视口剔除，渲染所有节点，并解析主题图片）。
 *
 * `restrictToTopicIds` 非空时只导出这些主题——**裁剪放在布局出口**，
 * 与画布上「仅显示该分支」调同一个 `restrictLayoutToTopicIds`：
 * 连线几何、外框/概要的包围盒读的都是这份 layout，裁一次即全局生效。
 * 引用型装饰（联系线 / 外框 / 概要）必须一并裁：漏掉会让外框缩成只剩可见主题的小圈
 * （`topicGroupBounds` 对缺失主题是跳过而非整体作废）。
 */
export async function buildExportScene(
  document: DocumentSnapshot,
  restrictToTopicIds?: ReadonlySet<string> | null,
): Promise<Scene> {
  const sheet = getActiveSheet(document)
  const canvasSettings = resolveCanvasSettings(document.settings)
  const fullLayout = computeLayout(sheet.rootTopic, sheet.chartType ?? 'mindmap', undefined, {
    balance: canvasSettings.balance,
    compact: canvasSettings.compact,
    alignSiblings: canvasSettings.alignSiblings,
    direction: sheet.layoutConfig?.direction,
    freeBranch: canvasSettings.freeBranchLayout,
    stackTopics: canvasSettings.stackTopics,
  })
  // ⚠️ **空集合按"不裁剪"处理**：`restrictLayoutToTopicIds(full, 空集)` 会把所有主题
  // 都裁掉、产出一张空图——而"没有任何可见主题"在调用侧只可能是"没指定范围"的意思。
  // 这条是写测试时实测出来的（原本注释里想当然写成"等同整幅图"，实际是空图）。
  const shouldRestrict = !!restrictToTopicIds && restrictToTopicIds.size > 0
  const layout = shouldRestrict
    ? restrictLayoutToTopicIds(fullLayout, restrictToTopicIds as ReadonlySet<string>)
    : fullLayout
  const topicImageUrls = await resolveTopicImageUrls(sheet.rootTopic)

  return buildScene({
    layout,
    viewport: { width: layout.width, height: layout.height },
    camera: { x: 0, y: 0, zoom: 1 },
    visualStates: EXPORT_VISUAL_STATES,
    overlays: EXPORT_OVERLAYS,
    // 装饰元素三个都是可选的：没裁剪、或本来就没有时**原样传下去**（不要拿空数组顶替，
    // 那会让"没启用"和"被裁空了"这两种情况在上游看起来一样）
    relationships:
      shouldRestrict && document.relationships
        ? restrictToVisibleTopics(
            document.relationships,
            (item) => [item.fromTopicId, item.toTopicId],
            restrictToTopicIds as ReadonlySet<string>,
          )
        : document.relationships,
    boundaries:
      shouldRestrict && sheet.boundaries
        ? restrictToVisibleTopics(
            sheet.boundaries,
            (item) => item.topicIds,
            restrictToTopicIds as ReadonlySet<string>,
          )
        : sheet.boundaries,
    summaries:
      shouldRestrict && sheet.summaries
        ? restrictToVisibleTopics(
            sheet.summaries,
            (item) => item.topicIds,
            restrictToTopicIds as ReadonlySet<string>,
          )
        : sheet.summaries,
    // 画布级插画**整体参与或整体排除**：它不属于任何分支，没有"裁一部分"的说法。
    // 一旦有可见集限制（导出选中主题 / 仅显示该分支）就排除——
    // 否则一张摆在远处的插画会把导出尺寸撑大（导出宽高取所有节点的紧包围盒），
    // 甚至把与选中主题无关的图形带进图里。
    illustrations: shouldRestrict ? [] : sheet.illustrations,
    themeId: document.theme?.id,
    branchStyle: sheet.branchStyle,
    // 编号必须与屏幕同源：导出少了这一项，PDF/PNG 就没有编号
    numberMap: buildTopicNumbers(sheet.rootTopic, sheet.numbering),
    canvasSettings: resolveCanvasSettings(document.settings),
    enableCulling: false,
    topicImageUrls,
  })
}

/**
 * 导出链路的渲染参数（主题 + 画布级背景覆盖）。
 *
 * **每个导出器都必须传**：PNG/SVG/PDF 在渲染时才解析背景色，
 * 不传 themeId 会一律回退到默认主题——暗色主题文档导出成浅底。
 */
export function exportRenderOptions(document: DocumentSnapshot): {
  themeId: string | undefined
  background: string | null
  fontFamily: string
} {
  const canvasSettings = resolveCanvasSettings(document.settings)
  return {
    themeId: document.theme?.id,
    background: canvasSettings.background,
    fontFamily: buildFontStack(canvasSettings.fontFamily, canvasSettings.cjkFont),
  }
}
