import { useEffect, useState } from 'react'
import { getActiveSheet } from '../../lib/document/sheets'
import { syncSelectionWithActiveTopic } from '../canvas/interaction-state'
import { CanvasHost } from '../canvas/canvas-host'
import type { DocumentSession } from '../document/use-document-session'
import { PresentationView } from '../presentation/presentation-view'
import { Inspector } from './inspector'
import { Sidebar } from './sidebar'
import { Toolbar } from './toolbar'

interface WorkspaceScreenProps {
  session: DocumentSession
  onCheckForUpdates?: () => void
}

export function WorkspaceScreen({ session, onCheckForUpdates }: WorkspaceScreenProps) {
  const activeSheet = session.document ? getActiveSheet(session.document) : null
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(() =>
    session.activeTopicId ? [session.activeTopicId] : activeSheet ? [activeSheet.rootTopic.id] : [],
  )
  const [isPresenting, setIsPresenting] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)
  const clearMultiSelection = () => {
    setSelectedTopicIds([
      session.activeTopicId ?? activeSheet?.rootTopic.id ?? selectedTopicIds[0] ?? '',
    ].filter(Boolean))
  }

  useEffect(() => {
    if (!activeSheet) {
      setSelectedTopicIds([])
      return
    }

    setSelectedTopicIds((currentSelected) =>
      syncSelectionWithActiveTopic(currentSelected, session.activeTopicId ?? activeSheet.rootTopic.id),
    )
  }, [activeSheet?.id, activeSheet?.rootTopic.id, session.activeTopicId, session.document?.revision])

  // ZEN 模式快捷键：Cmd/Ctrl + . 切换，Esc 退出
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        setIsZenMode((v) => !v)
      } else if (e.key === 'Escape' && isZenMode) {
        setIsZenMode(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isZenMode])

  return (
    <div className={`workspace-shell${isZenMode ? ' workspace-shell--zen' : ''}`}>
      <Toolbar
        session={session}
        selectedTopicIds={selectedTopicIds}
        onClearSelection={clearMultiSelection}
        onStartPresentation={() => setIsPresenting(true)}
        onCheckForUpdates={onCheckForUpdates}
        onToggleZenMode={() => setIsZenMode((v) => !v)}
        isZenMode={isZenMode}
      />
      {isZenMode ? (
        <button
          className="zen-exit-btn"
          type="button"
          onClick={() => setIsZenMode(false)}
          title="退出专注模式（Esc）"
          aria-label="退出专注模式"
        >
          退出专注
        </button>
      ) : null}
      <div className="workspace-shell__body">
        <Sidebar
          session={session}
          selectedTopicIds={selectedTopicIds}
          onSelectedTopicIdsChange={setSelectedTopicIds}
        />
        <CanvasHost
          session={session}
          selectedTopicIds={selectedTopicIds}
          onSelectedTopicIdsChange={setSelectedTopicIds}
        />
        <Inspector
          session={session}
          selectedTopicIds={selectedTopicIds}
          onSelectedTopicIdsChange={setSelectedTopicIds}
        />
      </div>
      {isPresenting && session.document ? (
        <PresentationView document={session.document} onExit={() => setIsPresenting(false)} />
      ) : null}
    </div>
  )
}
