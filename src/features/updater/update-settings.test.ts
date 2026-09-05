/**
 * 更新设置持久化测试。
 *
 * 重点在**容错**：存储值可能是上一版写的、被手改坏的、或是别的键位残留。
 * 任何一种都不能让更新功能失效或抛错。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  parseUpdateSettings,
  readUpdateSettings,
  writeUpdateSettings,
  useUpdateSettings,
  DEFAULT_UPDATE_SETTINGS,
} from './update-settings'

const STORAGE_KEY = 'mindgrid:update-settings'

describe('parseUpdateSettings', () => {
  it('null 回落到默认值', () => {
    expect(parseUpdateSettings(null)).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('空串回落到默认值', () => {
    expect(parseUpdateSettings('')).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('非法 JSON 回落到默认值', () => {
    expect(parseUpdateSettings('{not json')).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('JSON 但不是对象（数字 / 数组 / 字符串）回落到默认值', () => {
    expect(parseUpdateSettings('42')).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(parseUpdateSettings('[]')).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(parseUpdateSettings('"hello"')).toEqual(DEFAULT_UPDATE_SETTINGS)
    expect(parseUpdateSettings('null')).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('完整值原样解析', () => {
    expect(parseUpdateSettings('{"autoUpdate":false,"skippedVersion":"1.2.3"}')).toEqual({
      autoUpdate: false,
      skippedVersion: '1.2.3',
    })
  })

  it('缺 autoUpdate 时用默认值补齐', () => {
    expect(parseUpdateSettings('{"skippedVersion":"9.9.9"}')).toEqual({
      autoUpdate: DEFAULT_UPDATE_SETTINGS.autoUpdate,
      skippedVersion: '9.9.9',
    })
  })

  it('缺 skippedVersion 时解析为 null', () => {
    expect(parseUpdateSettings('{"autoUpdate":false}').skippedVersion).toBeNull()
  })

  it('字段类型错（autoUpdate 是字符串）时该项回落', () => {
    expect(parseUpdateSettings('{"autoUpdate":"yes"}').autoUpdate).toBe(
      DEFAULT_UPDATE_SETTINGS.autoUpdate,
    )
  })

  it('skippedVersion 是非字符串时回落为 null', () => {
    expect(parseUpdateSettings('{"skippedVersion":123}').skippedVersion).toBeNull()
  })
})

describe('readUpdateSettings / writeUpdateSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('未写入时读到默认值', () => {
    expect(readUpdateSettings()).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('写入后可读回（往返一致）', () => {
    writeUpdateSettings({ autoUpdate: false, skippedVersion: '0.4.0' })
    expect(readUpdateSettings()).toEqual({ autoUpdate: false, skippedVersion: '0.4.0' })
  })

  it('写入再覆盖，读到最后一次的值', () => {
    writeUpdateSettings({ autoUpdate: false, skippedVersion: '0.4.0' })
    writeUpdateSettings({ autoUpdate: true, skippedVersion: null })
    expect(readUpdateSettings()).toEqual({ autoUpdate: true, skippedVersion: null })
  })

  it('存储里是垃圾值时读到默认值', () => {
    window.localStorage.setItem(STORAGE_KEY, 'garbage{{{')
    expect(readUpdateSettings()).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('写入的键名是 mindgrid:update-settings', () => {
    writeUpdateSettings({ autoUpdate: false, skippedVersion: null })
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"autoUpdate":false')
  })
})

describe('useUpdateSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('初始值为默认设置', () => {
    const { result } = renderHook(() => useUpdateSettings())
    expect(result.current.settings).toEqual(DEFAULT_UPDATE_SETTINGS)
  })

  it('setAutoUpdate 更新状态并持久化', () => {
    const { result } = renderHook(() => useUpdateSettings())

    act(() => {
      result.current.setAutoUpdate(false)
    })

    expect(result.current.settings.autoUpdate).toBe(false)
    expect(readUpdateSettings().autoUpdate).toBe(false)
  })

  it('skipVersion 记录版本并持久化', () => {
    const { result } = renderHook(() => useUpdateSettings())

    act(() => {
      result.current.skipVersion('1.0.0')
    })

    expect(result.current.settings.skippedVersion).toBe('1.0.0')
    expect(readUpdateSettings().skippedVersion).toBe('1.0.0')
  })

  it('skipVersion 不影响 autoUpdate', () => {
    const { result } = renderHook(() => useUpdateSettings())

    act(() => {
      result.current.setAutoUpdate(false)
    })
    act(() => {
      result.current.skipVersion('2.0.0')
    })

    expect(result.current.settings).toEqual({ autoUpdate: false, skippedVersion: '2.0.0' })
  })

  it('新挂载的 hook 读到上一次持久化的设置', () => {
    writeUpdateSettings({ autoUpdate: false, skippedVersion: '3.0.0' })

    const { result } = renderHook(() => useUpdateSettings())

    expect(result.current.settings).toEqual({ autoUpdate: false, skippedVersion: '3.0.0' })
  })
})
