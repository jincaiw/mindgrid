import { describe, expect, it } from 'vitest'
import {
  centerCameraOnWorldPoint,
  fitSceneToViewport,
  panCamera,
  zoomAtViewportPoint,
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
