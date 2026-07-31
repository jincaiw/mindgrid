import type { MindMapNodeLayout } from './mindmap-layout'

export type NavigationDirection = 'up' | 'down' | 'left' | 'right'

/**
 * 在画布节点中按方向查找最近的相邻节点（XMind / MindNode 风格的方向键导航）。
 *
 * 算法：
 * 1. 过滤掉当前节点本身；
 * 2. 仅保留在目标方向"前向半平面"内的候选（forward > 0）；
 * 3. 按加权得分 `perp * 2 + forward` 排序，偏向正前方（垂直偏差小）的节点，
 *    再考虑前向距离，避免跨过大半个画布跳到斜向远端节点。
 *
 * 节点坐标使用布局中心坐标（node.x / node.y 已是中心点），
 * 所有节点共享同一坐标系，相对比较无需考虑 offsetX/offsetY。
 */
export function findNearestNodeInDirection(
  nodes: MindMapNodeLayout[],
  currentId: string,
  direction: NavigationDirection,
): MindMapNodeLayout | null {
  const current = nodes.find((node) => node.id === currentId)

  if (!current) {
    return null
  }

  let best: MindMapNodeLayout | null = null
  let bestScore = Infinity

  for (const node of nodes) {
    if (node.id === currentId) {
      continue
    }

    const dx = node.x - current.x
    const dy = node.y - current.y

    let forward = 0
    let perp = 0

    if (direction === 'right') {
      forward = dx
      perp = Math.abs(dy)
    } else if (direction === 'left') {
      forward = -dx
      perp = Math.abs(dy)
    } else if (direction === 'down') {
      forward = dy
      perp = Math.abs(dx)
    } else {
      forward = -dy
      perp = Math.abs(dx)
    }

    if (forward <= 0) {
      continue
    }

    // 垂直偏差权重更高，避免斜向远端节点抢断正前方近邻
    const score = perp * 2 + forward

    if (score < bestScore) {
      bestScore = score
      best = node
    }
  }

  return best
}
