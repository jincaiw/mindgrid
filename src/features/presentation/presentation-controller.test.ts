import { describe, expect, it } from 'vitest'
import type { TopicSnapshot } from '../../lib/document/types'
import type { MindMapLayoutResult } from '../canvas/mindmap-layout'
import {
  buildPresentationSlides,
  buildPresentationTraversal,
  computeFitAllCamera,
  computeFocusCamera,
  easeInOutCubic,
  filterLayoutByRevealed,
  interpolateCamera,
} from './presentation-controller'

function makeTopic(id: string, text: string, children: TopicSnapshot[] = []): TopicSnapshot {
  return { id, text, collapsed: false, children }
}

function sampleTree(): TopicSnapshot {
  return makeTopic('root', '根', [
    makeTopic('a', 'A', [makeTopic('a1', 'A1')]),
    makeTopic('b', 'B'),
  ])
}

function sampleLayout(): MindMapLayoutResult {
  return {
    nodes: [
      { id: 'root', topic: sampleTree(), depth: 0, side: 'center', x: 0, y: 0, width: 120, height: 44 },
      { id: 'a', topic: makeTopic('a', 'A'), depth: 1, side: 'right', x: 220, y: -50, width: 100, height: 40 },
      { id: 'a1', topic: makeTopic('a1', 'A1'), depth: 2, side: 'right', x: 420, y: -50, width: 90, height: 36 },
      { id: 'b', topic: makeTopic('b', 'B'), depth: 1, side: 'right', x: 220, y: 50, width: 100, height: 40 },
    ],
    edges: [
      { id: 'e-root-a', parentId: 'root', childId: 'a', side: 'right', path: '', start: { x: 60, y: 0 }, end: { x: 170, y: -50 }, control1: { x: 0, y: 0 }, control2: { x: 0, y: 0 } },
      { id: 'e-a-a1', parentId: 'a', childId: 'a1', side: 'right', path: '', start: { x: 270, y: -50 }, end: { x: 375, y: -50 }, control1: { x: 0, y: 0 }, control2: { x: 0, y: 0 } },
      { id: 'e-root-b', parentId: 'root', childId: 'b', side: 'right', path: '', start: { x: 60, y: 0 }, end: { x: 170, y: 50 }, control1: { x: 0, y: 0 }, control2: { x: 0, y: 0 } },
    ],
    width: 520,
    height: 200,
    offsetX: 100,
    offsetY: 100,
  }
}

describe('presentation-controller', () => {
  describe('buildPresentationTraversal', () => {
    it('produces DFS pre-order traversal starting at root', () => {
      const order = buildPresentationTraversal(sampleTree())
      expect(order).toEqual(['root', 'a', 'a1', 'b'])
    })

    it('returns a single-element list for a leaf root', () => {
      expect(buildPresentationTraversal(makeTopic('only', '唯一'))).toEqual(['only'])
    })
  })

  describe('buildPresentationSlides', () => {
    it('builds progressive reveal sets in traversal order', () => {
      const slides = buildPresentationSlides(['root', 'a', 'a1', 'b'])
      expect(slides).toHaveLength(4)
      expect(slides[0].revealUpTo).toEqual(new Set(['root']))
      expect(slides[1].revealUpTo).toEqual(new Set(['root', 'a']))
      expect(slides[2].revealUpTo).toEqual(new Set(['root', 'a', 'a1']))
      expect(slides[3].revealUpTo).toEqual(new Set(['root', 'a', 'a1', 'b']))
    })

    it('records the focused topic id and index for each slide', () => {
      const slides = buildPresentationSlides(['root', 'a', 'a1', 'b'])
      expect(slides.map((s) => s.topicId)).toEqual(['root', 'a', 'a1', 'b'])
      expect(slides.map((s) => s.index)).toEqual([0, 1, 2, 3])
    })

    it('returns an empty list for an empty traversal', () => {
      expect(buildPresentationSlides([])).toEqual([])
    })
  })

  describe('computeFocusCamera', () => {
    it('centers the focused node in the viewport', () => {
      const layout = sampleLayout()
      const viewport = { width: 1000, height: 600 }
      const camera = computeFocusCamera(layout, 'a', viewport)
      const node = layout.nodes.find((n) => n.id === 'a')!
      const cx = node.x + layout.offsetX
      const cy = node.y + layout.offsetY
      // 节点世界中心应投影到视口中心
      const screenX = (cx - camera.x) * camera.zoom
      const screenY = (cy - camera.y) * camera.zoom
      expect(screenX).toBeCloseTo(viewport.width / 2, 5)
      expect(screenY).toBeCloseTo(viewport.height / 2, 5)
    })

    it('clamps zoom within the allowed range', () => {
      const layout = sampleLayout()
      const camera = computeFocusCamera(layout, 'root', { width: 100, height: 100 })
      expect(camera.zoom).toBeGreaterThanOrEqual(0.6)
      expect(camera.zoom).toBeLessThanOrEqual(1.8)
    })

    it('falls back to fit-all camera when the topic is missing', () => {
      const layout = sampleLayout()
      const viewport = { width: 1000, height: 600 }
      const focus = computeFocusCamera(layout, 'nonexistent', viewport)
      const fitAll = computeFitAllCamera(layout, viewport)
      expect(focus).toEqual(fitAll)
    })
  })

  describe('computeFitAllCamera', () => {
    it('fits the whole layout bounding box with padding', () => {
      const layout = sampleLayout()
      const viewport = { width: 1040, height: 400 }
      const camera = computeFitAllCamera(layout, viewport)
      // 全景应容纳整个世界宽度（含 0.9 留白）
      const visibleWidth = viewport.width / camera.zoom
      expect(visibleWidth).toBeGreaterThanOrEqual(layout.width)
      expect(camera.zoom).toBeLessThanOrEqual(1.8)
      expect(camera.zoom).toBeGreaterThanOrEqual(0.6)
    })

    it('returns a default camera for a zero-size viewport', () => {
      const camera = computeFitAllCamera(sampleLayout(), { width: 0, height: 0 })
      expect(camera).toEqual({ x: 0, y: 0, zoom: 1 })
    })
  })

  describe('filterLayoutByRevealed', () => {
    it('keeps only revealed nodes and edges whose both endpoints are revealed', () => {
      const layout = sampleLayout()
      const revealed = new Set(['root', 'a'])
      const filtered = filterLayoutByRevealed(layout, revealed)
      expect(filtered.nodes.map((n) => n.id).sort()).toEqual(['a', 'root'])
      // e-root-a 两端均已揭示；e-a-a1 / e-root-b 因 a1/b 未揭示而被移除
      expect(filtered.edges.map((e) => e.id)).toEqual(['e-root-a'])
    })

    it('preserves layout width/height/offset for camera consistency', () => {
      const layout = sampleLayout()
      const filtered = filterLayoutByRevealed(layout, new Set(['root']))
      expect(filtered.width).toBe(layout.width)
      expect(filtered.height).toBe(layout.height)
      expect(filtered.offsetX).toBe(layout.offsetX)
      expect(filtered.offsetY).toBe(layout.offsetY)
    })
  })

  describe('interpolateCamera & easeInOutCubic', () => {
    it('eases endpoints correctly', () => {
      expect(easeInOutCubic(0)).toBe(0)
      expect(easeInOutCubic(1)).toBe(1)
      expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5)
    })

    it('returns the source camera at progress 0 and target at progress 1', () => {
      const from = { x: 0, y: 0, zoom: 1 }
      const to = { x: 100, y: 50, zoom: 2 }
      expect(interpolateCamera(from, to, 0)).toEqual(from)
      expect(interpolateCamera(from, to, 1)).toEqual(to)
    })

    it('interpolates zoom in log space', () => {
      const from = { x: 0, y: 0, zoom: 1 }
      const to = { x: 0, y: 0, zoom: 4 }
      const mid = interpolateCamera(from, to, 0.5)
      // 对数空间中点：exp((ln1 + ln4)/2) = exp(ln2) = 2
      expect(mid.zoom).toBeCloseTo(2, 5)
    })
  })
})
