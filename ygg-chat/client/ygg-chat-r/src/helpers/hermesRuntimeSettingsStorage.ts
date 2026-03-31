export const HERMES_RUNTIME_SETTINGS_STORAGE_KEY = 'ygg_hermes_runtime_settings'
export const HERMES_RUNTIME_SETTINGS_CHANGE_EVENT = 'ygg-hermes-runtime-settings-change'

export type HermesLaunchModeSetting = 'auto' | 'native' | 'wsl'

export interface HermesRuntimeSettings {
  launchMode: HermesLaunchModeSetting
  wslDistro: string
}

const DEFAULT_SETTINGS: HermesRuntimeSettings = {
  launchMode: 'auto',
  wslDistro: '',
}

function normalizeLaunchMode(value: unknown): HermesLaunchModeSetting {
  return value === 'native' || value === 'wsl' || value === 'auto' ? value : DEFAULT_SETTINGS.launchMode
}

function normalizeWslDistro(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHermesRuntimeSettings(value: Partial<HermesRuntimeSettings> | null | undefined): HermesRuntimeSettings {
  return {
    launchMode: normalizeLaunchMode(value?.launchMode),
    wslDistro: normalizeWslDistro(value?.wslDistro),
  }
}

async function syncHermesRuntimeSettingsToElectronStore(settings: HermesRuntimeSettings): Promise<void> {
  if (typeof window === 'undefined') return

  const electronStorage = window.electronAPI?.storage
  if (!electronStorage?.set) return

  try {
    await electronStorage.set(HERMES_RUNTIME_SETTINGS_STORAGE_KEY, settings)
  } catch (error) {
    console.error('Failed to sync Hermes runtime settings to Electron storage:', error)
  }
}

export function loadHermesRuntimeSettings(): HermesRuntimeSettings {
  try {
    const stored = localStorage.getItem(HERMES_RUNTIME_SETTINGS_STORAGE_KEY)
    const parsed = stored ? (JSON.parse(stored) as Partial<HermesRuntimeSettings>) : DEFAULT_SETTINGS
    const normalized = normalizeHermesRuntimeSettings(parsed)
    void syncHermesRuntimeSettingsToElectronStore(normalized)
    return normalized
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveHermesRuntimeSettings(settings: HermesRuntimeSettings): HermesRuntimeSettings {
  const normalized = normalizeHermesRuntimeSettings(settings)

  try {
    localStorage.setItem(HERMES_RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(normalized))
    void syncHermesRuntimeSettingsToElectronStore(normalized)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<HermesRuntimeSettings>(HERMES_RUNTIME_SETTINGS_CHANGE_EVENT, { detail: normalized }))
    }
  } catch (error) {
    console.error('Failed to save Hermes runtime settings:', error)
  }

  return normalized
}
