import { describe, expect, it } from 'vitest'
import { buildHeadlessSystemPrompt } from '../headlessSystemPrompt.js'

describe('buildHeadlessSystemPrompt', () => {
  it('combines operation mode, request, project, and conversation prompts in renderer order', () => {
    const prompt = buildHeadlessSystemPrompt({
      operationMode: 'plan',
      requestPrompt: 'Request prompt',
      projectPrompt: 'Project prompt from sqlite',
      conversationPrompt: 'Conversation prompt from sqlite',
    })

    expect(prompt).toContain('Agent Prompt: Plan mode')
    expect(prompt).toContain('Request prompt\n\nProject prompt from sqlite\n\nConversation prompt from sqlite')
    expect(prompt.indexOf('Agent Prompt: Plan mode')).toBeLessThan(prompt.indexOf('Request prompt'))
  })

  it('uses agent mode instructions for execute mode', () => {
    const prompt = buildHeadlessSystemPrompt({ operationMode: 'execute' })

    expect(prompt).toContain('Agent Prompt: Coding mode')
  })

  it('can disable default operation mode prompts', () => {
    const prompt = buildHeadlessSystemPrompt({
      operationMode: 'plan',
      includeOperationModePrompt: false,
      requestPrompt: 'Request prompt',
      projectPrompt: 'Project prompt from sqlite',
      conversationPrompt: 'Conversation prompt from sqlite',
    })

    expect(prompt).toBe('Request prompt\n\nProject prompt from sqlite\n\nConversation prompt from sqlite')
  })

  it('falls back to non-empty ChatGPT instructions when no prompts are present', () => {
    expect(buildHeadlessSystemPrompt({ includeOperationModePrompt: false })).toBe('You are ChatGPT.')
  })
})
