import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectTopicImageAssetIds,
  pickTopicImageUrl,
  useTopicImageUrls,
} from './topic-image-store'
import type { TopicImage } from '../../../lib/document/types'

// vi.mock 会被提升到文件顶部，工厂函数需用 vi.hoisted 声明的 mock，避免 TDZ 报错。
const { readAssetDataUrl } = vi.hoisted(() => ({
  readAssetDataUrl: vi.fn(async (assetId: string) => `data:image/png;base64,${assetId}`),
}))

vi.mock('../../../lib/ipc/commands', () => ({ readAssetDataUrl }))

beforeEach(() => {
  readAssetDataUrl.mockClear()
})

describe('pickTopicImageUrl', () => {
  it('输入为空/无图时返回 null', () => {
    expect(pickTopicImageUrl(null, {})).toBeNull()
    expect(pickTopicImageUrl(undefined, { a: 'data:,' })).toBeNull()
    expect(pickTopicImageUrl({ assetId: '' }, { a: 'data:,' })).toBeNull()
  })

  it('命中已解析的资源表时返回 data URL', () => {
    const image: TopicImage = { assetId: 'asset_1', width: 120, height: 80 }

    expect(pickTopicImageUrl(image, { asset_1: 'data:image/png;base64,AAA' })).toBe(
      'data:image/png;base64,AAA',
    )
  })

  it('未命中（资源未加载或加载失败）时返回 null', () => {
    expect(pickTopicImageUrl({ assetId: 'missing' }, { asset_1: 'data:,' })).toBeNull()
    expect(pickTopicImageUrl({ assetId: 'asset_1' }, {})).toBeNull()
  })
})

describe('useTopicImageUrls', () => {
  it('空输入不发起任何请求', async () => {
    renderHook(() => useTopicImageUrls([]))

    await waitFor(() => {
      expect(readAssetDataUrl).not.toHaveBeenCalled()
    })
  })

  it('按 assetId 去重：同一资源只请求一次', async () => {
    const { result } = renderHook(() =>
      useTopicImageUrls([
        { assetId: 'asset_dup' },
        { assetId: 'asset_dup' },
        null,
        undefined,
        { assetId: 'asset_other' },
      ]),
    )

    await waitFor(() => {
      expect(result.current).toEqual({
        asset_dup: 'data:image/png;base64,asset_dup',
        asset_other: 'data:image/png;base64,asset_other',
      })
    })

    expect(readAssetDataUrl).toHaveBeenCalledTimes(2)
    expect(readAssetDataUrl).toHaveBeenCalledWith('asset_dup')
    expect(readAssetDataUrl).toHaveBeenCalledWith('asset_other')
  })

  it('拉取失败时静默降级，不抛异常且结果表不含该资源', async () => {
    readAssetDataUrl.mockRejectedValueOnce(new Error('资源不存在'))

    const { result } = renderHook(() => useTopicImageUrls([{ assetId: 'asset_broken' }]))

    await waitFor(() => {
      expect(readAssetDataUrl).toHaveBeenCalledWith('asset_broken')
    })

    expect(result.current).toEqual({})
    expect(pickTopicImageUrl({ assetId: 'asset_broken' }, result.current)).toBeNull()
  })

  it('依赖变化后增量拉取新资源，并保留已有缓存', async () => {
    const images: Array<TopicImage | null> = [{ assetId: 'asset_a' }]
    const { result, rerender } = renderHook(({ list }: { list: Array<TopicImage | null> }) =>
      useTopicImageUrls(list),
      { initialProps: { list: images } },
    )

    await waitFor(() => {
      expect(result.current).toEqual({ asset_a: 'data:image/png;base64,asset_a' })
    })

    await act(async () => {
      rerender({ list: [{ assetId: 'asset_a' }, { assetId: 'asset_b' }] })
    })

    await waitFor(() => {
      expect(result.current).toEqual({
        asset_a: 'data:image/png;base64,asset_a',
        asset_b: 'data:image/png;base64,asset_b',
      })
    })

    expect(readAssetDataUrl).toHaveBeenCalledTimes(2)
  })
})

describe('collectTopicImageAssetIds', () => {
  it('去重并排序，忽略空引用', () => {
    expect(
      collectTopicImageAssetIds([
        { assetId: 'b' },
        { assetId: 'a' },
        { assetId: 'b' },
        null,
        undefined,
      ]),
    ).toEqual(['a', 'b'])
  })
})
