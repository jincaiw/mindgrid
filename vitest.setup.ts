import '@testing-library/jest-dom/vitest'
import { setCameraAnimationEnabled } from './src/features/canvas/camera'

// 测试环境关闭相机缓动动画：RAF + performance.now() 在 jsdom 下时序不确定，
// 会导致断言相机状态的测试 flaky。关闭后 animateCamera 直接跳到目标。
setCameraAnimationEnabled(false)
