import { describe, expect, it } from 'vitest'
import { buildOperationModeSystemPrompt } from '../../../../src/features/chats/operationModeSystemPrompt.js'

describe('buildOperationModeSystemPrompt', () => {
  it('adds concise Plan response style by default', () => {
    const prompt = buildOperationModeSystemPrompt({ operationMode: 'plan', includeCustomToolsPrompt: false })

    expect(prompt).toContain('Agent Prompt: Plan mode')
    expect(prompt).toContain('## Plan Response Style')
    expect(prompt).toContain('Use short, concise plans')
  })

  it('adds selected Plan response verbosity', () => {
    const prompt = buildOperationModeSystemPrompt({
      operationMode: 'plan',
      includeCustomToolsPrompt: false,
      planModeVerbosity: 'detailed',
    })

    expect(prompt).toContain('Use detailed plans when helpful')
  })

  it('does not add Plan response style in Agent Mode', () => {
    const prompt = buildOperationModeSystemPrompt({ operationMode: 'execute', includeCustomToolsPrompt: false })

    expect(prompt).toContain('Agent Prompt: Coding mode')
    expect(prompt).not.toContain('## Plan Response Style')
  })
})
