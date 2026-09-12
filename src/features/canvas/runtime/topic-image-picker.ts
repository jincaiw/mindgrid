/**
 * 主题图片「选文件」这一步的可测部分。
 *
 * 系统文件对话框本身无法在测试里点（Tauri 会拉起 macOS 原生面板），
 * 但**我们这一侧的两件事可以也应该被测试**：
 * 1. 传给对话框的过滤条件（允不允许选目录、允许多选、扩展名清单）；
 * 2. 对话框返回值到路径的归一化（插件在单/多选、取消时返回的类型并不统一）。
 *
 * 把这两件事从组件里抽出来，接线错误不必等到人工点对话框才暴露。
 */

/** 允许插入的主题图片扩展名（与 Rust 侧可渲染格式白名单保持一致）。 */
export const TOPIC_IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
] as const

export interface TopicImageDialogOptions {
  multiple: boolean
  directory: boolean
  filters: { name: string; extensions: string[] }[]
}

/** 传给 `open()` 的选项：单选、只能选文件、限定图片扩展名。 */
export const TOPIC_IMAGE_DIALOG_OPTIONS: TopicImageDialogOptions = {
  multiple: false,
  directory: false,
  filters: [
    {
      name: '图片',
      extensions: [...TOPIC_IMAGE_EXTENSIONS],
    },
  ],
}

/**
 * 归一化文件对话框返回值。
 *
 * `@tauri-apps/plugin-dialog` 在单选时返回 `string | null`，但多选（或版本差异）
 * 会返回数组；取消返回 `null`。非字符串一律忽略，避免把对象当路径传给后端。
 */
export function toSelectedImagePath(selected: unknown): string | null {
  if (typeof selected === 'string') {
    return selected.trim().length > 0 ? selected : null
  }
  if (Array.isArray(selected)) {
    const first = selected.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    return first ?? null
  }
  return null
}
