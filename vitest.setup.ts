import '@testing-library/jest-dom/vitest'
import { setCameraAnimationEnabled } from './src/features/canvas/camera'

// 测试环境关闭相机缓动动画：RAF + performance.now() 在 jsdom 下时序不确定，
// 会导致断言相机状态的测试 flaky。关闭后 animateCamera 直接跳到目标。
setCameraAnimationEnabled(false)

// jsdom 未实现 Pointer Capture API，补齐空实现避免 unhandled error。
// 这些方法在真实浏览器中由原生提供，测试中只需 no-op 即可。
if (typeof Element !== 'undefined') {
  const proto = Element.prototype
  if (!proto.setPointerCapture) {
    proto.setPointerCapture = function (_pointerId: number): void {}
  }
  if (!proto.hasPointerCapture) {
    proto.hasPointerCapture = function (_pointerId: number): boolean {
      return false
    }
  }
  if (!proto.releasePointerCapture) {
    proto.releasePointerCapture = function (_pointerId: number): void {}
  }
}
