/**
 * 缩放快捷键 → 画布动作的映射。
 *
 * 抽成纯函数的理由：这段映射原先写在画布 keydown 里的一串 if 里，
 * 而**它在 jsdom 里无法用行为断言守住**——测试视口没有真实布局，
 * `fitToView()` 与「复位到 100%」得到的标签一样，断言不出区别
 * （实测：把 ⌘0/⌘1 对调后，行为测试仍然通过）。
 *
 * 所以把"按键 → 动作"变成可枚举的数据，由单测直接钉住映射表；
 * 画布只负责把动作翻译成具体调用。
 *
 * 绑定依据：XMind 基准图「查看」菜单（实际大小 ⌘0 / 适应画布无快捷键），
 * 且 ⌘0 = 实际大小也是 macOS/Windows 的通例（Safari / 访达 / 预览一致）。
 */

/** 缩放动作。`actual` = 复位到 100%，`fit` = 缩放到整图铺满视口。 */
export type ZoomShortcutAction = 'in' | 'out' | 'actual' | 'fit'

interface ZoomShortcutEventLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

/**
 * 解析缩放快捷键；不是缩放组合时返回 null。
 *
 * **显式排除 Alt**：⌥⌘0 是「重设样式」、⌥⌘C/⌥⌘V 是样式复制粘贴。
 * 不排除的话一次按键会同时触发两个动作——样式被重设、缩放也被改掉。
 */
export function resolveZoomShortcut(event: ZoomShortcutEventLike): ZoomShortcutAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return null
  }

  switch (event.key) {
    // ⌘= 与 ⌘+ 都算放大：不同键盘布局下 '+' 需要 Shift，两码都要认
    case '=':
    case '+':
      return 'in'
    case '-':
      return 'out'
    case '0':
      return 'actual'
    case '1':
      return 'fit'
    default:
      return null
  }
}
