# Agent Context: Hooks System

Last reviewed: 2026-06-16

## Purpose

Documents Ygg hook lifecycle, hook loading/storage, sync/async execution, and how hook output feeds back into chat/tool loops.

## When to Open This File

Use this when changing:
- hook event payloads or response contracts;
- sync vs async hook execution;
- hook storage/discovery;
- chat integration of UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, or Stop;
- hook settings format.

## Key Files

- `client/ygg-chat-r/docs/hookInstruction.md`: detailed user-facing hook instructions.
- `client/ygg-chat-r/electron/hooks/hookTypes.ts`: hook types/contracts.
- `client/ygg-chat-r/electron/hooks/hookRunner.ts`: command execution and output parsing.
- `client/ygg-chat-r/electron/hooks/hookManager.ts`: hook discovery/management.
- `client/ygg-chat-r/electron/hooks/hookStorage.ts`: settings/load helpers.
- `client/ygg-chat-r/src/features/chats/chatHookClient.ts`: renderer client for hook API.
- `client/ygg-chat-r/src/features/chats/chatActions.ts`: hook call sites in chat/tool loops.
- `.ygg/settings.json` and `.ygg/settings.local.json`: possible hook config locations when present.

## Lifecycle Events

- `UserPromptSubmit`: before first provider request; can block/rewrite prompt/add context.
- `PreToolUse`: before local tool execution; can deny/allow/rewrite input/add context.
- `PostToolUse`: after successful tool execution; can add context.
- `PostToolUseFailure`: after failed tool execution; can add recovery context.
- `Stop`: before agent loop stops; can block stop and force continuation with context.

## Execution Mode Notes

- Some hook types must be synchronous because they make decisions or mutate prompt/tool input.
- Non-decision hooks can run asynchronously where configured to avoid blocking chat persistence/generation.
- Tool/prompt-mutating hooks should default to awaited/synchronous unless intentionally changed.

## Important Invariants

- Renderer does not execute hook commands directly; local server does.
- Hook commands receive JSON via stdin.
- Prefer JSON output from hooks for stable parsing.
- `additionalContext` is model feedback, not a user message.
- Deny/block decisions should produce explicit reasons.

## Gotchas

- Hook discovery walks upward from active cwd and user home; cwd bugs can make hooks appear missing.
- WSL/Windows path handling affects settings discovery and command execution.
- Errors from one hook may be collected while later hooks continue; check returned `errors`.

## Testing and Validation

- Build Electron after contract changes: `npm --prefix client/ygg-chat-r run build:electron`.
- Manually verify a simple command hook for each touched event.
- For chat integration changes, test send, tool use, failed tool use, and Stop continuation.

## Related Docs

- `agent_chat_pipeline.md`
- `agent_local_tools_runtime.md`
- `client/ygg-chat-r/docs/hookInstruction.md`
