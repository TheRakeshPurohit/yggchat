import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type HeadlessOperationMode = 'plan' | 'execute'

const DEFAULT_HEADLESS_INSTRUCTIONS = 'You are ChatGPT.'

const DEFAULT_CHAT_MODE_PROMPT_RELATIVE_PATH = 'src/features/chats/prompts/default_chat_mode.md'
const DEFAULT_AGENT_MODE_PROMPT_RELATIVE_PATH = 'src/features/chats/prompts/default_agent_mode.md'

let defaultChatModePrompt: string | null = null
let defaultAgentModePrompt: string | null = null

const appendPromptPart = (parts: string[], value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed) parts.push(trimmed)
}

const candidatePromptPaths = (relativePath: string): string[] => {
  const paths = [
    // Source/test runtime: electron/headlessServer/services/*.ts -> repo root.
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    // Bundled Electron main runtime: electron/main.mjs -> repo/app root.
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    // Local development fallback when the server is started from the package root.
    join(process.cwd(), relativePath),
  ]

  return [...new Set(paths)]
}

const readPromptFile = (relativePath: string): string => {
  const candidates = candidatePromptPaths(relativePath)

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        return readFileSync(candidate, 'utf8').trim()
      }
    } catch {
      // Try the next candidate before warning below.
    }
  }

  console.warn(`[HeadlessSystemPrompt] Failed to load operation mode prompt from: ${candidates.join(', ')}`)
  return ''
}

export function getHeadlessOperationModePrompt(operationMode?: HeadlessOperationMode | null): string {
  if (operationMode === 'plan') {
    defaultChatModePrompt ??= readPromptFile(DEFAULT_CHAT_MODE_PROMPT_RELATIVE_PATH)
    return defaultChatModePrompt
  }

  defaultAgentModePrompt ??= readPromptFile(DEFAULT_AGENT_MODE_PROMPT_RELATIVE_PATH)
  return defaultAgentModePrompt
}

export interface BuildHeadlessSystemPromptInput {
  operationMode?: HeadlessOperationMode | null
  includeOperationModePrompt?: boolean | null
  requestPrompt?: string | null
  projectPrompt?: string | null
  conversationPrompt?: string | null
}

export function buildHeadlessSystemPrompt({
  operationMode,
  includeOperationModePrompt = true,
  requestPrompt,
  projectPrompt,
  conversationPrompt,
}: BuildHeadlessSystemPromptInput): string {
  const parts: string[] = []

  if (includeOperationModePrompt !== false) {
    appendPromptPart(parts, getHeadlessOperationModePrompt(operationMode ?? 'execute'))
  }
  appendPromptPart(parts, requestPrompt)
  appendPromptPart(parts, projectPrompt)
  appendPromptPart(parts, conversationPrompt)

  return parts.join('\n\n') || DEFAULT_HEADLESS_INSTRUCTIONS
}
