import { useEffect } from 'react'
import { hasTauriRuntime } from '../lib/ipc/transport'
import { useDocumentSession } from '../features/document/use-document-session'
import { ToastRegion } from '../features/feedback/toast-region'
import { StatusBar } from '../features/status/status-bar'
import { WorkspaceScreen } from '../features/workspace/workspace-screen'
import { useUpdater } from '../features/updater/use-updater'
import { UpdateNotification } from '../features/updater/update-notification'

export function AppShell() {
  const session = useDocumentSession()
  const updater = useUpdater()
  const desktopFileActionsEnabled = hasTauriRuntime()
  const toastActionLabel = session.canRepairLastFailedOpen ? '修复为副本' : undefined
  const toastAction = session.canRepairLastFailedOpen
    ? () => {
        void session.repairLastFailedOpen()
      }
    : undefined

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
      <WorkspaceScreen session={session} onCheckForUpdates={() => void updater.manualCheck()} />
      <StatusBar session={session} />
      <ToastRegion message={session.error} actionLabel={toastActionLabel} onAction={toastAction} />
      <UpdateNotification updater={updater} />
    </div>
  )
}
