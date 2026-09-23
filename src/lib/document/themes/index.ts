/**
 * 主题注册表：提供主题查找与列表能力。
 *
 * ⚠️ **对外的 `getTheme` / `listThemes` 来自 `registry.ts`**（内置 + 用户自建风格一起查）。
 * `built-in-themes.ts` 里那两个同名能力已改名为 `getBuiltInTheme` / `listBuiltInThemes`，
 * 就是为了避免有人从内置表直接查、把用户自建风格静默漏掉
 * （表现是"选了自定义风格但不生效"，且没有任何报错——最坏的一类 bug）。
 */

export type {
  ThemeId,
  ThemePalette,
  ThemeLevelColors,
  ThemeFamily,
  BuiltinThemeId,
} from './built-in-themes'
export { BUILT_IN_THEMES, DEFAULT_THEME_ID, NEW_DOCUMENT_THEME_ID } from './built-in-themes'

export {
  getTheme,
  isThemeResolvable,
  listThemes,
  listThemesByFamily,
  setCustomThemes,
  getCustomThemes,
  subscribeCustomThemes,
} from './registry'

export type {
  CustomTheme,
  CustomThemeDraft,
  CustomThemePalette,
  CustomThemeLevelColors,
  ThemeColorField,
  ThemeColorGroup,
  ThemeColorPath,
} from './custom-themes'
export {
  CUSTOM_THEME_ID_PREFIX,
  CUSTOM_THEME_MAX_COUNT,
  CUSTOM_THEME_MAX_PALETTE_COLORS,
  CUSTOM_THEME_MIN_PALETTE_COLORS,
  CUSTOM_THEME_NAME_MAX_LENGTH,
  THEME_COLOR_FIELDS,
  THEME_COLOR_GROUPS,
  applyThemeColor,
  createCustomTheme,
  defaultCustomThemeName,
  draftPaletteFrom,
  isThemeColor,
  makeCustomThemeId,
  materializeTheme,
  normalizeThemeName,
  readCustomThemes,
  readThemeColor,
  toOpaqueHex,
  toRgba,
} from './custom-themes'
