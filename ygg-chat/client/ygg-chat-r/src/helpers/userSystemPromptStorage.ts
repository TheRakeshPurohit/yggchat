import { LOCAL_AUTH_USER_ID } from '../config/runtimeMode'
import type { UserSystemPromptCached } from '../hooks/useQueries'

export type UserSystemPromptStorageMode = 'cloud' | 'local'

export type UserSystemPromptRecord = UserSystemPromptCached & {
  storage_mode: UserSystemPromptStorageMode
}

const STORAGE_KEY = 'ygg_user_system_prompts'
const LOCAL_OWNER_ID = LOCAL_AUTH_USER_ID || 'local'

export const USER_SYSTEM_PROMPTS_STORAGE_CHANGE_EVENT = 'ygg-user-system-prompts-storage-change'

const makeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const normalizePrompt = (prompt: Partial<UserSystemPromptRecord> | null | undefined): UserSystemPromptRecord | null => {
  if (!prompt || typeof prompt !== 'object') return null

  const id = typeof prompt.id === 'string' ? prompt.id.trim() : ''
  const name = typeof prompt.name === 'string' ? prompt.name.trim() : ''
  const content = typeof prompt.content === 'string' ? prompt.content.trim() : ''

  if (!id || !name || !content) return null

  const now = new Date().toISOString()

  return {
    id: id.startsWith('local-') ? id : `local-${id}`,
    owner_id: typeof prompt.owner_id === 'string' && prompt.owner_id.trim() ? prompt.owner_id : LOCAL_OWNER_ID,
    name,
    content,
    description: typeof prompt.description === 'string' ? prompt.description : null,
    is_default: Boolean(prompt.is_default),
    created_at: typeof prompt.created_at === 'string' ? prompt.created_at : now,
    updated_at: typeof prompt.updated_at === 'string' ? prompt.updated_at : now,
    storage_mode: 'local',
  }
}

const normalizePrompts = (prompts: unknown): UserSystemPromptRecord[] => {
  if (!Array.isArray(prompts)) return []

  const seen = new Set<string>()
  let defaultSeen = false

  return prompts.reduce<UserSystemPromptRecord[]>((acc, rawPrompt) => {
    const prompt = normalizePrompt(rawPrompt as Partial<UserSystemPromptRecord>)
    if (!prompt || seen.has(prompt.id)) return acc

    seen.add(prompt.id)
    if (prompt.is_default) {
      if (defaultSeen) {
        prompt.is_default = false
      } else {
        defaultSeen = true
      }
    }

    acc.push(prompt)
    return acc
  }, [])
}

const emitChange = (prompts: UserSystemPromptRecord[]) => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(USER_SYSTEM_PROMPTS_STORAGE_CHANGE_EVENT, { detail: prompts }))
    }
  } catch {
    // Ignore event dispatch failures.
  }
}

export const loadLocalUserSystemPrompts = (): UserSystemPromptRecord[] => {
  try {
    if (typeof localStorage === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return normalizePrompts(JSON.parse(stored))
  } catch {
    return []
  }
}

export const saveLocalUserSystemPrompts = (prompts: UserSystemPromptRecord[]): UserSystemPromptRecord[] => {
  const normalized = normalizePrompts(prompts)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    }
    emitChange(normalized)
  } catch (error) {
    console.error('[UserSystemPromptStorage] Failed to save local prompts:', error)
  }
  return normalized
}

export const createLocalUserSystemPrompt = ({
  name,
  content,
  description = null,
  isDefault = false,
}: {
  name: string
  content: string
  description?: string | null
  isDefault?: boolean
}): UserSystemPromptRecord => {
  const now = new Date().toISOString()
  const prompt: UserSystemPromptRecord = {
    id: makeId(),
    owner_id: LOCAL_OWNER_ID,
    name: name.trim(),
    content: content.trim(),
    description,
    is_default: Boolean(isDefault),
    created_at: now,
    updated_at: now,
    storage_mode: 'local',
  }

  const existing = loadLocalUserSystemPrompts()
  const next = prompt.is_default ? existing.map(item => ({ ...item, is_default: false })) : existing
  saveLocalUserSystemPrompts([...next, prompt])

  return prompt
}

export const setDefaultLocalUserSystemPrompt = (id: string): UserSystemPromptRecord | null => {
  let updatedPrompt: UserSystemPromptRecord | null = null
  const prompts = loadLocalUserSystemPrompts().map(prompt => {
    const isDefault = prompt.id === id
    const next = { ...prompt, is_default: isDefault, updated_at: isDefault ? new Date().toISOString() : prompt.updated_at }
    if (isDefault) updatedPrompt = next
    return next
  })

  saveLocalUserSystemPrompts(prompts)
  return updatedPrompt
}

export const clearDefaultLocalUserSystemPrompt = (): UserSystemPromptRecord[] => {
  const prompts = loadLocalUserSystemPrompts().map(prompt => ({ ...prompt, is_default: false }))
  return saveLocalUserSystemPrompts(prompts)
}
