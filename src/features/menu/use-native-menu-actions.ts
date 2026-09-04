import { useEffect, useRef } from 'react'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import { isMenuActionId, MENU_ACTION_EVENT, type MenuActionId } from './menu-actions'

/**
 * 监听 Rust 侧转发的菜单点击事件。
 *
 * 在浏览器 / 测试环境（`hasTauriRuntime()` 为 false）直接不订阅，
 * 因此组件可以无条件调用本 hook，无需调用方判断是否跑在 Tauri 里。
 *
 * 回调放 ref 里：命令处理器通常闭包了 session 与视图状态，每次渲染都是新引用。
 * 若把回调放进订阅 effect 的依赖，菜单每触发一次状态变化就会重订阅一次。
 * 这里订阅只在挂载时建立一次，回调始终读最新值。
 */
export function useNativeMenuActions(onAction: (id: MenuActionId) => void) {
  const onActionRef = useRef(onAction)

  useEffect(() => {
    onActionRef.current = onAction
  })

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return
    }

    let unlisten: (() => void) | undefined
    let cancelled = false

    // 动态 import：浏览器构建下不该为这段代码付出加载 Tauri API 的代价
    void import('@tauri-apps/api/event').then(({ listen }) =>
      listen<string>(MENU_ACTION_EVENT, (event) => {
        if (!isMenuActionId(event.payload)) {
          return
        }

        onActionRef.current(event.payload)
      }).then((dispose) => {
        if (cancelled) {
          dispose()
          return
        }

        unlisten = dispose
      }),
    )

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
