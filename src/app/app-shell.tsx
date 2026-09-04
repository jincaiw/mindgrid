import { useCallback, useEffect, useRef, useState } from 'react'
import { hasTauriRuntime } from '../lib/ipc/transport'
import { useDocumentSession } from '../features/document/use-document-session'
import { ToastRegion } from '../features/feedback/toast-region'
import { WorkspaceScreen } from '../features/workspace/workspace-screen'
import { useUpdater } from '../features/updater/use-updater'
import { UpdateNotification } from '../features/updater/update-notification'
import { useTheme } from '../features/theme/use-theme'

const NOTICE_TIMEOUT_MS = 4000

export function AppShell() {
  const session = useDocumentSession()
  const updater = useUpdater()
  const desktopFileActionsEnabled = hasTauriRuntime()
  const theme = useTheme()
  const toastActionLabel = session.canRepairLastFailedOpen ? '修复为副本' : undefined
  const toastAction = session.canRepairLastFailedOpen
    ? () => {
        void session.repairLastFailedOpen()
      }
    : undefined
  // 瞬态通知（如系统剪贴板不可用），数秒后自动消失；文档级错误优先展示
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((message: string) => {
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current)
    }

    setNotice(message)
    noticeTimeoutRef.current = setTimeout(() => {
      noticeTimeoutRef.current = null
      setNotice(null)
    }, NOTICE_TIMEOUT_MS)
  }, [])

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!session.hasUnsavedChanges || typeof window === 'undefined') {
      return
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [session.hasUnsavedChanges])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) {
        return
      }

      const normalizedKey = event.key.toLowerCase()

      if (normalizedKey === 'n') {
        event.preventDefault()
        void session.createNewDocument()
        return
      }

      if (!desktopFileActionsEnabled) {
        return
      }

      if (normalizedKey === 'o') {
        event.preventDefault()
        void session.openDocument()
        return
      }

      if (normalizedKey === 's') {
        event.preventDefault()

        if (event.shiftKey) {
          void session.saveDocumentAs()
          return
        }

        void session.saveDocument()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [desktopFileActionsEnabled, session])

  return (
    <div className="app-frame">
      <WorkspaceScreen
        session={session}
        onCheckForUpdates={() => void updater.manualCheck()}
        onNotify={notify}
        themeMode={theme.mode}
        themeEffective={theme.effective}
        onCycleTheme={theme.cycleMode}
      />
      <ToastRegion
        message={session.error ?? notice}
        actionLabel={session.error ? toastActionLabel : undefined}
        onAction={session.error ? toastAction : undefined}
      />
      <UpdateNotification updater={updater} />
    </div>
  )
}
