import { v4 as uuidv4 } from 'uuid'
import { MessageRepo } from '../persistence/messageRepo.js'
import type {
  ProviderGenerateInput,
  ProviderToolCall,
  ProviderToolDefinition,
} from '../providers/openRouterProvider.js'
import type { ProviderTokenStore } from '../providers/tokenStore.js'
import { ProviderRouter, normalizeProviderRoute } from './providerRouter.js'
import type { ToolExecutor } from './toolLoopService.js'

interface SubagentOrchestratorDeps {
  db: any
  statements: any
  tokenStore?: ProviderTokenStore
  providerRouter?: ProviderRouter
  toolExecutor?: ToolExecutor
  providerTurnTimeoutMs?: number
}

export interface HeadlessSubagentRequest {
  conversationId: string
  parentMessageId: string
  prompt: string
  provider: string
  modelName: string
  systemPrompt?: string | null
  maxTurns?: number
  maxToolCalls?: number
  temperature?: number
  userId?: string | null
  accessToken?: string | null
  accountId?: string | null
  tools?: ProviderToolDefinition[]
  streamId?: string | null
  rootPath?: string | null
  operationMode?: 'plan' | 'execute'
  toolTimeoutMs?: number
}

export interface HeadlessSubagentRunResult {
  success: true
  result: string
  sessionId: string
  turnsUsed: number
  maxTurns: number
  toolCallsUsed: number
  maxToolCalls: number
  toolsExecuted: Array<{ name: string; success: boolean }>
}

const DEFAULT_PROVIDER_TURN_TIMEOUT_MS = 180_000

function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const boundedTimeoutMs = Math.max(1_000, timeoutMs)

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${boundedTimeoutMs}ms`))
    }, boundedTimeoutMs)

    task.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

function normalizeToolCall(raw: any): ProviderToolCall | null {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : null
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : null
  if (!id || !name) return null

  return {
    id,
    name,
    arguments: raw.arguments ?? {},
    status: raw.status ?? 'pending',
  }
}

function appendGeneratedBlocks(output: {
  content: string
  reasoning?: string
  toolCalls?: ProviderToolCall[]
  contentBlocks?: any[]
  raw?: any
}): any[] {
  const blocks = Array.isArray(output.contentBlocks) ? [...output.contentBlocks] : []

  const hasTextBlock = blocks.some(block => block?.type === 'text')
  if (output.content && !hasTextBlock) {
    blocks.push({ type: 'text', content: output.content })
  }

  if (output.reasoning && !blocks.some(block => block?.type === 'thinking')) {
    blocks.unshift({ type: 'thinking', content: output.reasoning })
  }

  if (Array.isArray(output.toolCalls)) {
    for (const call of output.toolCalls) {
      if (!call?.id || !call?.name) continue
      const alreadyPresent = blocks.some(block => block?.type === 'tool_use' && block?.id === call.id)
      if (!alreadyPresent) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.arguments,
        })
      }
    }
  }

  const responseItems = output.raw?.responses_output_items
  if (
    Array.isArray(responseItems) &&
    responseItems.length > 0 &&
    !blocks.some(block => block?.type === 'responses_output_items')
  ) {
    blocks.push({
      type: 'responses_output_items',
      items: responseItems,
    })
  }

  return blocks
}

function toToolResultContent(result: any): string {
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function formatSubagentBody(content: string, reasoning?: string): string {
  if (reasoning && reasoning.trim()) {
    return `<thinking>\n${reasoning}\n</thinking>\n\n${content || ''}`.trim()
  }
  return content || ''
}

function sanitizeTools(tools: ProviderToolDefinition[] | undefined): ProviderToolDefinition[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined

  const sanitized = tools
    .map(tool => {
      if (!tool || typeof tool !== 'object') return null
      const name = typeof tool.name === 'string' ? tool.name.trim() : ''
      if (!name) return null
      return {
        name,
        description: typeof tool.description === 'string' ? tool.description : undefined,
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? tool.inputSchema
            : { type: 'object', properties: {} },
      }
    })
    .filter((tool): tool is ProviderToolDefinition => Boolean(tool))

  return sanitized.length > 0 ? sanitized : undefined
}

export class SubagentOrchestrator {
  private readonly messageRepo: MessageRepo
  private readonly providerRouter: ProviderRouter
  private readonly toolExecutor?: ToolExecutor
  private readonly providerTurnTimeoutMs: number

  constructor(deps: SubagentOrchestratorDeps) {
    this.messageRepo = new MessageRepo({ db: deps.db, statements: deps.statements })
    this.providerRouter = deps.providerRouter ?? new ProviderRouter({ tokenStore: deps.tokenStore })
    this.toolExecutor = deps.toolExecutor
    this.providerTurnTimeoutMs = Math.max(5_000, deps.providerTurnTimeoutMs ?? DEFAULT_PROVIDER_TURN_TIMEOUT_MS)
  }

  async run(request: HeadlessSubagentRequest): Promise<HeadlessSubagentRunResult> {
    const prompt = typeof request.prompt === 'string' ? request.prompt.trim() : ''
    if (!prompt) {
      throw new Error('Subagent prompt is required')
    }

    const conversationId = String(request.conversationId || '').trim()
    const parentMessageId = String(request.parentMessageId || '').trim()
    if (!conversationId) throw new Error('conversationId is required')
    if (!parentMessageId) throw new Error('parentMessageId is required')

    const provider =
      typeof request.provider === 'string' && request.provider.trim() ? request.provider : 'openaichatgpt'
    const providerRoute = normalizeProviderRoute(provider)
    const modelName = typeof request.modelName === 'string' && request.modelName.trim() ? request.modelName : 'gpt-5.4'
    const maxTurns = Math.min(Math.max(request.maxTurns || 10, 1), 50)
    const maxToolCalls = Math.min(Math.max(request.maxToolCalls || 20, 1), 50)
    const tools = sanitizeTools(request.tools)
    const sessionId = uuidv4()

    const promptMessage = this.messageRepo.createMessage({
      conversationId,
      parentId: parentMessageId,
      role: 'ex_agent',
      content: prompt,
      modelName,
      contentBlocks: [{ type: 'text', content: prompt }],
      exAgentSessionId: sessionId,
      exAgentType: 'subagent',
    })

    const history: any[] = []
    let currentUserContent = prompt
    let currentParentId = promptMessage.id
    let lastPersistedMessageId = promptMessage.id
    let finalResponse = ''
    let turnsUsed = 0
    let toolCallsUsed = 0
    const toolsExecuted: Array<{ name: string; success: boolean }> = []

    for (let turn = 1; turn <= maxTurns; turn++) {
      turnsUsed = turn

      const providerInput: ProviderGenerateInput = {
        modelName,
        systemPrompt: request.systemPrompt ?? null,
        history,
        userContent: currentUserContent,
        userId: request.userId ?? null,
        accessToken: request.accessToken ?? null,
        accountId: request.accountId ?? null,
        tools,
        railwayTurn:
          providerRoute === 'openrouter'
            ? {
                conversationId,
                parentId: currentParentId,
                operation: 'send',
                temperature: request.temperature,
                executionMode: 'client',
                isBranch: false,
                storageMode: 'local',
                isElectron: true,
              }
            : null,
      }

      const output = await withTimeout(
        this.providerRouter.generate(provider, providerInput),
        this.providerTurnTimeoutMs,
        `Subagent provider turn ${turn}/${maxTurns}`
      )

      const assistantToolCalls = Array.isArray(output.toolCalls)
        ? output.toolCalls.map(normalizeToolCall).filter((call): call is ProviderToolCall => Boolean(call))
        : []

      const assistantBlocks = appendGeneratedBlocks({
        ...output,
        toolCalls: assistantToolCalls,
      })

      const assistantMessage = this.messageRepo.createMessage({
        conversationId,
        parentId: lastPersistedMessageId,
        role: 'ex_agent',
        content: output.content || '',
        modelName,
        toolCalls: assistantToolCalls,
        contentBlocks: assistantBlocks,
        thinkingBlock: output.reasoning ?? null,
        exAgentSessionId: sessionId,
        exAgentType: 'subagent',
      })

      lastPersistedMessageId = assistantMessage.id
      currentParentId = assistantMessage.id

      const assistantHistoryMessage: any = {
        role: 'assistant',
        content: output.content || '',
        content_blocks: assistantBlocks,
        tool_calls: assistantToolCalls,
      }
      if (Array.isArray(output.raw?.responses_output_items) && output.raw.responses_output_items.length > 0) {
        assistantHistoryMessage.responses_output_items = output.raw.responses_output_items
      }
      history.push(assistantHistoryMessage)
      const assistantHistoryIndex = history.length - 1

      if (assistantToolCalls.length === 0) {
        finalResponse = formatSubagentBody(output.content || '', output.reasoning)
        break
      }

      if (!this.toolExecutor) {
        throw new Error('Subagent tool execution is unavailable in the headless runtime')
      }

      const toolResultBlocks: any[] = []
      const updatedToolCalls: ProviderToolCall[] = []

      for (const toolCall of assistantToolCalls) {
        let toolResultContent = ''
        let toolError = false

        if (toolCallsUsed >= maxToolCalls) {
          toolError = true
          toolResultContent =
            'TOOL_QUOTA_EXHAUSTED: You have reached the maximum number of tool calls allowed. Do not attempt any more tool calls. You must now summarize all findings gathered so far and provide your final response to complete your task.'
          toolsExecuted.push({ name: toolCall.name, success: false })
        } else {
          try {
            const result = await this.toolExecutor(toolCall, {
              conversationId,
              messageId: assistantMessage.id,
              streamId: request.streamId ?? null,
              rootPath: request.rootPath ?? null,
              operationMode: request.operationMode ?? 'execute',
              timeoutMs: request.toolTimeoutMs,
            })
            toolResultContent = toToolResultContent(result)
            toolError = false
            toolCallsUsed += 1
            toolsExecuted.push({ name: toolCall.name, success: true })
          } catch (error) {
            toolError = true
            toolResultContent = error instanceof Error ? error.message : String(error)
            toolsExecuted.push({ name: toolCall.name, success: false })
          }
        }

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: toolResultContent,
          is_error: toolError,
        })

        updatedToolCalls.push({
          ...toolCall,
          status: 'complete',
          result: toolResultContent,
        })

        history.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultContent,
        })
      }

      const updatedBlocks = [...assistantBlocks, ...toolResultBlocks]
      this.messageRepo.updateAssistantToolState(assistantMessage.id, {
        contentBlocks: updatedBlocks,
        toolCalls: updatedToolCalls,
      })

      assistantHistoryMessage.content_blocks = updatedBlocks
      assistantHistoryMessage.tool_calls = updatedToolCalls
      history[assistantHistoryIndex] = assistantHistoryMessage
      currentUserContent = ''
    }

    const hasTools = toolsExecuted.length > 0 || toolCallsUsed > 0
    const hasFinalText = typeof finalResponse === 'string' && finalResponse.trim().length > 0

    if (hasTools && !hasFinalText) {
      const finalInstruction =
        'Summarize the tool results above and provide the final answer. Do not call tools. Be concise and complete.'
      const finalOutput = await withTimeout(
        this.providerRouter.generate(provider, {
          modelName,
          systemPrompt: request.systemPrompt ?? null,
          history,
          userContent: finalInstruction,
          userId: request.userId ?? null,
          accessToken: request.accessToken ?? null,
          accountId: request.accountId ?? null,
          tools: undefined,
          railwayTurn:
            providerRoute === 'openrouter'
              ? {
                  conversationId,
                  parentId: currentParentId,
                  operation: 'send',
                  temperature: request.temperature,
                  executionMode: 'client',
                  isBranch: false,
                  storageMode: 'local',
                  isElectron: true,
                }
              : null,
        }),
        this.providerTurnTimeoutMs,
        'Subagent finalization'
      )

      const finalBlocks = appendGeneratedBlocks({
        ...finalOutput,
        toolCalls: [],
      })

      this.messageRepo.createMessage({
        conversationId,
        parentId: lastPersistedMessageId,
        role: 'ex_agent',
        content: finalOutput.content || '',
        modelName,
        contentBlocks: finalBlocks,
        thinkingBlock: finalOutput.reasoning ?? null,
        exAgentSessionId: sessionId,
        exAgentType: 'subagent',
      })

      finalResponse = formatSubagentBody(finalOutput.content || '', finalOutput.reasoning)
      turnsUsed += 1
    }

    if (!finalResponse.trim()) {
      throw new Error(
        `Subagent tool loop reached max turns (${maxTurns}) without producing a final response without tool calls`
      )
    }

    const toolSummary =
      toolsExecuted.length > 0
        ? toolsExecuted.map(tool => `${tool.name} (${tool.success ? '✓' : '✗'})`).join(', ')
        : 'none'

    return {
      success: true,
      result: `## Subagent Response (session: ${sessionId.slice(0, 8)})\n\n${finalResponse || 'No response generated'}\n\n---\nTurns: ${turnsUsed}/${maxTurns} | Tool calls: ${toolCallsUsed}/${maxToolCalls} | Tools: ${toolSummary}`,
      sessionId,
      turnsUsed,
      maxTurns,
      toolCallsUsed,
      maxToolCalls,
      toolsExecuted,
    }
  }
}
