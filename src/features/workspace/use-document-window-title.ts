import { useEffect } from 'react'
import { hasTauriRuntime } from '../../lib/ipc/transport'
import type { DocumentSession } from '../document/use-document-session'

/** 从文件路径取文件名（去扩展名）；无路径返回 null。 */
export function documentTitleFromPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null
  const fileName = filePath.split(/[\\/]/).pop() ?? ''
  const withoutExtension = fileName.replace(/\.mgd$/i, '')
  return withoutExtension.trim().length > 0 ? withoutExtension : null
}

/**
 * 用文档名作为窗口标题（对齐 XMind：标题栏显示文档名，而不是应用名）。
 *
 * - 已保存：用文件名（去 `.mgd`）；
 * - 未保存：用根主题文字（XMind 新建导图也以文档名占位）；
 * - 浏览器开发态：同步 `document.title`，方便调试时区分标签页。
 *
 * 这里刻意**不加应用名前缀**——macOS 标题栏的位置有限，XMind 也只放文档名。
 */
export function useDocumentWindowTitle(session: DocumentSession) {
  const filePath = session.filePath
  const rootTopicText = session.summary?.rootTopicText ?? ''
  const hasDocument = session.status === 'ready' && !!session.document

  useEffect(() => {
    if (!hasDocument) return

    const title = documentTitleFromPath(filePath) ?? rootTopicText.trim() ?? ''
    if (!title) return

    if (!hasTauriRuntime()) {
      document.title = `${title} - MindGrid`
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        if (!cancelled) {
          await getCurrentWindow().setTitle(title)
        }
      } catch {
        // 无窗口环境（测试 / SSR）静默跳过：标题只是显示细节
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasDocument, filePath, rootTopicText])
}
