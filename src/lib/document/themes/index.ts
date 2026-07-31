/**
 * 主题注册表：提供主题查找与列表能力。
 *
 * 当前仅支持内置主题；未来可扩展用户自定义主题（从磁盘或文档内嵌加载）。
 */

export type { ThemePalette, ThemeLevelColors, BuiltinThemeId } from './built-in-themes'
export { BUILT_IN_THEMES, DEFAULT_THEME_ID, getTheme, listThemes } from './built-in-themes'
