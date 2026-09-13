/**
 * 打印页：纸张上真正出现的内容。
 *
 * 这块 DOM **常驻**（只要打印过一次就在），由 `@media print` 控制显隐——
 * 屏幕上看不见、不进无障碍树、不参与布局。
 *
 * 为什么不做成"打印时挂上、打印完卸载"：原生打印面板的调用是**异步派发**的
 * （tauri 只把消息投给主线程事件循环就返回，`invoke` 在面板出现之前就 resolve），
 * 拿不到"面板已关闭"的时机。若按延时猜测着卸载，猜早了会打白纸——
 * 而白纸是不报错的。常驻 + 打印样式显隐没有这个竞态。
 *
 * 代价是位图（Blob URL）会一直留在内存里，故：
 * - 下一次打印时**立刻释放**上一个 URL（见 usePrintSheet）
 * - 组件卸载时释放
 */

import { createPortal } from 'react-dom'

export interface PrintSheetState {
  /** 导图位图的 object URL。 */
  url: string
  /** 页眉标题（文档名）。 */
  title: string
}

/**
 * 把导图位图与文档名渲染成打印页。
 *
 * 用 portal 挂到 `document.body` 而不是留在应用外壳里：这样打印样式只需要
 * 「藏掉整棵应用外壳（#root）+ 显示 .print-sheet」两条规则，不必逐个枚举
 * 工具栏 / 面板 / 状态条 / 各种浮层——将来新增 UI 也不会漏掉一个。
 */
export function PrintSheet({ sheet }: { sheet: PrintSheetState | null }) {
  if (!sheet) {
    return null
  }

  return createPortal(
    <div className="print-sheet" aria-hidden="true">
      <div className="print-sheet__title">{sheet.title}</div>
      <img className="print-sheet__image" src={sheet.url} alt="" />
    </div>,
    document.body,
  )
}
