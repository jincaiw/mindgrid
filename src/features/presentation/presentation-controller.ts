/**
 * 演示模式控制器：纯函数，无副作用。
 *
 * 职责：
 * 1. 从根主题构建 DFS 前序遍历序列（演示顺序）。
 * 2. 为每个步骤计算渐进式揭示集合（累计到此步骤应显示的节点）。
 * 3. 计算聚焦相机（让当前节点居中且清晰可读）与全景相机。
 * 4. 相机缓动插值（easeInOutCubic），供 rAF 动画循环驱动。
 *
 * 演示模式不修改文档，仅读取布局结果与主题树；揭示通过过滤布局节点/边实现，
 * 保持世界坐标系不变，确保相机动画连贯。
 */

import type { TopicSnapshot } from '../../lib/document/types'
import { restrictLayoutToTopicIds } from '../canvas/layouts'
import type {
  MindMapLayoutResult,
  MindMapNodeLayout,
} from '../canvas/mindmap-layout'

/** 演示步骤。 */
export interface PresentationSlide {
  /** 当前聚焦主题 ID。 */
  topicId: string
  /** 在遍历序列中的序号（0-based）。 */
  index: number
  /** 累计到此步骤（含）应显示的所有 topicId 集合（渐进式揭示）。 */
  revealUpTo: Set<string>
}

/** 相机状态（世界坐标 → 屏幕坐标投影）。 */
export interface PresentationCamera {
  x: number
  y: number
  zoom: number
}

/**
 * 从根主题构建 DFS 前序遍历序列。
 * 根节点在前，随后递归每个子分支；同层按 children 顺序。
 */
export function buildPresentationTraversal(root: TopicSnapshot): string[] {
  const order: string[] = []
  const walk = (topic: TopicSnapshot) => {
    order.push(topic.id)
    for (const child of topic.children) {
      walk(child)
    }
  }
  walk(root)
  return order
}

/**
 * 为遍历序列构建每个步骤的渐进揭示集合。
 * 第 i 步揭示序列前 i+1 个节点（含当前）。
 */
export function buildPresentationSlides(traversal: string[]): PresentationSlide[] {
  const slides: PresentationSlide[] = []
  const revealed = new Set<string>()
  for (let i = 0; i < traversal.length; i++) {
    revealed.add(traversal[i])
    slides.push({
      topicId: traversal[i],
      index: i,
      revealUpTo: new Set(revealed),
    })
  }
  return slides
}

/** 相机插值下限，防止极小文档过度放大。 */
const MIN_FOCUS_ZOOM = 0.6
/** 相机插值上限，防止极大文档节点过小。 */
const MAX_FOCUS_ZOOM = 1.8
/** 聚焦时节点宽度占视口的目标比例。 */
const FOCUS_WIDTH_RATIO = 0.42
/** 全景留白比例。 */
const FIT_ALL_PADDING = 0.9

/**
 * 计算聚焦某节点的相机：以该节点世界中心居中，缩放使其宽度约占视口 42%。
 * 找不到节点时回退到全景相机。
 */
export function computeFocusCamera(
  layout: MindMapLayoutResult,
  focusTopicId: string,
  viewport: { width: number; height: number },
): PresentationCamera {
  const node = layout.nodes.find((n) => n.id === focusTopicId)
  if (!node) {
    return computeFitAllCamera(layout, viewport)
  }
  return focusCameraOnNode(node, layout.offsetX, layout.offsetY, viewport)
}

function focusCameraOnNode(
  node: MindMapNodeLayout,
  offsetX: number,
  offsetY: number,
  viewport: { width: number; height: number },
): PresentationCamera {
  // 节点世界中心（与 scene-builder 的 layoutNodeToBounds 一致）
  const cx = node.x + offsetX
  const cy = node.y + offsetY
  const targetZoom = clamp(
    (viewport.width * FOCUS_WIDTH_RATIO) / Math.max(node.width, 1),
    MIN_FOCUS_ZOOM,
    MAX_FOCUS_ZOOM,
  )
  // 相机是**屏幕坐标偏移**：screen = cam + world * zoom（见 computeFitAllCamera 的说明）
  return {
    x: viewport.width / 2 - cx * targetZoom,
    y: viewport.height / 2 - cy * targetZoom,
    zoom: targetZoom,
  }
}

/**
 * 计算全景相机：让整个布局包围盒居中适配视口（含 10% 留白）。
 * 空布局或零尺寸时回退到默认相机。
 */
export function computeFitAllCamera(
  layout: MindMapLayoutResult,
  viewport: { width: number; height: number },
): PresentationCamera {
  const worldW = Math.max(layout.width, 1)
  const worldH = Math.max(layout.height, 1)
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, zoom: 1 }
  }
  const zoom = clamp(
    Math.min(viewport.width / worldW, viewport.height / worldH) * FIT_ALL_PADDING,
    MIN_FOCUS_ZOOM,
    MAX_FOCUS_ZOOM,
  )
  // 相机约定：**相机是屏幕坐标偏移**，屏幕上 screen = cam + world * zoom
  // （与 canvas-renderer 的 `translate(cam); scale(zoom)` 及编辑画布的
  //  `centerCameraOnWorldPoint` 一致）。布局世界坐标从 (0,0) 起、跨 [0, worldW]×[0, worldH]，
  // 居中即让这段世界范围落在视口正中。
  //
  // 这里与 focusCameraOnNode 曾写成「相机=世界坐标左上角」的另一套约定
  // （`(worldW - vw/zoom)/2`），与渲染器不符 —— 后果是放映/简报的取景整体错位
  // （旧取证图 outputs/native/ui-states/12-presentation.png 里「中心主题」明显偏左上）。
  return {
    x: (viewport.width - worldW * zoom) / 2,
    y: (viewport.height - worldH * zoom) / 2,
    zoom,
  }
}

/**
 * 按揭示集合过滤布局：只保留已揭示的节点，以及两端均已揭示的边。
 *
 * 与画布聚焦模式（`restrictLayoutToTopicIds`）共用同一个裁剪实现——
 * 两者语义完全相同，只是集合来源不同（放映是「已揭示」，聚焦是「该分支 + 祖先路径」）。
 * 放映这条路径是有意**不**保留未揭示的节点：镜头要落在当前幻灯片上。
 */
export function filterLayoutByRevealed(
  layout: MindMapLayoutResult,
  revealed: Set<string>,
): MindMapLayoutResult {
  return restrictLayoutToTopicIds(layout, revealed)
}

/** easeInOutCubic 缓动。t ∈ [0, 1]。 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * 在两台相机间线性插值（按 progress ∈ [0, 1]）。
 * zoom 用对数空间插值，使缩放过渡视觉均匀。
 */
export function interpolateCamera(
  from: PresentationCamera,
  to: PresentationCamera,
  progress: number,
): PresentationCamera {
  const eased = easeInOutCubic(clamp(progress, 0, 1))
  const fromLogZoom = Math.log(Math.max(from.zoom, 0.0001))
  const toLogZoom = Math.log(Math.max(to.zoom, 0.0001))
  const zoom = Math.exp(fromLogZoom + (toLogZoom - fromLogZoom) * eased)
  return {
    x: from.x + (to.x - from.x) * eased,
    y: from.y + (to.y - from.y) * eased,
    zoom,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
