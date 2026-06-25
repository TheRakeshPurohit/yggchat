import type { ConversationId, MessageId } from '../../../../../shared/types'
import type { Message } from './chatTypes'

export interface BranchDebugMessageCell {
  id: MessageId
  role: Message['role']
  parentId: MessageId | null
  childrenIds: MessageId[]
  contentPreview: string
  createdAt: string | null
}

export interface BranchDebugRow {
  branchIndex: number
  conversationId: ConversationId | null
  rootMessageId: MessageId | null
  leafMessageId: MessageId
  depth: number
  messages: BranchDebugMessageCell[]
}

export interface BranchDebugData {
  branches: BranchDebugRow[]
  maxDepth: number
  messageCount: number
  leafCount: number
}

const normalizeChildrenIds = (value: Message['children_ids'] | string | null | undefined): MessageId[] => {
  if (Array.isArray(value)) return value as MessageId[]
  if (typeof value !== 'string') return []

  const trimmed = value.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? (parsed as MessageId[]) : []
  } catch {
    return trimmed
      .split(',')
      .map(id => id.trim())
      .filter(Boolean) as MessageId[]
  }
}

const getMessageTextPreview = (message: Message, maxLength = 72): string => {
  const content = String(message.content_plain_text || message.content || '').replace(/\s+/g, ' ').trim()
  if (!content) return '(empty)'
  return content.length > maxLength ? `${content.slice(0, maxLength - 1)}…` : content
}

const buildPathToMessage = (messages: Message[], leafMessageId: MessageId): Message[] => {
  const byId = new Map<string, Message>()
  for (const message of messages) {
    byId.set(String(message.id), message)
  }

  const path: Message[] = []
  const visited = new Set<string>()
  let cursor: MessageId | null = leafMessageId

  while (cursor != null) {
    const key = String(cursor)
    if (visited.has(key)) break
    visited.add(key)

    const message = byId.get(key)
    if (!message) break

    path.unshift(message)
    cursor = (message.parent_id ?? null) as MessageId | null
  }

  return path
}

export const buildConversationBranchDebugData = (messages: Message[] | undefined | null): BranchDebugData => {
  const safeMessages = Array.isArray(messages) ? messages : []
  if (safeMessages.length === 0) {
    return { branches: [], maxDepth: 0, messageCount: 0, leafCount: 0 }
  }

  const parentIds = new Set<string>()
  for (const message of safeMessages) {
    if (message.parent_id != null) parentIds.add(String(message.parent_id))
  }

  const leaves = safeMessages
    .filter(message => !parentIds.has(String(message.id)))
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

  const branches = leaves.map((leaf, index): BranchDebugRow => {
    const path = buildPathToMessage(safeMessages, leaf.id)
    const cells = path.map((message): BranchDebugMessageCell => ({
      id: message.id,
      role: message.role,
      parentId: (message.parent_id ?? null) as MessageId | null,
      childrenIds: normalizeChildrenIds(message.children_ids),
      contentPreview: getMessageTextPreview(message),
      createdAt: message.created_at || null,
    }))

    return {
      branchIndex: index + 1,
      conversationId: leaf.conversation_id ?? null,
      rootMessageId: cells[0]?.id ?? null,
      leafMessageId: leaf.id,
      depth: cells.length,
      messages: cells,
    }
  })

  return {
    branches,
    maxDepth: branches.reduce((max, branch) => Math.max(max, branch.depth), 0),
    messageCount: safeMessages.length,
    leafCount: leaves.length,
  }
}
