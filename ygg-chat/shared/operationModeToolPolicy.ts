export type OperationMode = 'plan' | 'execute'

export interface OperationModeToolPolicyDefinition {
  name: string
  isCustom?: boolean
  isMcp?: boolean
}

export const CHAT_MODE_ALLOWED_TOOL_NAMES = new Set([
  'bash',
  'browse_web',
  'brave_search',
  'fetch_chats',
  'fetch_notes',
  'finance',
  'glob',
  'internalLink',
  'multi_call',
  'plan_md',
  'read_file',
  'read_file_continuation',
  'read_files',
  'ripgrep',
  'sports',
  'time',
  'view_image',
  'weather',
  'powershell',
  'subagent',
])

export const CHAT_MODE_BLOCKED_TOOL_NAMES = new Set([
  'create_file',
  'edit_file',
  'multi_edit',
  'delete_file',
])

export function filterToolsForOperationMode<T extends OperationModeToolPolicyDefinition>(
  tools: T[],
  operationMode: OperationMode
): T[] {
  if (operationMode !== 'plan') return tools
  return tools.filter(tool => !tool.isCustom && !tool.isMcp && CHAT_MODE_ALLOWED_TOOL_NAMES.has(tool.name))
}

export function assertToolAllowedForOperationMode(toolCall: any, operationMode: OperationMode): void {
  if (operationMode !== 'plan') return

  const toolName = typeof toolCall?.name === 'string' ? toolCall.name : ''
  if (!toolName) return

  if (CHAT_MODE_BLOCKED_TOOL_NAMES.has(toolName) || toolName.startsWith('mcp__')) {
    throw new Error(
      `Tool "${toolName}" is not available in Chat Mode. Switch to Agent Mode to run tools that can modify files, system state, or app state.`
    )
  }
}
