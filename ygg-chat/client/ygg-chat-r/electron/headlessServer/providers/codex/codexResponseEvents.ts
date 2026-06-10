import type { CodexParseResult, CodexResponseParseOptions } from './types.js'

type State = {
  content: string
  reasoningParts: string[]
  toolCalls: NonNullable<CodexParseResult['toolCalls']>
  generatedImages: NonNullable<CodexParseResult['generatedImages']>
  providerStopReason: string
  responseId: string
  usage: any
  outputItems: any[]
  responseItemsAdded: any[]
  eventCounts: Map<string, number>
  itemPhases: Map<string, string>
  options: CodexResponseParseOptions
}

export function createCodexResponseParseState(options: CodexResponseParseOptions = {}): State {
  return {
    content: '',
    reasoningParts: [],
    toolCalls: [],
    generatedImages: [],
    providerStopReason: '',
    responseId: '',
    usage: undefined,
    outputItems: [],
    responseItemsAdded: [],
    eventCounts: new Map(),
    itemPhases: new Map(),
    options,
  }
}

export function codexResponseParseResult(state: State): CodexParseResult {
  const reasoningContent = state.reasoningParts.join('')
  return {
    content: selectFinalText(state),
    ...(reasoningContent ? { reasoningContent } : {}),
    toolCalls: dedupeToolCalls(state.toolCalls),
    ...(state.providerStopReason ? { providerStopReason: state.providerStopReason } : {}),
    ...(state.generatedImages.length ? { generatedImages: state.generatedImages } : {}),
    ...(state.responseId ? { responseId: state.responseId } : {}),
    ...(state.usage !== undefined ? { usage: state.usage } : {}),
    ...(state.outputItems.length ? { outputItems: state.outputItems } : {}),
    ...(state.responseItemsAdded.length ? { responseItemsAdded: state.responseItemsAdded } : {}),
    debug: {
      eventCounts: Object.fromEntries(state.eventCounts.entries()),
      outputItemCount: state.outputItems.length,
      addedItemCount: state.responseItemsAdded.length,
    },
  }
}

export function processCodexResponseEventText(text: string, state: State, eventHint = ''): void {
  let payload: any
  try {
    payload = JSON.parse(text)
  } catch {
    return
  }
  processCodexResponsePayload(payload, state, eventHint)
}

export function processCodexResponsePayload(payload: any, state: State, eventHint = ''): void {
  const eventType = eventHint || payload?.type || ''
  state.eventCounts.set(eventType || 'unknown', (state.eventCounts.get(eventType || 'unknown') || 0) + 1)
  switch (eventType) {
    case 'response.output_text.delta': {
      const delta = String(payload.delta ?? '')
      state.content += delta
      state.options.onTextDelta?.(delta)
      const itemId = typeof payload.item_id === 'string' ? payload.item_id : typeof payload.itemId === 'string' ? payload.itemId : ''
      const phase = itemId ? state.itemPhases.get(itemId) : ''
      if (phase !== 'commentary') state.options.emit?.({ type: 'chunk', part: 'text', delta })
      break
    }
    case 'response.reasoning_text.delta':
    case 'response.reasoning_summary_text.delta': {
      const delta = textFromUnknown(payload.delta)
      if (delta) {
        state.options.onReasoningDelta?.(delta)
        state.options.emit?.({ type: 'chunk', part: 'reasoning', delta })
      }
      appendReasoning(state, payload.delta)
      break
    }
    case 'response.output_item.added': {
      rememberItemPhase(payload.item, state)
      if (payload.item) state.responseItemsAdded.push(payload.item)
      break
    }
    case 'response.output_item.done': {
      const item = payload.item || payload.output_item || payload
      rememberItemPhase(item, state)
      if (item) state.responseItemsAdded.push(item)
      if (isHostedToolOutputItem(item)) state.outputItems.push(item)
      collectOutputItem(item, state)
      break
    }
    case 'response.completed':
    case 'response.done':
      state.providerStopReason = eventType
      captureCompletedResponseMetadata(payload.response, state)
      collectResponseOutput(payload.response, state)
      break
    case 'response.failed':
      throw new Error(`Codex response failed${payload.response?.error?.message ? `: ${payload.response.error.message}` : ''}`)
    case 'response.incomplete': {
      const message = payload.response?.error?.message || payload.response?.incomplete_details?.reason || 'OpenAI response was incomplete.'
      throw new Error(message)
    }
    case 'error':
      throw new Error(typeof payload.error?.message === 'string' ? payload.error.message : 'OpenAI websocket returned an error event.')
    default:
      if (payload?.type === 'function_call') collectOutputItem(payload, state)
      break
  }
}

function rememberItemPhase(item: any, state: State): void {
  const id = typeof item?.id === 'string' ? item.id : ''
  const phase = typeof item?.phase === 'string' ? item.phase : ''
  if (id && phase) state.itemPhases.set(id, phase)
}

function captureCompletedResponseMetadata(response: any, state: State): void {
  if (!response || typeof response !== 'object') return
  if (typeof response.id === 'string') state.responseId = response.id
  if (response.usage !== undefined) state.usage = response.usage
  if (Array.isArray(response.output)) state.outputItems = response.output
}

function collectResponseOutput(response: any, state: State): void {
  if (!Array.isArray(response?.output)) return
  for (const item of response.output) collectOutputItem(item, state)
}

function collectOutputItem(item: any, state: State): void {
  if (!item || typeof item !== 'object') return
  if (item.type === 'reasoning') {
    appendReasoning(state, reasoningTextFromItem(item))
    return
  }
  if (item.type === 'function_call') {
    state.toolCalls.push({
      id: item.call_id || item.id,
      name: String(item.name || 'unknown_tool'),
      arguments: parseArgs(item.arguments),
      status: 'pending',
    })
    return
  }
  if (item.type === 'image_generation_call' || item.type === 'generated_image') {
    const url = item.url || item.image_url
    const dataUrl = dataUrlFromImageItem(item)
    const mimeType = mimeTypeFromImageItem(item)
    state.generatedImages.push({ ...(url ? { url } : {}), ...(dataUrl ? { dataUrl } : {}), ...(mimeType ? { mimeType } : {}) })
    return
  }
  if (item.type === 'message' || item.type === 'output_message') {
    const text = outputTextFromItem(item)
    if (text && !state.content) {
      state.content += text
      state.options.emit?.({ type: 'chunk', part: 'text', delta: text })
    }
  }
}

function selectFinalText(state: State): string {
  if (!Array.isArray(state.outputItems) || state.outputItems.length === 0) return state.content
  const messages = state.outputItems
    .filter(item => item?.type === 'message' || item?.type === 'output_message')
    .map(item => ({ phase: item.phase, text: outputTextFromItem(item) }))
    .filter(item => item.text.trim())
  if (messages.length === 0) return state.content
  const finalAnswer = [...messages].reverse().find(item => item.phase === 'final_answer')
  const nonCommentary = [...messages].reverse().find(item => item.phase !== 'commentary')
  return finalAnswer?.text || nonCommentary?.text || messages[messages.length - 1]?.text || state.content
}

function appendReasoning(state: State, value: unknown): void {
  const text = textFromUnknown(value)
  if (!text.trim()) return
  const current = state.reasoningParts.join('')
  if (!current || !normalizeReasoningText(current).includes(normalizeReasoningText(text))) state.reasoningParts.push(text)
}

function normalizeReasoningText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isHostedToolOutputItem(item: any): boolean {
  return item?.type === 'web_search_call' || item?.type === 'image_generation_call' || item?.type === 'generated_image'
}

function reasoningTextFromItem(item: any): string {
  return [item.summary, item.content, item.text, item.delta].map(textFromUnknown).filter(Boolean).join('')
}

function outputTextFromItem(item: any): string {
  return textPartsFromUnknown(item.content, new Set(['output_text', 'text'])).join('')
}

function textFromUnknown(value: unknown): string {
  return textPartsFromUnknown(value).join('')
}

function textPartsFromUnknown(value: unknown, allowedTypes?: Set<string>): string[] {
  if (value === undefined || value === null) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'number' || typeof value === 'boolean') return []
  if (Array.isArray(value)) return value.flatMap(item => textPartsFromUnknown(item, allowedTypes))
  if (typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''
  if (allowedTypes && type && !allowedTypes.has(type)) return []
  const parts: string[] = []
  if (typeof record.text === 'string') parts.push(record.text)
  if (typeof record.delta === 'string') parts.push(record.delta)
  if (typeof record.content === 'string') parts.push(record.content)
  return parts
}

function parseArgs(value: unknown): any {
  if (typeof value !== 'string') return value ?? {}
  if (!value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function dedupeToolCalls(toolCalls: NonNullable<CodexParseResult['toolCalls']>): NonNullable<CodexParseResult['toolCalls']> {
  const seen = new Set<string>()
  const result = []
  for (const call of toolCalls) {
    const key = call.id || `${call.name}:${JSON.stringify(call.arguments)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(call)
  }
  return result
}

function dataUrlFromImageItem(item: any): string | undefined {
  const value = typeof item?.result === 'string' ? item.result : typeof item?.dataUrl === 'string' ? item.dataUrl : ''
  if (!value) return undefined
  if (/^data:[^;]+;base64,/i.test(value)) return value
  return `data:${mimeTypeFromImageItem(item) || 'image/png'};base64,${value}`
}

function mimeTypeFromImageItem(item: any): string | undefined {
  const explicit = typeof item?.mimeType === 'string' ? item.mimeType : typeof item?.mime_type === 'string' ? item.mime_type : ''
  if (explicit) return explicit
  const format = String(item?.output_format || item?.format || '').trim().toLowerCase()
  if (format === 'jpg' || format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  if (format === 'png') return 'image/png'
  if (item?.result || item?.dataUrl) return 'image/png'
  return undefined
}
