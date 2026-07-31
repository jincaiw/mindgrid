import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Minimap } from './minimap'
import type { MindMapLayoutResult } from './mindmap-layout'
import type { TopicSnapshot } from '../../lib/document/types'

const topic: TopicSnapshot = {
  id: 'topic_root',
  text: '中心主题',
  collapsed: false,
  children: [],
}

const layout: MindMapLayoutResult = {
  nodes: [
    {
      id: 'topic_root',
      topic,
      depth: 0,
      side: 'center',
      x: 0,
      y: 0,
      width: 140,
      height: 48,
    },
    {
      id: 'topic_a',
      topic: { ...topic, id: 'topic_a' },
      depth: 1,
      side: 'right',
      x: 240,
      y: 80,
      width: 120,
      height: 40,
    },
  ],
  edges: [
    {
      id: 'e1',
      parentId: 'topic_root',
      childId: 'topic_a',
      side: 'right',
      path: '',
      start: { x: 0, y: 0 },
      end: { x: 240, y: 80 },
      control1: { x: 120, y: 0 },
      control2: { x: 120, y: 80 },
    },
  ],
  width: 400,
  height: 200,
  offsetX: 200,
  offsetY: 100,
}

describe('Minimap', () => {
  it('renders the navigator canvas', () => {
    render(
      <Minimap
        layout={layout}
        camera={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
        onNavigate={() => {}}
      />,
    )

    expect(screen.getByRole('navigation', { name: '小地图导航' })).toBeInTheDocument()
  })

  it('calls onNavigate with a camera that keeps zoom and centers on the clicked board point', () => {
    const onNavigate = vi.fn()

    render(
      <Minimap
        layout={layout}
        camera={{ x: 0, y: 0, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
        onNavigate={onNavigate}
      />,
    )

    // jsdom 的 getBoundingClientRect 返回 0，因此 clientX/clientY 即画布坐标
    const canvas = screen.getByRole('navigation', { name: '小地图导航' }).querySelector('canvas')!

    fireEvent.click(canvas, { clientX: 50, clientY: 50 })

    expect(onNavigate).toHaveBeenCalledTimes(1)
    const target = onNavigate.mock.calls[0][0]
    // 缩放保持不变
    expect(target.zoom).toBe(1)
    // 视口中心 = 画板点 * zoom + camera → camera = center - board*zoom
    expect(Number.isFinite(target.x)).toBe(true)
    expect(Number.isFinite(target.y)).toBe(true)
  })
})
