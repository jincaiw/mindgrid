/**
 * 快捷键集中注册表（批次 20）。
 *
 * 将散落在 app-shell / workspace-screen / canvas-host / outliner-view 的键盘快捷键
 * 统一为声明式数据结构，供快捷键帮助浮层展示与未来自定义扩展使用。
 *
 * 匹配逻辑见 match.ts 的 matchesShortcut；此处仅描述"是什么"与"做什么"。
 */

/** 修饰键组合（mod = Cmd/Ctrl 跨平台归一）。 */
export interface KeyCombo {
  /** 主键，与 KeyboardEvent.key 对齐（如 's'、'.'、'Enter'、'Escape'、'ArrowUp'）。 */
  key: string
  /** Cmd（macOS）/ Ctrl（Windows/Linux），归一为 metaKey || ctrlKey。 */
  mod?: boolean
  /** Shift 键。 */
  shift?: boolean
  /** Alt / Option 键。 */
  alt?: boolean
}

export type ShortcutCategory = '文件' | '视图' | '主题' | '编辑' | '画布导航'

/** 快捷键作用域：决定在何处生效。 */
export type ShortcutScope = 'global' | 'canvas' | 'outliner' | 'input'

export interface ShortcutDef {
  id: string
  combo: KeyCombo
  label: string
  description: string
  category: ShortcutCategory
  scope: ShortcutScope
}

/**
 * 全部快捷键定义。按 category 分组展示在帮助浮层中。
 *
 * 注意：部分快捷键仅在画布聚焦或大纲视图内生效（scope !== 'global'），
 * 全局快捷键在 window 级 keydown 监听器中处理。
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  // —— 文件 ——
  {
    id: 'file-new',
    combo: { key: 'n', mod: true },
    label: '新建文档',
    description: '创建一份空白思维导图文档',
    category: '文件',
    scope: 'global',
  },
  {
    id: 'file-open',
    combo: { key: 'o', mod: true },
    label: '打开文档',
    description: '打开已有的 .mgd 文档',
    category: '文件',
    scope: 'global',
  },
  {
    id: 'file-save',
    combo: { key: 's', mod: true },
    label: '保存文档',
    description: '保存当前文档',
    category: '文件',
    scope: 'global',
  },
  {
    id: 'file-save-as',
    combo: { key: 's', mod: true, shift: true },
    label: '另存为',
    description: '将当前文档另存为新文件',
    category: '文件',
    scope: 'global',
  },

  // —— 视图 ——
  {
    id: 'view-zen',
    combo: { key: '.', mod: true },
    label: '专注模式',
    description: '隐藏工具栏与面板，画布占满；Esc 退出',
    category: '视图',
    scope: 'global',
  },
  {
    id: 'view-present',
    combo: { key: 'p', mod: true, shift: true },
    label: '演示模式',
    description: '进入全屏演示，渐进揭示主题',
    category: '视图',
    scope: 'global',
  },
  {
    id: 'view-inspector',
    combo: { key: 'i', mod: true },
    label: '检查器',
    description: '显示或隐藏右侧属性检查器',
    category: '视图',
    scope: 'global',
  },
  {
    id: 'view-recenter',
    combo: { key: 'r', mod: true },
    label: '回到中心主题',
    description: '相机动画聚焦根主题',
    category: '视图',
    scope: 'canvas',
  },
  {
    id: 'view-search',
    combo: { key: 'f', mod: true },
    label: '搜索',
    description: '打开画布内主题搜索',
    category: '视图',
    scope: 'canvas',
  },
  {
    id: 'view-collapse',
    combo: { key: '/', mod: true },
    label: '折叠/展开',
    description: '切换当前主题的折叠状态',
    category: '视图',
    scope: 'canvas',
  },

  // —— 主题 ——
  {
    id: 'topic-child',
    combo: { key: 'Tab' },
    label: '创建子主题',
    description: '为当前主题添加一个子主题',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-sibling',
    combo: { key: 'Enter' },
    label: '创建同级',
    description: '在当前主题之后添加一个同级主题',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-sibling-before',
    combo: { key: 'Enter', shift: true },
    label: '前插同级',
    description: '在当前主题之前插入一个同级主题',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-parent',
    combo: { key: 'Enter', mod: true },
    label: '创建父主题',
    description: '为当前主题创建一个父主题（上提一层）',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-duplicate',
    combo: { key: 'd', mod: true },
    label: '复制主题',
    description: '复制当前主题为紧随其后的同级',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-rename',
    combo: { key: 'F2' },
    label: '重命名',
    description: '进入当前主题的内联编辑',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-delete',
    combo: { key: 'Delete' },
    label: '删除主题',
    description: '删除当前选中的主题',
    category: '主题',
    scope: 'outliner',
  },
  {
    id: 'topic-reorder-up',
    combo: { key: 'ArrowUp', alt: true },
    label: '同级上移',
    description: '在同级主题内上移当前主题',
    category: '主题',
    scope: 'canvas',
  },
  {
    id: 'topic-reorder-down',
    combo: { key: 'ArrowDown', alt: true },
    label: '同级下移',
    description: '在同级主题内下移当前主题',
    category: '主题',
    scope: 'canvas',
  },

  // —— 编辑 ——
  {
    id: 'edit-copy',
    combo: { key: 'c', mod: true },
    label: '复制',
    description: '复制选中主题到剪贴板',
    category: '编辑',
    scope: 'canvas',
  },
  {
    id: 'edit-paste',
    combo: { key: 'v', mod: true },
    label: '粘贴',
    description: '粘贴剪贴板中的主题',
    category: '编辑',
    scope: 'canvas',
  },
  {
    id: 'edit-cut',
    combo: { key: 'x', mod: true },
    label: '剪切',
    description: '复制并删除选中主题',
    category: '编辑',
    scope: 'canvas',
  },
  {
    id: 'edit-select-all',
    combo: { key: 'a', mod: true },
    label: '全选',
    description: '选中当前画布全部主题',
    category: '编辑',
    scope: 'canvas',
  },
  {
    id: 'edit-copy-style',
    combo: { key: 'c', mod: true, alt: true },
    label: '复制样式',
    description: '复制当前主题的样式快照',
    category: '编辑',
    scope: 'canvas',
  },
  {
    id: 'edit-paste-style',
    combo: { key: 'v', mod: true, alt: true },
    label: '粘贴样式',
    description: '将样式快照应用到选中主题',
    category: '编辑',
    scope: 'canvas',
  },

  // —— 画布导航 ——
  {
    id: 'nav-up',
    combo: { key: 'ArrowUp' },
    label: '上一主题',
    description: '在大纲视图中选中上一个主题',
    category: '画布导航',
    scope: 'outliner',
  },
  {
    id: 'nav-down',
    combo: { key: 'ArrowDown' },
    label: '下一主题',
    description: '在大纲视图中选中下一个主题',
    category: '画布导航',
    scope: 'outliner',
  },
  {
    id: 'nav-escape',
    combo: { key: 'Escape' },
    label: '退出/取消',
    description: '退出搜索、大纲视图或专注模式',
    category: '画布导航',
    scope: 'global',
  },
] as const

/** 按分类分组的快捷键，供帮助浮层渲染。 */
export function groupShortcutsByCategory(
  shortcuts: readonly ShortcutDef[] = SHORTCUTS,
): Array<{ category: ShortcutCategory; items: ShortcutDef[] }> {
  const order: ShortcutCategory[] = ['文件', '视图', '主题', '编辑', '画布导航']
  return order.map((category) => ({
    category,
    items: shortcuts.filter((s) => s.category === category),
  }))
}

/** 将 KeyCombo 格式化为人类可读的展示字符串。 */
export function formatCombo(combo: KeyCombo): string {
  const mod = combo.mod ? '⌘/' : ''
  const shift = combo.shift ? '⇧/' : ''
  const alt = combo.alt ? '⌥/' : ''
  const key = combo.key === ' ' ? 'Space' : combo.key
  return `${mod}${shift}${alt}${key}`
}
