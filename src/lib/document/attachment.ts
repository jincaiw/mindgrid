/**
 * 主题附件的展示与选择口径（纯函数 / 常量）。
 *
 * 抽出来的理由与图片那条一样：对话框的过滤条件与显示口径**可以也应该被单测钉住**，
 * 接线错误不必等到人工点一次对话框才暴露。
 */

/**
 * 附件的选择对话框选项。
 *
 * 与图片的关键差别：**不加扩展名过滤**——附件的意义就是"任意文件"。
 * 只限制单选、只能选文件。
 */
export const ATTACHMENT_DIALOG_OPTIONS = {
  multiple: false,
  directory: false,
} as const

/** 字节数的人类可读形式；缺省或非法值返回空串（调用方据此决定不显示）。 */
export function formatAttachmentSize(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return ''
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * 附件的展示名。
 *
 * 与 Rust 侧的 `sanitized_attachment_name` 同一口径：**只取最后一段**。
 * 文件名的来源是文档内容，直接渲染出来可能带路径分隔符（旧文件、手工编辑过的 .mgd），
 * 界面上应该只看到文件名本身。
 */
export function displayAttachmentName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (trimmed.length === 0) {
    return '未命名附件'
  }
  const last = trimmed.split(/[\\/]/).pop() ?? trimmed
  const cleaned = last.trim()
  return cleaned.length === 0 || cleaned === '.' || cleaned === '..' ? '未命名附件' : cleaned
}
