import { screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { renderWithApp } from '../test/render'
import { AppShell } from './app-shell'

const useDocumentSessionMock = vi.fn()
const hasTauriRuntimeMock = vi.fn(() => true)

vi.mock('../features/document/use-document-session', () => ({
  useDocumentSession: () => useDocumentSessionMock(),
}))

vi.mock('../lib/ipc/transport', () => ({
  hasTauriRuntime: () => hasTauriRuntimeMock(),
}))

vi.mock('../features/workspace/workspace-screen', () => ({
  WorkspaceScreen: () => <div>workspace</div>,
}))

vi.mock('../features/status/status-bar', () => ({
  StatusBar: () => <div>status</div>,
}))

vi.mock('../features/feedback/toast-region', () => ({
  ToastRegion: () => <div>toast</div>,
}))

function createSessionStub(overrides: Record<string, unknown> = {}) {
  return {
    hasUnsavedChanges: false,
    canRepairLastFailedOpen: false,
    repairLastFailedOpen: async () => {},
    error: null,
    createNewDocument: async () => {},
    createFromTemplate: async () => {},
    openDocument: async () => {},
    saveDocument: async () => {},
    saveDocumentAs: async () => {},
    ...overrides,
  }
}

beforeEach(() => {
  hasTauriRuntimeMock.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

it('warns before closing the page when unsaved changes exist', () => {
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
  useDocumentSessionMock.mockReturnValue(
    createSessionStub({
      hasUnsavedChanges: true,
    }),
  )

  renderWithApp(<AppShell />)

  const beforeUnloadHandler = addEventListenerSpy.mock.calls.find(
    ([eventName]) => eventName === 'beforeunload',
  )?.[1] as ((event: BeforeUnloadEvent) => void) | undefined
  const event = {
    preventDefault: vi.fn(),
    returnValue: undefined,
  } as unknown as BeforeUnloadEvent

  beforeUnloadHandler?.(event)

  expect(beforeUnloadHandler).toBeDefined()
  expect(event.preventDefault).toHaveBeenCalledTimes(1)
  expect(event.returnValue).toBe('')
  expect(screen.getByText('workspace')).toBeInTheDocument()
})

it('handles desktop file workflow shortcuts globally', () => {
  const createNewDocument = vi.fn(async () => {})
  const openDocument = vi.fn(async () => {})
  const saveDocument = vi.fn(async () => {})
  const saveDocumentAs = vi.fn(async () => {})

  useDocumentSessionMock.mockReturnValue(
    createSessionStub({
      createNewDocument,
      openDocument,
      saveDocument,
      saveDocumentAs,
    }),
  )

  renderWithApp(<AppShell />)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true, bubbles: true }),
  )

  expect(createNewDocument).toHaveBeenCalledTimes(1)
  expect(openDocument).toHaveBeenCalledTimes(1)
  expect(saveDocument).toHaveBeenCalledTimes(1)
  expect(saveDocumentAs).toHaveBeenCalledTimes(1)
})

it('does not trigger open or save shortcuts outside desktop runtime', () => {
  hasTauriRuntimeMock.mockReturnValue(false)
  const createNewDocument = vi.fn(async () => {})
  const openDocument = vi.fn(async () => {})
  const saveDocument = vi.fn(async () => {})

  useDocumentSessionMock.mockReturnValue(
    createSessionStub({
      createNewDocument,
      openDocument,
      saveDocument,
    }),
  )

  renderWithApp(<AppShell />)

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))

  expect(createNewDocument).toHaveBeenCalledTimes(1)
  expect(openDocument).not.toHaveBeenCalled()
  expect(saveDocument).not.toHaveBeenCalled()
})
