/**
 * 提案简报（Pitch）视图：分幕展示，一幕 = 根节点 + 一个一级分支。
 *
 * 与演示模式（presentation-view）并存而非合并（方案待定项 #3 采纳"并存"）：
 *   演示 = 逐个节点渐进揭示，适合边讲边展开；
 *   Pitch = 按分支分幕，幕数等于一级分支数 + 1，适合"一个分支讲一段"的汇报。
 *
 * 渲染同样复用 Canvas Runtime 的 buildScene + renderScene，
 * 差异只在每一幕揭示哪些节点，以及舞台长宽比 / 主题风格设置。
 *
 * 交互：→ / Space 下一幕，← 上一幕，Home / End 首末幕，F 全屏，Esc 退出。
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
  computeFitAllCamera,
  filterLayoutByRevealed,
  interpolateCamera,
  type PresentationCamera,
} from './presentation-controller'
import {
  buildPitchActs,
  computePitchStageSize,
  PITCH_ASPECT_RATIOS,
  resolvePitchThemeId,
  type PitchAspectRatio,
  type PitchThemeStyle,
} from './pitch-controller'

const ANIMATION_DURATION_MS = 420

interface PitchViewProps {
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

/**
 * 空集合复用模块级常量。
 * 若写成 `document.relationships ?? []`，每次渲染都会产生新数组，
 * 使依赖它的 useCallback（draw）每次重建，进而让绘制 effect 反复触发。
 */
const EMPTY_RELATIONSHIPS: Relationship[] = []
const EMPTY_BOUNDARIES: Boundary[] = []
const EMPTY_SUMMARIES: SummaryNode[] = []

const THEME_STYLE_OPTIONS: ReadonlyArray<{ id: PitchThemeStyle; label: string }> = [
  { id: 'document', label: '跟随文档' },
  { id: 'dark', label: '深色' },
  { id: 'light', label: '浅色' },
]

export function PitchView({ document, onExit }: PitchViewProps) {
  const activeSheet =
    document.sheets.find((s) => s.id === document.activeSheetId) ?? document.sheets[0]
  const rootTopic: TopicSnapshot = activeSheet.rootTopic
  const chartType: ChartType | undefined = activeSheet.chartType
  const documentThemeId = document.theme?.id
  const relationships: Relationship[] = document.relationships ?? EMPTY_RELATIONSHIPS
  const boundaries: Boundary[] = activeSheet.boundaries ?? EMPTY_BOUNDARIES
  const summaries: SummaryNode[] = activeSheet.summaries ?? EMPTY_SUMMARIES

  const layout = useMemo(() => computeLayout(rootTopic, chartType), [rootTopic, chartType])
  const acts = useMemo(() => buildPitchActs(rootTopic), [rootTopic])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [aspectRatio, setAspectRatio] = useState<PitchAspectRatio>('16:9')
  const [themeStyle, setThemeStyle] = useState<PitchThemeStyle>('document')
  const themeId = resolvePitchThemeId(themeStyle, documentThemeId)

  const safeIndex = acts.length === 0 ? 0 : Math.min(currentIndex, acts.length - 1)
  const currentAct = acts[safeIndex]

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const cameraRef = useRef<PresentationCamera>({ x: 0, y: 0, zoom: 1 })
  const animationRef = useRef<number | null>(null)

  const stageSize = useMemo(
    () => computePitchStageSize(containerSize, aspectRatio),
    [containerSize, aspectRatio],
  )
  // 必须 memo：draw 依赖 viewport，内联对象字面量每次渲染都是新引用，
  // 会让 draw 重建并反复触发绘制 effect
  const viewport = useMemo(
    () => ({ width: stageSize.width, height: stageSize.height }),
    [stageSize.width, stageSize.height],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0 || !currentAct) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const revealedLayout = filterLayoutByRevealed(layout, currentAct.revealed)
    const scene = buildScene({
      layout: revealedLayout,
      viewport,
      camera: cameraRef.current,
      visualStates: { ...EMPTY_VISUAL_STATES, activeTopicId: currentAct.topicId },
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
  }, [viewport, currentAct, layout, relationships, boundaries, summaries, themeId])

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

  // 测量容器尺寸（舞台按容器取该长宽比下的最大内接矩形）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const rect = container.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
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
  }, [viewport.width, viewport.height, draw])

  // 换幕时把相机适配到本幕显示的节点集合
  useEffect(() => {
    if (viewport.width <= 0 || viewport.height <= 0 || !currentAct) return
    const revealedLayout = filterLayoutByRevealed(layout, currentAct.revealed)
    const target = computeFitAllCamera(revealedLayout, viewport)
    // 首次进入直接定位，后续动画过渡
    if (cameraRef.current.zoom === 1 && cameraRef.current.x === 0 && cameraRef.current.y === 0) {
      cameraRef.current = target
      draw()
    } else {
      animateCameraTo(target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIndex, viewport.width, viewport.height, themeId])

  useEffect(() => () => stopAnimation(), [stopAnimation])

  const goTo = useCallback(
    (next: number) => {
      if (acts.length === 0) return
      setCurrentIndex(Math.max(0, Math.min(acts.length - 1, next)))
    },
    [acts.length],
  )
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex])
  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex])

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
          goTo(acts.length - 1)
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
  }, [goNext, goPrev, goTo, onExit, acts.length])

  const actLabel = acts.length > 0 ? `${safeIndex + 1} / ${acts.length}` : '0 / 0'

  return (
    <div className="pitch" role="dialog" aria-modal="true" aria-label="提案简报" ref={containerRef}>
      <div className="pitch__settings" role="group" aria-label="简报设置">
        <label className="pitch__setting">
          <span>长宽比</span>
          <select
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as PitchAspectRatio)}
          >
            {PITCH_ASPECT_RATIOS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
            <option value="fit">铺满</option>
          </select>
        </label>
        <label className="pitch__setting">
          <span>主题风格</span>
          <select
            value={themeStyle}
            onChange={(event) => setThemeStyle(event.target.value as PitchThemeStyle)}
          >
            {THEME_STYLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="pitch__stage"
        style={{ width: stageSize.width || undefined, height: stageSize.height || undefined }}
      >
        <canvas className="pitch__canvas" ref={canvasRef} />
        {currentAct ? (
          <div className="pitch__caption">
            <strong>{currentAct.title}</strong>
            {currentAct.pointCount > 0 ? <span>{currentAct.pointCount} 个要点</span> : null}
          </div>
        ) : null}
      </div>

      <div className="pitch__controls" role="group" aria-label="简报控制">
        <button
          className="presentation__button"
          type="button"
          onClick={goPrev}
          disabled={safeIndex <= 0}
          aria-keyshortcuts="ArrowLeft Backspace"
          title="上一幕（←）"
        >
          上一幕
        </button>
        <span className="presentation__counter" aria-live="polite">
          {actLabel}
        </span>
        <button
          className="presentation__button"
          type="button"
          onClick={goNext}
          disabled={safeIndex >= acts.length - 1}
          aria-keyshortcuts="ArrowRight Space Enter"
          title="下一幕（→ / Space）"
        >
          下一幕
        </button>
        <button
          className="presentation__button presentation__button--exit"
          type="button"
          onClick={onExit}
          aria-keyshortcuts="Escape"
          title="退出简报（Esc）"
        >
          退出
        </button>
      </div>
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
