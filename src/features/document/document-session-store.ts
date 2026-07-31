import type {
  DocumentRepairReport,
  DocumentSessionSnapshot,
  DocumentSnapshot,
  DocumentSummary,
  SessionStatus,
} from '../../lib/document/types'

export interface RecentActionRecord {
  label: string
  scope: string | null
  detail: string
  count: number
}

export interface DocumentSessionState {
  status: SessionStatus
  document: DocumentSnapshot | null
  summary: DocumentSummary | null
  activeTopicId: string | null
  canUndo: boolean
  canRedo: boolean
  nextUndoAction: string | null
  nextRedoAction: string | null
  filePath: string | null
  lastSavedAtMs: number | null
  lastAutosavedAtMs: number | null
  hasUnsavedChanges: boolean
  recoveredFromAutosave: boolean
  repairReport: DocumentRepairReport | null
  error: string | null
  canRepairLastFailedOpen: boolean
  recentAction: string
  recentActions: RecentActionRecord[]
}

export const initialDocumentSessionState: DocumentSessionState = {
  status: 'idle',
  document: null,
  summary: null,
  activeTopicId: null,
  canUndo: false,
  canRedo: false,
  nextUndoAction: null,
  nextRedoAction: null,
  filePath: null,
  lastSavedAtMs: null,
  lastAutosavedAtMs: null,
  hasUnsavedChanges: false,
  recoveredFromAutosave: false,
  repairReport: null,
  error: null,
  canRepairLastFailedOpen: false,
  recentAction: '准备就绪',
  recentActions: [],
}

export function fromSnapshot(
  snapshot: DocumentSessionSnapshot,
  recentAction: string,
): DocumentSessionState {
  return {
    status: 'ready',
    document: snapshot.document,
    summary: snapshot.summary,
    activeTopicId: snapshot.activeTopicId,
    canUndo: snapshot.canUndo,
    canRedo: snapshot.canRedo,
    nextUndoAction: snapshot.nextUndoAction,
    nextRedoAction: snapshot.nextRedoAction,
    filePath: snapshot.filePath,
    lastSavedAtMs: snapshot.lastSavedAtMs,
    lastAutosavedAtMs: snapshot.lastAutosavedAtMs,
    hasUnsavedChanges: snapshot.hasUnsavedChanges,
    recoveredFromAutosave: snapshot.recoveredFromAutosave,
    repairReport: snapshot.repairReport,
    error: null,
    canRepairLastFailedOpen: false,
    recentAction,
    recentActions: [],
  }
}
