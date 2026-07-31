import { invoke } from '@tauri-apps/api/core'
import { invokeBrowserCommand } from './browser-session'

export function hasTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function invokeCommand<TResult>(
  command: string,
  payload?: Record<string, unknown>,
) {
  if (!hasTauriRuntime()) {
    return invokeBrowserCommand<TResult>(command, payload)
  }

  return invoke<TResult>(command, payload)
}
