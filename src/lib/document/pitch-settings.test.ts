import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PITCH_ASPECT_RATIO,
  DEFAULT_PITCH_THEME_STYLE,
  PITCH_SETTINGS_KEYS,
  resolvePitchSettings,
} from './pitch-settings'

describe('resolvePitchSettings', () => {
  it('falls back to defaults when settings are absent', () => {
    expect(resolvePitchSettings(undefined)).toEqual({
      aspectRatio: DEFAULT_PITCH_ASPECT_RATIO,
      themeStyle: DEFAULT_PITCH_THEME_STYLE,
    })
    expect(resolvePitchSettings({})).toEqual({
      aspectRatio: '16:9',
      themeStyle: 'document',
    })
  })

  it('reads valid persisted values', () => {
    expect(
      resolvePitchSettings({
        [PITCH_SETTINGS_KEYS.aspectRatio]: '4:3',
        [PITCH_SETTINGS_KEYS.themeStyle]: 'dark',
      }),
    ).toEqual({ aspectRatio: '4:3', themeStyle: 'dark' })
  })

  it('falls back per-field when a stored value is corrupted or unknown', () => {
    // 字段级回落：比例坏了不影响颜色风格
    expect(
      resolvePitchSettings({
        [PITCH_SETTINGS_KEYS.aspectRatio]: '21:9',
        [PITCH_SETTINGS_KEYS.themeStyle]: 'dark',
      }),
    ).toEqual({ aspectRatio: '16:9', themeStyle: 'dark' })

    expect(
      resolvePitchSettings({
        [PITCH_SETTINGS_KEYS.aspectRatio]: 42,
        [PITCH_SETTINGS_KEYS.themeStyle]: null,
      }),
    ).toEqual({ aspectRatio: '16:9', themeStyle: 'document' })
  })
})
