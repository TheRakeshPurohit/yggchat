# Agent Context: Chat Streaming State

Last reviewed: 2026-06-16

## Purpose

Explains Redux multi-stream state, branch-aware stream selection, and how streaming events become visible in the chat UI.

## When to Open This File

Use this when changing:
- `streaming.activeIds`, `streaming.byId`, `primaryStreamId`, or `lastCompletedId`;
- stream reducers such as start/chunk/complete/abort;
- branch-aware loading state;
- visible stream selection in `Chat.tsx`.

## Key Files

- `client/ygg-chat-r/src/features/chats/chat-streaming-redux-context.md`: focused existing context doc.
- `client/ygg-chat-r/src/features/chats/chatSlice.ts`: stream state shape and reducers.
- `client/ygg-chat-r/src/features/chats/chatSelectors.ts`: current view/current branch stream selectors.
- `client/ygg-chat-r/src/features/chats/streamHelpers.ts`: stream utility functions.
- `client/ygg-chat-r/src/features/chats/streamResilience.ts`: stream resilience helpers.
- `client/ygg-chat-r/src/features/chats/streamRunTracking.ts`: best-effort renderer local API helper for durable SQLite stream run lifecycle rows.
- `client/ygg-chat-r/src/containers/Chat.tsx`: consumes stream selectors and pending fallback.
- `client/ygg-chat-r/electron/tools/streamUndoManager.ts`: durable per-stream file-edit undo manifests/backups.

## Mental Model

Streaming state is not a single global boolean. It is a container:

- `activeIds`: stream IDs currently active.
- `byId`: map from stream ID to stream state.
- `primaryStreamId`: main stream for current operation.
- `lastCompletedId`: last stream that reached completion.

Each stream has buffers/events/tool calls plus lineage metadata that lets the UI associate it with a conversation/branch.

In Electron/local mode, individual stream run lifecycle is also mirrored to SQLite table `streaming_runs` through local server routes under `/api/streaming/runs`. Redux remains the live rendering state and can be pruned; `streaming_runs.status`, `ended_at`, `end_reason`, and `duration_ms` are the durable record for when an individual agent stream ended.

## Important Invariants

- UI should render the stream relevant to the current branch/view, not any globally active stream.
- Branch and subagent streams must not clobber the primary stream state accidentally.
- Stream events should be append-only enough for replay/rendering of text, reasoning, tool calls, and tool results.
- Abort/error paths must clear loading state without losing persisted messages that already completed.

## Gotchas

- Old code may still assume `DEFAULT_STREAM_ID`; preserve compatibility while preferring explicit stream IDs in new code.
- Pending stream fallbacks in `Chat.tsx` are deliberately short-lived to avoid flicker during message materialization.
- Tool-result events and persisted tool messages are related but not identical; update both paths deliberately.
- Stream Redux state is pruned; durable file-edit undo state lives under Electron app user-data `.ygg/backups/<stream>/`, keyed by `streamId` and parent user message ID.
- Durable stream lifecycle rows are best-effort in local/Electron mode; failures to write `streaming_runs` should not interrupt generation.

## Testing and Validation

- Build relevant target: `npm --prefix client/ygg-chat-r run build:web`.
- Manually verify: normal stream, branch stream, subagent/tool stream, cancellation, and post-completion display.

## Related Docs

- `agent_chat_pipeline.md`
- `agent_global_persistent_agent.md`
