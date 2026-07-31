/**
 * 演示模式视图：全屏覆盖层，渐进式揭示主题并相机动画聚焦当前节点。
 *
 * 交互：
 * - → / Space / Enter：下一步；← / Backspace：上一步
 * - Home / End：首张 / 末张；Esc：退出；F：切换浏览器全屏
 * - 底部控制条：上一张 / 下一张 / 退出 + 进度计数
 *
 * 渲染复用 Canvas Runtime 的 buildScene + renderScene，不引入编辑交互状态。
 * 揭示通过过滤布局节点/边实现，世界坐标系保持不变，相机动画连贯。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeLayout } from '../canvas/layouts'
import { renderScene } from '../canvas/runtime/canvas-renderer'
import { buildScene } from '../canvas/runtime/scene-builder'
import type { TopicVisualStates } from '../canvas/runtime/scene-builder'
import type {
  Boundary,
  ChartType,
  DocumentSnapshot,
  Relationship,
  SummaryNode,
  TopicSnapshot,
} from '../../lib/document/types'
import {
  buildPresentationSlides,
  buildPresentationTraversal,
  computeFitAllCamera,
  computeFocusCamera,
  filterLayoutByRevealed,
  interpolateCamera,
  type PresentationCamera,
} from './presentation-controller'

const ANIMATION_DURATION_MS = 480

interface PresentationViewProps {
  document: DocumentSnapshot
  onExit: () => void
}

const EMPTY_VISUAL_STATES: TopicVisualStates = {
  activeTopicId: null,
  selectedTopicIds: new Set<string>(),
  editingTopicId: null,
  searchMatchedTopicIds: new Set<string>(),
  activeSearchTopicId: null,
  historyFocusTopicId: null,
  dropTargetTopicId: null,
  draggingTopicId: null,
}

const EMPTY_OVERLAYS = {
  selectionBox: null,
  dragPreview: null,
  dropIndicator: null,
}

export function PresentationView({ document, onExit }: PresentationViewProps) {
  const activeSheet = document.sheets.find((s) => s.id === document.activeSheetId) ?? document.sheets[0]
  const rootTopic: TopicSnapshot = activeSheet.rootTopic
  const chartType: ChartType | undefined = activeSheet.chartType
  const themeId = document.theme?.id
  const relationships: Relationship[] = document.relationships ?? []
  const boundaries: Boundary[] = activeSheet.boundaries ?? []
  const summaries: SummaryNode[] = activeSheet.summaries ?? []

  const layout = useMemo(() => computeLayout(rootTopic, chartType), [rootTopic, chartType])
  const slides = useMemo(
    () => buildPresentationSlides(buildPresentationTraversal(rootTopic)),
    [rootTopic],
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const safeIndex = slides.length === 0 ? 0 : Math.min(currentIndex, slides.length - 1)
  const currentSlide = slides[safeIndex]

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const cameraRef = useRef<PresentationCamera>({ x: 0, y: 0, zoom: 1 })
  const animationRef = useRef<number | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0 || !currentSlide) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const revealedLayout = filterLayoutByRevealed(layout, currentSlide.revealUpTo)
    const scene = buildScene({
      layout: revealedLayout,
      viewport,
      camera: cameraRef.current,
      visualStates: { ...EMPTY_VISUAL_STATES, activeTopicId: currentSlide.topicId },
      overlays: EMPTY_OVERLAYS,
      relationships,
      boundaries,
      summaries,
      themeId,
      enableCulling: false,
    })

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    renderScene(ctx, scene, viewport, cameraRef.current, dpr, {
      drawBackground: true,
      drawTopics: true,
      drawOverlays: false,
      themeId,
    })
  }, [viewport, currentSlide, layout, relationships, boundaries, summaries, themeId])

  const stopAnimation = useCallback(() => {
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  const animateCameraTo = useCallback(
    (target: PresentationCamera) => {
      stopAnimation()
      const from = { ...cameraRef.current }
      const startTs = performance.now()
      const step = (now: number) => {
        const progress = Math.min(1, (now - startTs) / ANIMATION_DURATION_MS)
        cameraRef.current = interpolateCamera(from, target, progress)
        draw()
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step)
        } else {
          cameraRef.current = target
          animationRef.current = null
        }
      }
      animationRef.current = requestAnimationFrame(step)
    },
    [draw, stopAnimation],
  )

  // 测量视口尺寸（ResizeObserver）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const rect = container.getBoundingClientRect()
      setViewport({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 设置 canvas 物理像素尺寸
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(viewport.width * dpr)
    canvas.height = Math.round(viewport.height * dpr)
    draw()
  }, [viewport, draw])

  // 切换 slide 时聚焦相机
  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || !currentSlide) return
    const target = computeFocusCamera(layout, currentSlide.topicId, viewport)
    // 首次进入直接定位，后续动画过渡
    if (cameraRef.current.zoom === 1 && cameraRef.current.x === 0 && cameraRef.current.y === 0) {
      cameraRef.current = target
      draw()
    } else {
      animateCameraTo(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, viewport.width, viewport.height])

  // 退出时清理动画
  useEffect(() => () => stopAnimation(), [stopAnimation])

  const goTo = useCallback(
    (next: number) => {
      if (slides.length === 0) return
      const clamped = Math.max(0, Math.min(slides.length - 1, next))
      setCurrentIndex(clamped)
    },
    [slides.length],
  )
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex])
  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex])

  // 键盘导航
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          event.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'Backspace':
          event.preventDefault()
          goPrev()
          break
        case 'Home':
          event.preventDefault()
          goTo(0)
          break
        case 'End':
          event.preventDefault()
          goTo(slides.length - 1)
          break
        case 'f':
        case 'F':
          event.preventDefault()
          toggleBrowserFullscreen()
          break
        case 'Escape':
          event.preventDefault()
          onExit()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev, goTo, onExit, slides.length])

  const handleOverview = useCallback(() => {
    const target = computeFitAllCamera(layout, viewport)
    animateCameraTo(target)
  }, [animateCameraTo, layout, viewport])

  const slideLabel = slides.length > 0 ? `${safeIndex + 1} / ${slides.length}` : '0 / 0'

  return (
    <div
      className="presentation"
      role="dialog"
      aria-modal="true"
      aria-label="演示模式"
      ref={containerRef}
    >
      <canvas className="presentation__canvas" ref={canvasRef} />
      <div className="presentation__controls" role="group" aria-label="演示控制">
        <button
          className="presentation__button"
          type="button"
          onClick={goPrev}
          disabled={safeIndex <= 0}
          aria-keyshortcuts="ArrowLeft Backspace"
          title="上一张（←）"
        >
          上一张
        </button>
        <button
          className="presentation__button presentation__button--ghost"
          type="button"
          onClick={handleOverview}
          title="全景预览"
        >
          全景
        </button>
        <span className="presentation__counter" aria-live="polite">
          {slideLabel}
        </span>
        <button
          className="presentation__button"
          type="button"
          onClick={goNext}
          disabled={safeIndex >= slides.length - 1}
          aria-keyshortcuts="ArrowRight Space Enter"
          title="下一张（→ / Space）"
        >
          下一张
        </button>
        <button
          className="presentation__button presentation__button--exit"
          type="button"
          onClick={onExit}
          aria-keyshortcuts="Escape"
          title="退出演示（Esc）"
        >
          退出
        </button>
      </div>
      <p className="presentation__hint">
        → / Space 下一张　← 上一张　F 全屏　Esc 退出
      </p>
    </div>
  )
}

function toggleBrowserFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen?.()
  } else {
    void document.documentElement.requestFullscreen?.()
  }
}
