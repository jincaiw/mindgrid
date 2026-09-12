/**
 * 演说（Pitch）设置：文档级持久化。
 *
 * 与画布设置同一套路：存在 `document.settings` 自由键值字典里，
 * **所有读取都必须走本模块的解析函数**——存了畸形值（旧版本残留、手工编辑）
 * 时一律回落默认，绝不让未校验的字符串进入渲染层。
 */

import type { DocumentSettings } from './types'

export const PITCH_SETTINGS_KEYS = {
  /** 放映画布比例，见 PITCH_ASPECT_RATIOS。 */
  aspectRatio: 'pitch.aspectRatio',
  /** 放映配色风格，见 PITCH_THEME_STYLES。 */
  themeStyle: 'pitch.themeStyle',
} as const

export const PITCH_ASPECT_RATIOS = ['16:9', '4:3', '1:1', 'fit'] as const
export type PitchAspectRatioSetting = (typeof PITCH_ASPECT_RATIOS)[number]

export const PITCH_THEME_STYLES = ['document', 'dark', 'light'] as const
export type PitchThemeStyleSetting = (typeof PITCH_THEME_STYLES)[number]

export const DEFAULT_PITCH_ASPECT_RATIO: PitchAspectRatioSetting = '16:9'
export const DEFAULT_PITCH_THEME_STYLE: PitchThemeStyleSetting = 'document'

export interface ResolvedPitchSettings {
  aspectRatio: PitchAspectRatioSetting
  themeStyle: PitchThemeStyleSetting
}

function readEnum<T extends string>(
  settings: DocumentSettings | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = settings?.[key]
  if (typeof raw !== 'string') {
    return fallback
  }
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/** 解析文档演说设置；缺省或损坏一律回落默认值。 */
export function resolvePitchSettings(
  settings: DocumentSettings | undefined,
): ResolvedPitchSettings {
  return {
    aspectRatio: readEnum(
      settings,
      PITCH_SETTINGS_KEYS.aspectRatio,
      PITCH_ASPECT_RATIOS,
      DEFAULT_PITCH_ASPECT_RATIO,
    ),
    themeStyle: readEnum(
      settings,
      PITCH_SETTINGS_KEYS.themeStyle,
      PITCH_THEME_STYLES,
      DEFAULT_PITCH_THEME_STYLE,
    ),
  }
}
