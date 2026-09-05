/**
 * 提案简报（Pitch）控制器：纯函数，无副作用。
 *
 * 与演示模式（presentation-controller）的区别，也是两者并存而非合并的理由：
 *   - 演示 = 全屏渐进揭示。按 DFS 前序逐个揭示节点，每步只多露一个，
 *     适合"边讲边展开"的叙事，幻灯片数量等于主题总数（大文档会很长）。
 *   - Pitch = 分幕展示。一幕 = 根节点 + 一个一级分支的完整子树，
 *     幕数等于一级分支数 + 1（总览），适合"一个分支讲一段"的汇报结构。
 *
 * 二者共用 Canvas Runtime 的 buildScene / renderScene 与相机数学，
 * 差异只在"每一幕揭示哪些节点"。
 */

import type { TopicSnapshot } from '../../lib/document/types'

/** 舞台长宽比。'fit' 表示铺满容器（不约束比例）。 */
export type PitchAspectRatio = '16:9' | '4:3' | '1:1' | 'fit'

export const PITCH_ASPECT_RATIOS: ReadonlyArray<{
  id: PitchAspectRatio
  label: string
  width: number
  height: number
}> = [
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '4:3', label: '4:3', width: 4, height: 3 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
]

/** 提案简报可用主题风格：跟随文档主题，或强制暗色（投影环境下更易读）。 */
export type PitchThemeStyle = 'document' | 'dark' | 'light'

/** 强制使用的内置主题 id（PitchThemeStyle → 主题 id） */
export const PITCH_THEME_ID_BY_STYLE: Record<Exclude<PitchThemeStyle, 'document'>, string> = {
  dark: 'dark',
  light: 'classic-blue',
}

export interface PitchAct {
  /** 幕序号（0-based）。0 恒为总览幕。 */
  index: number
  /** 该幕代表的主题：总览幕为根节点，其余为对应的一级分支。 */
  topicId: string
  /** 幕标题：总览幕为「总览」，其余为分支文本。 */
  title: string
  /** 该幕显示的节点集合（根节点 + 本分支子树）。 */
  revealed: Set<string>
  /** 该分支的直接子主题数，供 UI 显示"本幕涵盖 N 个要点"。 */
  pointCount: number
}

function collectSubtreeIds(topic: TopicSnapshot, into: Set<string>) {
  into.add(topic.id)
  for (const child of topic.children) {
    collectSubtreeIds(child, into)
  }
}

function countChildren(topic: TopicSnapshot): number {
  return topic.children.length
}

/**
 * 构建提案简报的分幕序列。
 *
 * - 第 0 幕：总览。只显示根节点与其全部一级分支（不展开更深层级），
 *   用于开场交代整体结构。
 * - 第 i 幕（i ≥ 1）：根节点 + 第 i-1 个一级分支的完整子树。
 *
 * 根节点无子分支时只产出总览幕——此时"分幕"没有意义，避免生成一堆空白幕。
 */
export function buildPitchActs(root: TopicSnapshot): PitchAct[] {
  const branches = root.children
  const acts: PitchAct[] = []

  const overviewRevealed = new Set<string>([root.id])
  for (const branch of branches) {
    overviewRevealed.add(branch.id)
  }

  acts.push({
    index: 0,
    topicId: root.id,
    title: '总览',
    revealed: overviewRevealed,
    pointCount: branches.length,
  })

  branches.forEach((branch, branchIndex) => {
    const revealed = new Set<string>([root.id])
    collectSubtreeIds(branch, revealed)

    acts.push({
      index: branchIndex + 1,
      topicId: branch.id,
      title: branch.text,
      revealed,
      pointCount: countChildren(branch),
    })
  })

  return acts
}

/**
 * 按长宽比计算舞台尺寸：在容器内取该比例下的最大内接矩形。
 * 'fit' 直接铺满容器。容器尚未测量（0 尺寸）时返回 0，调用方据此跳过绘制。
 */
export function computePitchStageSize(
  container: { width: number; height: number },
  ratio: PitchAspectRatio,
): { width: number; height: number } {
  if (container.width <= 0 || container.height <= 0) {
    return { width: 0, height: 0 }
  }

  if (ratio === 'fit') {
    return { width: Math.round(container.width), height: Math.round(container.height) }
  }

  const preset = PITCH_ASPECT_RATIOS.find((item) => item.id === ratio)
  if (!preset) {
    return { width: Math.round(container.width), height: Math.round(container.height) }
  }

  const scale = Math.min(container.width / preset.width, container.height / preset.height)

  return {
    width: Math.round(preset.width * scale),
    height: Math.round(preset.height * scale),
  }
}

/** 根据风格选择解析出实际用于渲染的主题 id */
export function resolvePitchThemeId(
  style: PitchThemeStyle,
  documentThemeId: string | undefined,
): string | undefined {
  if (style === 'document') return documentThemeId
  return PITCH_THEME_ID_BY_STYLE[style]
}
