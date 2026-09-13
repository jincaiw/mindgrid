/**
 * 打印（文件 → 打印 ⌘P）。
 *
 * 与菜单派发同样做成「显式依赖 + 纯编排」的形态：顺序本身就是要被钉住的东西
 * ——**必须先把位图放进打印页、等一次绘制，再打开系统打印面板**。反过来做
 * （先开面板再放图）会打出一张白纸，而且这种错完全不会报错，只能靠人眼发现。
 *
 * 与 XMind 的差别在内里而非表面：XMind 是原生绘制、直接调 NSPrintOperation；
 * 我们打的是 **webview 的 DOM**，所以纸张上出现什么由前端的 `@media print`
 * 决定（见 `.print-sheet` 的样式）。
 */

export interface PrintContext {
  /** 渲染整幅导图的位图；`null` 表示没有可打印的内容。 */
  renderImage: () => Promise<Uint8Array | null>
  /** 把位图放进打印页（含 object URL 生命周期管理）。 */
  showSheet: (bytes: Uint8Array, title: string) => void
  /** 打开系统打印面板。 */
  printNative: () => Promise<unknown>
  /** 纸张上的页眉标题（文档名）。 */
  title: string
  notify: (message: string) => void
}

/**
 * 等浏览器完成一次布局与绘制。
 *
 * 两次 `requestAnimationFrame` 不是"保险起见"：单帧只保证排到了下一帧，
 * 不保证这一帧已经画完。缺了它，打印面板可能仍按"没有打印页"的旧 DOM 出纸。
 * 无 rAF 的环境（jsdom 未开 pretendToBeVisual）直接放行。
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve()
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * 执行一次打印。返回是否真的走到了打开面板这一步。
 *
 * 渲染失败**不上抛**：这是一条用户可见的动作，失败要变成一句提示，
 * 而不是让调用方 await 到一个没人接的 rejection。
 */
export async function runPrint(context: PrintContext): Promise<boolean> {
  let bytes: Uint8Array | null = null
  try {
    bytes = await context.renderImage()
  } catch {
    context.notify('打印内容生成失败，请改用「文件 → 导出 PDF」')
    return false
  }

  if (!bytes || bytes.length === 0) {
    context.notify('当前没有可打印的内容')
    return false
  }

  context.showSheet(bytes, context.title)
  await waitForPaint()

  try {
    await context.printNative()
  } catch (error) {
    // Rust 侧把「无法打开打印面板」的原因写在 Err(String) 里，别吞掉
    const detail = typeof error === 'string' && error.trim().length > 0 ? error : '无法打开打印面板'
    context.notify(detail)
    return false
  }

  return true
}
