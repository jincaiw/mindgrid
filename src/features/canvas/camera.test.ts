import { describe, expect, it, vi } from 'vitest'
import {
  animateCamera,
  CAMERA_ANIMATION_MS,
  centerCameraOnWorldPoint,
  easeOutCubic,
  fitSceneToViewport,
  lerpCamera,
  panCamera,
  setCameraAnimationEnabled,
  zoomAtViewportPoint,
  type CameraState,
} from './camera'

describe('fitSceneToViewport', () => {
  it('centers the scene and scales it to fit the viewport', () => {
    const camera = fitSceneToViewport(
      { width: 1200, height: 800 },
      { width: 600, height: 300 },
    )

    expect(camera.zoom).toBeGreaterThan(1)
    expect(camera.x).toBeGreaterThan(0)
    expect(camera.y).toBeGreaterThan(0)
  })
})

describe('zoomAtViewportPoint', () => {
  it('keeps the pointed world coordinate stable while zooming', () => {
    const nextCamera = zoomAtViewportPoint(
      { x: 100, y: 50, zoom: 1 },
      2,
      { x: 300, y: 250 },
    )

    expect(nextCamera.zoom).toBe(2)
    expect(nextCamera.x).toBe(-100)
    expect(nextCamera.y).toBe(-150)
  })
})

describe('panCamera', () => {
  it('moves the camera by delta', () => {
    const camera = panCamera({ x: 10, y: 20, zoom: 1 }, { x: -4, y: 16 })

    expect(camera.x).toBe(6)
    expect(camera.y).toBe(36)
  })
})

describe('centerCameraOnWorldPoint', () => {
  it('centers a world point in the viewport while keeping zoom', () => {
    const camera = centerCameraOnWorldPoint(
      { width: 1000, height: 700 },
      { x: 320, y: 180 },
      1.5,
    )

    expect(camera.zoom).toBe(1.5)
    expect(camera.x).toBe(20)
    expect(camera.y).toBe(80)
  })
})

describe('easeOutCubic', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('produces eased values between 0 and 1', () => {
    const v = easeOutCubic(0.5)
    expect(v).toBeGreaterThan(0.5) // ease-out: 前半段已过半
    expect(v).toBeLessThan(1)
  })
})

describe('lerpCamera', () => {
  it('interpolates between two camera states', () => {
    const from = { x: 0, y: 0, zoom: 1 }
    const to = { x: 100, y: 200, zoom: 2 }
    const mid = lerpCamera(from, to, 0.5)
    expect(mid).toEqual({ x: 50, y: 100, zoom: 1.5 })
  })

  it('returns from at t=0 and to at t=1', () => {
    const from = { x: 10, y: 20, zoom: 1 }
    const to = { x: 30, y: 40, zoom: 3 }
    expect(lerpCamera(from, to, 0)).toEqual(from)
    expect(lerpCamera(from, to, 1)).toEqual(to)
  })
})

describe('animateCamera', () => {
  it('jumps to target immediately when animation is disabled', () => {
    setCameraAnimationEnabled(false)
    const updates: CameraState[] = []
    const cancel = animateCamera(
      { x: 0, y: 0, zoom: 1 },
      { x: 100, y: 50, zoom: 2 },
      CAMERA_ANIMATION_MS,
      (c) => updates.push(c),
    )
    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ x: 100, y: 50, zoom: 2 })
    cancel()
    setCameraAnimationEnabled(true)
  })

  it('uses requestAnimationFrame when animation is enabled', () => {
    setCameraAnimationEnabled(true)
    // mock RAF：用大时间戳让动画在第一帧就完成（t >= 1），避免递归
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(performance.now() + CAMERA_ANIMATION_MS + 1)
      return 0
    })
    const updates: CameraState[] = []
    animateCamera(
      { x: 0, y: 0, zoom: 1 },
      { x: 100, y: 0, zoom: 1 },
      CAMERA_ANIMATION_MS,
      (c) => updates.push(c),
    )
    // 至少调用了一次 RAF 并产生了至少一次更新（最终值=目标）
    expect(rafSpy).toHaveBeenCalled()
    expect(updates.length).toBeGreaterThan(0)
    expect(updates[updates.length - 1]).toEqual({ x: 100, y: 0, zoom: 1 })
    rafSpy.mockRestore()
  })
})
