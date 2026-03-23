import type { Express } from 'express'
import type { HeadlessSubagentRequest, SubagentOrchestrator } from '../services/subagentOrchestrator.js'

interface RegisterSubagentRoutesDeps {
  orchestrator: SubagentOrchestrator
}

function normalizeTools(raw: any): HeadlessSubagentRequest['tools'] {
  if (!Array.isArray(raw)) return undefined

  const tools = raw
    .map((tool: any) => {
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
    .filter(Boolean)

  return tools.length > 0 ? tools : undefined
}

function buildHeadlessSubagentRequest(body: any): HeadlessSubagentRequest {
  return {
    conversationId: String(body?.conversationId ?? body?.conversation_id ?? '').trim(),
    parentMessageId: String(body?.parentMessageId ?? body?.parent_message_id ?? body?.messageId ?? body?.message_id ?? '').trim(),
    prompt: typeof body?.prompt === 'string' ? body.prompt : '',
    provider: typeof body?.provider === 'string' ? body.provider : 'openaichatgpt',
    modelName: typeof body?.modelName === 'string' ? body.modelName : typeof body?.model === 'string' ? body.model : 'gpt-5.4',
    systemPrompt: typeof body?.systemPrompt === 'string' ? body.systemPrompt : null,
    maxTurns: typeof body?.maxTurns === 'number' ? body.maxTurns : undefined,
    maxToolCalls: typeof body?.maxToolCalls === 'number' ? body.maxToolCalls : undefined,
    temperature: typeof body?.temperature === 'number' ? body.temperature : undefined,
    userId: typeof body?.userId === 'string' ? body.userId : null,
    accessToken: typeof body?.accessToken === 'string' ? body.accessToken : null,
    accountId: typeof body?.accountId === 'string' ? body.accountId : null,
    tools: normalizeTools(body?.tools),
    streamId: typeof body?.streamId === 'string' ? body.streamId : null,
    rootPath: typeof body?.rootPath === 'string' ? body.rootPath : null,
    operationMode: body?.operationMode === 'plan' ? 'plan' : 'execute',
    toolTimeoutMs: typeof body?.toolTimeoutMs === 'number' ? body.toolTimeoutMs : undefined,
  }
}

export function registerSubagentRoutes(app: Express, deps: RegisterSubagentRoutesDeps): void {
  app.post('/api/headless/subagent/run', async (req, res) => {
    try {
      const request = buildHeadlessSubagentRequest(req.body ?? {})
      if (!request.conversationId) {
        res.status(400).json({ success: false, error: 'conversationId is required' })
        return
      }
      if (!request.parentMessageId) {
        res.status(400).json({ success: false, error: 'parentMessageId is required' })
        return
      }
      if (!request.prompt.trim()) {
        res.status(400).json({ success: false, error: 'prompt is required' })
        return
      }

      const result = await deps.orchestrator.run(request)
      res.json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).json({ success: false, error: message })
    }
  })
}
