import { useCallback, useMemo } from 'react'
import type { StreamEvent, StreamState } from '../features/chats/chatTypes'
import type { Conversation } from '../features/conversations/conversationTypes'
import { useAppSelector } from './redux'
import type { ResearchNoteItem } from './useQueries'

export type AgentStreamActivityKind = StreamEvent['type'] | 'idle'

export type AgentStreamListItem = {
  streamId: string
  streamType: string
  conversationId: string | null
  projectId: string | null
  conversationTitle: string | null
  anchorMessageId: string | null
  hasError: boolean
  createdAt: string
  rootMessageId: string | null
  activityKind: AgentStreamActivityKind
  activityLabel: string
  completedAt: string | null
  displayName: string
}

export const summarizeAgentStreamId = (value: string | null | undefined): string => {
  if (!value) return '—'
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

export const getAgentActivityBadgeClasses = (kind: AgentStreamActivityKind): string => {
  const baseClasses = 'rounded-full px-2 py-0.5 font-medium'
  if (kind === 'tool_call' || kind === 'tool_result') {
    return `${baseClasses} bg-violet-100/80 dark:bg-violet-500/15 text-violet-700 dark:text-violet-200`
  }
  if (kind === 'reasoning') {
    return `${baseClasses} bg-sky-100/80 dark:bg-sky-500/15 text-sky-700 dark:text-sky-200`
  }
  if (kind === 'text') {
    return `${baseClasses} bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-200`
  }
  if (kind === 'image') {
    return `${baseClasses} bg-fuchsia-100/80 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200`
  }
  return `${baseClasses} bg-neutral-100 dark:bg-neutral-800/70 text-neutral-600 dark:text-neutral-300`
}

const getStreamActivity = (stream: StreamState): { activityKind: AgentStreamActivityKind; activityLabel: string } => {
  if (Array.isArray(stream.events) && stream.events.length > 0) {
    for (let index = stream.events.length - 1; index >= 0; index -= 1) {
      const event = stream.events[index]
      if (!event) continue

      if (event.type === 'tool_call') {
        const toolName = event.toolCall?.name || stream.toolCalls[stream.toolCalls.length - 1]?.name || 'tool'
        return {
          activityKind: 'tool_call',
          activityLabel: `tool: ${toolName}`,
        }
      }

      if (event.type === 'tool_result') {
        const matchingTool = stream.toolCalls.find(toolCall => toolCall.id === event.toolResult?.tool_use_id)
        return {
          activityKind: 'tool_result',
          activityLabel: matchingTool?.name ? `result: ${matchingTool.name}` : 'tool result',
        }
      }

      if (event.type === 'reasoning') return { activityKind: 'reasoning', activityLabel: 'reasoning' }
      if (event.type === 'text') return { activityKind: 'text', activityLabel: 'text' }
      if (event.type === 'image') return { activityKind: 'image', activityLabel: 'image' }
    }
  }

  if (stream.toolCalls.length > 0) {
    const latestTool = stream.toolCalls[stream.toolCalls.length - 1]
    return {
      activityKind: 'tool_call',
      activityLabel: `tool: ${latestTool?.name || 'tool'}`,
    }
  }

  if (stream.thinkingBuffer.trim().length > 0) return { activityKind: 'reasoning', activityLabel: 'reasoning' }
  if (stream.buffer.trim().length > 0) return { activityKind: 'text', activityLabel: 'text' }

  return { activityKind: 'idle', activityLabel: 'starting' }
}

export function useRunningAgentStreams(notes: ResearchNoteItem[] = []) {
  const conversations = useAppSelector(state => state.conversations.items)
  const streamingRoot = useAppSelector(state => state.chat.streaming)

  const notesByConversationId = useMemo(() => {
    const map = new Map<string, ResearchNoteItem>()
    for (const note of notes) {
      map.set(String(note.id), note)
    }
    return map
  }, [notes])

  const conversationsById = useMemo(() => {
    const map = new Map<string, Conversation>()
    for (const item of conversations) {
      map.set(String(item.id), item)
    }
    return map
  }, [conversations])

  const buildAgentStreamListItem = useCallback(
    (streamId: string, stream: StreamState, completedAt: string | null = null, displayIndex = 0): AgentStreamListItem => {
      const streamConversationId = stream.conversationId ? String(stream.conversationId) : null
      const convo = streamConversationId ? conversationsById.get(streamConversationId) : null
      const note = streamConversationId ? notesByConversationId.get(streamConversationId) : null
      const anchorMessageId =
        stream.streamingMessageId ||
        stream.messageId ||
        stream.lineage.originMessageId ||
        stream.lineage.rootMessageId ||
        null
      const { activityKind, activityLabel } = getStreamActivity(stream)

      return {
        streamId,
        streamType: stream.streamType,
        conversationId: streamConversationId,
        projectId: convo?.project_id ? String(convo.project_id) : note?.project_id ? String(note.project_id) : null,
        conversationTitle: convo?.title || note?.title || (streamConversationId ? `Conversation ${streamConversationId}` : null),
        anchorMessageId: anchorMessageId ? String(anchorMessageId) : null,
        hasError: Boolean(stream.error),
        createdAt: stream.createdAt,
        rootMessageId: stream.lineage.rootMessageId ? String(stream.lineage.rootMessageId) : null,
        activityKind,
        activityLabel,
        completedAt,
        displayName: `agent-${displayIndex + 1}`,
      }
    },
    [conversationsById, notesByConversationId]
  )

  const activeStreams = useMemo(() => {
    const streams: Array<{ streamId: string; stream: StreamState }> = []

    for (const streamId of streamingRoot.activeIds) {
      const stream = streamingRoot.byId[streamId]
      if (!stream || !stream.active) continue
      streams.push({ streamId, stream })
    }

    return streams
      .sort((a, b) => b.stream.createdAt.localeCompare(a.stream.createdAt))
      .map((entry, index) => buildAgentStreamListItem(entry.streamId, entry.stream, null, index))
  }, [buildAgentStreamListItem, streamingRoot.activeIds, streamingRoot.byId])

  return {
    activeStreams,
    buildAgentStreamListItem,
    streamingRoot,
  }
}
