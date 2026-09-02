import { useEffect, useRef, useState } from 'react'
import type { TopicImage, TopicSnapshot } from '../../../lib/document/types'
import { readAssetDataUrl } from '../../../lib/ipc/commands'

/** 从已解析的 data URL 表中取出当前主题图片的可渲染地址；缺失返回 null（节点不渲染图片）。 */
export function pickTopicImageUrl(
  image: TopicImage | null | undefined,
  urls: Record<string, string>,
): string | null {
  const assetId = image?.assetId

  if (!assetId) {
    return null
  }

  return urls[assetId] ?? null
}

/** 收集一批主题图片引用中的 assetId，去重并排序，保证同一资源只请求一次。 */
export function collectTopicImageAssetIds(
  images: Array<TopicImage | null | undefined>,
): string[] {
  const uniqueAssetIds = new Set<string>()

  for (const image of images) {
    if (image?.assetId) {
      uniqueAssetIds.add(image.assetId)
    }
  }

  return [...uniqueAssetIds].sort()
}

/**
 * 递归收集主题树中「带图片的主题」：topicId → assetId。
 *
 * 画布渲染只需要 assetId 集合（按资源去重即可），但**导出**需要知道
 * 每个 assetId 属于哪个主题，才能把解析出的 data URL 挂回对应节点，
 * 所以这里保留 topicId 与 assetId 的对应关系（同一资源被多个主题引用时会重复出现）。
 */
export function collectTopicImageRefs(
  topic: TopicSnapshot,
): Array<{ topicId: string; assetId: string }> {
  const refs: Array<{ topicId: string; assetId: string }> = []

  const walk = (node: TopicSnapshot) => {
    const assetId = node.image?.assetId
    if (assetId) {
      refs.push({ topicId: node.id, assetId })
    }
    for (const child of node.children) {
      walk(child)
    }
  }

  walk(topic)
  return refs
}

/**
 * 批量解析主题图片的 data URL。
 *
 * - 按 assetId 去重后并发拉取，结果合并进组件内缓存，重复挂载不重复请求同一资源。
 * - 拉取失败静默降级：表里不出现该 id，节点不渲染图片，不打断画布渲染。
 * - 卸载或依赖变化后不再 setState，避免 React 卸载告警。
 */
export function useTopicImageUrls(
  images: Array<TopicImage | null | undefined>,
): Record<string, string> {
  const assetIds = collectTopicImageAssetIds(images)
  // 以稳定字符串作为副作用依赖键，避免调用方传入的新数组导致无限刷新。
  const assetIdKey = assetIds.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  // 已解析 / 正在拉取的资源集合：用于跨依赖变化去重，避免同一资源重复请求。
  const resolvedAssetIdsRef = useRef<Set<string>>(new Set())
  const inFlightAssetIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!assetIdKey) {
      return
    }

    // 在 effect 内取局部引用，供异步回调与 cleanup 安全访问（ref.current 语义稳定）
    const resolvedAssetIds = resolvedAssetIdsRef.current
    const inFlightAssetIds = inFlightAssetIdsRef.current
    const pendingAssetIds = assetIdKey
      .split('|')
      .filter(
        (assetId) => !resolvedAssetIds.has(assetId) && !inFlightAssetIds.has(assetId),
      )

    if (pendingAssetIds.length === 0) {
      return
    }

    for (const assetId of pendingAssetIds) {
      inFlightAssetIds.add(assetId)
    }

    let cancelled = false

    void (async () => {
      const entries = await Promise.all(
        pendingAssetIds.map(async (assetId) => {
          try {
            return { assetId, dataUrl: await readAssetDataUrl(assetId) }
          } catch {
            // 读取失败（资源缺失 / 后端未就绪）→ 静默降级，不渲染图片
            return { assetId, dataUrl: '' }
          }
        }),
      )

      // 卸载 / 依赖变化后不再 setState，避免 React 卸载告警
      if (cancelled) {
        return
      }

      const loaded: Record<string, string> = {}

      for (const entry of entries) {
        inFlightAssetIds.delete(entry.assetId)

        if (entry.dataUrl) {
          resolvedAssetIds.add(entry.assetId)
          loaded[entry.assetId] = entry.dataUrl
        }
      }

      if (Object.keys(loaded).length === 0) {
        return
      }

      setUrls((current) => ({ ...current, ...loaded }))
    })()

    return () => {
      cancelled = true

      // 未完成（被取消）的资源交还给下一次尝试，已解析的不重复请求
      for (const assetId of pendingAssetIds) {
        if (!resolvedAssetIds.has(assetId)) {
          inFlightAssetIds.delete(assetId)
        }
      }
    }
  }, [assetIdKey])

  return urls
}
