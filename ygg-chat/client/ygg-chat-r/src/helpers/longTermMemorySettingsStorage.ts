export const LONG_TERM_MEMORY_CONTEXT_ENABLED_KEY = 'chat:longTermMemoryContextEnabled'
export const LONG_TERM_MEMORY_CONTEXT_ENABLED_CHANGE_EVENT = 'chat:longTermMemoryContextEnabledChange'

export const loadLongTermMemoryContextEnabled = (): boolean => {
  try {
    const stored = localStorage.getItem(LONG_TERM_MEMORY_CONTEXT_ENABLED_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

export const saveLongTermMemoryContextEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(LONG_TERM_MEMORY_CONTEXT_ENABLED_KEY, String(enabled))
    window.dispatchEvent(new CustomEvent<boolean>(LONG_TERM_MEMORY_CONTEXT_ENABLED_CHANGE_EVENT, { detail: enabled }))
  } catch {
    // no-op
  }
}
