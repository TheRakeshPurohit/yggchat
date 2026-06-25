# Agent Context: Global Persistent Agent

Last reviewed: 2026-06-16
<!--
Defunct; retained only as historical context for the persistent background agent.
-->
## Purpose

Documents the persistent background/global agent designed for Electron local mode.

## When to Open This File

Use this when changing:
- global agent lifecycle start/pause/stop/tick;
- persistent agent state/settings;
- task queue endpoints;
- system project/session bootstrap;
- iframe app access to agent tasks/messages.

## Key Files

- `PERSISTENT_AGENT_CONTEXT.md`: deep design document.
- `client/ygg-chat-r/src/services/GlobalAgentLoop.ts`: singleton loop service.
- `client/ygg-chat-r/src/GlobalAgentBootstrap.tsx`: wires Redux/QueryClient context and initializes loop.
- `client/ygg-chat-r/src/hooks/useGlobalAgentCache.ts`: cache/state hook.
- `client/ygg-chat-r/src/hooks/useGlobalAgentMessages.ts`: agent message hook.
- `client/ygg-chat-r/src/helpers/agentSettingsStorage.ts`: agent settings persistence.
- `client/ygg-chat-r/electron/localServer.ts`: `/api/agent/*` and `/api/agent-settings` source of truth.
- `html_frame_context.md`: iframe app agent permission model.

## Runtime Context

- Electron/local only.
- Uses local SQLite-backed endpoints.
- Operates through a dedicated local `system` project/session/conversation.
- Should remain non-blocking for normal UI and chat flows.

## Important Invariants

- Agent data should use `storage_mode: 'local'`.
- Preserve lifecycle semantics: initialize, start, pause, stop, tick.
- Avoid parallel global agent loops unless the architecture is deliberately changed.
- Tool access must respect the app's permission/security model.
- Agent task writes from iframe apps must be permission-gated by `appPermissions.agent`.

## Gotchas

- If settings are seeded from bundled config into user data, runtime user-data copies may need refresh after changing defaults.
- The persistent agent shares concepts with subagents but is not the same execution path.
- Streams/messages should remain visible and recoverable through normal chat caches where applicable.

## Testing and Validation

- Build Electron target: `npm --prefix client/ygg-chat-r run build:electron`.
- Manually verify start/pause/resume/stop, app restart recovery, task enqueue, and local-only persistence.
- If endpoints change, add/adjust local server or headless tests where possible.

## Related Docs

- `agent_chat_pipeline.md`
- `agent_chat_streaming_state.md`
- `agent_html_iframe_apps.md`
- `PERSISTENT_AGENT_CONTEXT.md`
