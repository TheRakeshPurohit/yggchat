# Chat streaming via Redux: current state

This note describes the **implemented** multi-stream Redux model in `ygg-chat-r`.

It is no longer accurate to think of chat streaming as a single global boolean. The app now tracks:
- multiple concurrent streams,
- stream-to-conversation ownership,
- branch/message lineage,
- branch-aware stream selection in the chat UI,
- and a small legacy compatibility layer for older UI paths.

---

## Main idea

Streaming lives under `state.chat.streaming`.

The current model is:
- `streaming.byId[streamId]` stores full per-stream state
- `streaming.activeIds` stores all active stream IDs
- `streaming.primaryStreamId` tracks the current primary stream
- `streaming.lastCompletedId` tracks bookkeeping for the most recently finished stream
- each stream stores both `conversationId` and `lineage`

This matters because the app can now have more than one active stream at a time, and the UI must decide which one belongs to the **currently viewed conversation/branch**.

A legacy compatibility path still exists:
- `state.chat.composition.sending`
- legacy selectors like `selectSendingState`

But the main rendering path in `Chat.tsx` now uses **branch-aware stream selection**, not just a global "anything is streaming" flag.

---

## Redux state shape

Defined in:
- `src/features/chats/chatTypes.ts`
- initialized in `src/features/chats/chatSlice.ts`

Important structure:

```ts
state.chat.streaming = {
  activeIds: string[],
  byId: Record<string, StreamState>,
  primaryStreamId: string | null,
  lastCompletedId: string | null,
}
```

Each `StreamState` contains:
- `active`
- `buffer`
- `thinkingBuffer`
- `toolCalls`
- `events`
- `messageId`
- `streamingMessageId`
- `error`
- `finished`
- `conversationId`
- `lineage`
- `createdAt`
- `streamType` (`primary | subagent | tool | branch`)

`lineage` can include:
- `parentStreamId`
- `rootMessageId`
- `originMessageId`
- `branchId`

Two fields are especially important now:
- `conversationId`: prevents cross-conversation bleed
- `lineage.rootMessageId`: associates a stream with the branch root / parent message it belongs to

---

## Stream creation and IDs

Helpers live in `src/features/chats/streamHelpers.ts`.

### Stream types
- `primary`
- `branch`
- `subagent`
- `tool`

### ID generation
`generateStreamId(...)` creates typed IDs:
- primary: UUID
- branch: `branch:{shortUuid}`
- subagent: `{parentStreamId}:sub:{shortUuid}` or `sub:{uuid}`
- tool: `tool:{toolCallId}:{shortUuid}` or `tool:{uuid}`

`inferStreamTypeFromId(...)` can recover the stream type from the ID shape.

This is used by shared send flows so a branch send can still be treated as a branch stream even when it shares common transport/orchestration logic.

---

## How streams start

`chatActions.ts` dispatches `chatSliceActions.sendingStarted(...)` when a send flow begins.

Implemented examples include:
- `sendMessage(...)` → usually `streamType: 'primary'`
- `editMessageWithBranching(...)` → `streamType: 'branch'`
- Hermes/Claude Code style sends also start streams and attach `conversationId`

Typical payloads now include `conversationId` and often `lineage`.

Primary send example:

```ts
chatSliceActions.sendingStarted({
  streamId,
  streamType: 'primary',
  conversationId,
  lineage: {
    rootMessageId: parent,
  },
})
```

Branch send example:

```ts
chatSliceActions.sendingStarted({
  streamId,
  streamType: 'branch',
  conversationId,
  lineage: {
    rootMessageId: parentId,
  },
})
```

Reducer behavior in `chatSlice.ts`:
- creates `streaming.byId[streamId]`
- fills it from `createEmptyStreamState(...)`
- marks the stream `active: true`
- stores `conversationId`
- pushes `streamId` into `streaming.activeIds`
- if the stream is `primary`, sets `streaming.primaryStreamId = streamId`
- for primary streams, keeps legacy `composition.sending = true`
- for primary/branch sends, clears `composition.imageDrafts`

---

## How lineage is updated after the real user branch node exists

One important implementation detail is that some flows do **not** know the final branch anchor at stream start.

After the real user message is created/received, `chatActions.ts` can dispatch:

```ts
chatSliceActions.streamLineageUpdated({
  streamId,
  targetParentId: userMessage.id,
})
```

Reducer behavior:
- updates `stream.lineage.rootMessageId = targetParentId`

This is important for branch-aware selection because the stream may start with an approximate lineage, then be rebound to the actual branch node once the created user message is known.

---

## How stream updates arrive

`chatSliceActions.streamChunkReceived(...)` updates a specific stream.

The reducer supports both:
- legacy chunk payloads
- new `{ streamId, chunk }` payloads

Behavior by chunk type:

### `reset`
Clears:
- `buffer`
- `thinkingBuffer`
- `toolCalls`
- `events`
- `error`
- `messageId`
- `streamingMessageId`

### `generation_started`
Sets:
- `streamingMessageId`

Also resets the live streaming buffers/events for the new generation turn.

### `chunk` with `part: 'text'`
- appends to `buffer`
- appends a `text` entry to `events`

### `chunk` with `part: 'reasoning'`
- appends to `thinkingBuffer`
- appends a `reasoning` entry to `events`

### `chunk` with `part: 'tool_call'`
- upserts into `toolCalls`
- upserts a `tool_call` event in `events`

### `chunk` with `part: 'tool_result'`
- appends a deduplicated `tool_result` event to `events`

### `chunk` with `part: 'image'`
- appends a deduplicated `image` event to `events`

### top-level `tool_call`
Still supported as a legacy path and normalized into `toolCalls` + `events`.

### `complete`
- sets `stream.messageId`
- intentionally does **not** shut the stream down yet

### `error`
- sets `stream.error`
- marks stream inactive
- clears `streamingMessageId`
- removes the stream from `activeIds`
- clears `primaryStreamId` if needed

The key implementation detail is still:
- a `complete` chunk is not the same thing as final stream teardown
- multi-turn/tool-driven flows may continue after intermediate completion markers

---

## How streams stop

A send flow eventually dispatches:
- `streamCompleted({ streamId, messageId, updatePath })`
- `sendingCompleted({ streamId })`
- `streamPruned({ streamId })` later for cleanup

### `streamCompleted(...)`
Reducer behavior:
- marks the stream inactive
- marks it finished
- stores `messageId`
- removes the stream from `activeIds`
- stores `lastCompletedId`
- optionally updates `conversation.currentPath`
- clears `primaryStreamId` if needed
- for primary streams, clears legacy `composition.sending`

### Path update behavior in `streamCompleted(...)`
This is more careful than the earlier doc implied.

If `updatePath` is true, the reducer only updates `conversation.currentPath` when:
- the current path is empty, or
- the completed message is on the current branch

Then it rebuilds the path to the completed message from the current conversation messages.

That prevents unrelated streams from blindly hijacking the visible branch.

### `sendingCompleted(...)`
Reducer behavior:
- marks the stream inactive
- marks it finished
- clears `streamingMessageId`
- removes it from `activeIds`
- clears `primaryStreamId` if needed
- for primary streams, clears legacy `composition.sending`
- also clears image drafts for primary streams

### `streamPruned(...)`
Reducer behavior:
- deletes `streaming.byId[streamId]`
- removes the ID from `activeIds` as a safety cleanup
- clears `lastCompletedId` if it points to that stream

This is purely lifecycle cleanup, not visible streaming state.

---

## Abort handling

`chatActions.ts` keeps controller maps for both top-level generation and subagents:
- `generationAbortControllersByStream`
- `subagentAbortControllersByStream`

Abort helpers can stop:
- one stream,
- one stream plus its subagent descendants,
- or all streams.

`abortGeneration(...)` eventually dispatches either:
- `streamingAborted({ streamId })`
- or `allStreamsAborted()`

### `streamingAborted(...)`
Reducer behavior:
- marks that stream inactive
- stores an abort error message
- clears `streamingMessageId`
- removes it from `activeIds`
- clears `primaryStreamId` if needed
- clears legacy `composition.sending` for primary streams

### `allStreamsAborted()`
Reducer behavior:
- marks all active streams inactive
- sets their error to `Generation aborted`
- clears all `streamingMessageId` values for active streams
- empties `activeIds`
- clears `primaryStreamId`
- clears legacy `composition.sending`

---

## Selectors: global vs branch-aware

Defined in `src/features/chats/chatSelectors.ts`.

### Global selectors
- `selectStreamingRoot`
- `selectActiveStreamIds`
- `selectIsAnyStreaming`
- `selectPrimaryStreamId`
- `selectPrimaryStreamState`
- per-stream selector factories like `makeSelectStreamBuffer(streamId)`

### Legacy compatibility selector
`selectSendingState` still returns:

```ts
{
  sending: chat.composition.sending,
  compacting: chat.composition.compacting,
  streaming: activeIds.length > 0,
  error: null,
}
```

So `selectSendingState.streaming` still means:
- **some stream is active somewhere**
- not necessarily that the currently viewed branch is streaming

That selector remains useful for coarse status, but it is no longer the main source of truth for branch-visible streaming UI.

---

## `selectCurrentViewStream`: the implemented branch-aware selector

`selectCurrentViewStream` is the key selector for the current UI.

Inputs:
- `streaming`
- `conversation.currentPath`
- `conversation.currentConversationId`

Behavior:

1. filters to **active streams in the current conversation**
2. if there are no active streams, returns `null`
3. if there is no selected path yet:
   - returns active `primaryStreamId` if valid for the conversation
   - otherwise returns the first active conversation-scoped stream
4. if a path exists:
   - ranks streams by how well they match the selected path
   - considers these candidate IDs:
     - `stream.streamingMessageId`
     - `stream.messageId`
     - `stream.lineage.rootMessageId`
     - `stream.lineage.originMessageId`
   - prefers matches near the **tail** of the selected path
   - strongly boosts exact tip matches
   - gives only a tiny bias to `primaryStreamId`
5. if no stream matches the selected branch closely enough, returns `null`

This is a major change from the stale description.

The selector is now:
- conversation-scoped,
- path-ranked,
- tail-biased,
- and explicitly able to return `null` when the current branch has no relevant stream.

It is **not** just:
1. root match
2. primary fallback
3. any active fallback

anymore.

---

## How `Chat.tsx` now consumes streaming state

In `src/containers/Chat.tsx` the relevant pattern is now:

```ts
const sendingState = useAppSelector(selectSendingState)
const currentViewStream = useAppSelector(selectCurrentViewStream)
const [pendingViewStreamId, setPendingViewStreamId] = useState<string | null>(null)
```

Then `Chat.tsx` derives:
- `pendingViewStream`
- `effectiveViewStream`
- `streamState`

### `effectiveViewStream`
`effectiveViewStream` does this:
- use `currentViewStream` if available
- otherwise, temporarily fall back to `pendingViewStreamId` if that stream is still active and belongs to the current conversation

This fallback exists because there can be a brief period where:
- a stream has started,
- but branch/path metadata has not fully stabilized yet,
- especially around top-level sends and branch creation.

Without this fallback, the UI can flicker back to idle before the stream becomes selectable by branch-aware logic.

### `streamState`
`Chat.tsx` derives a local compatibility object from `effectiveViewStream`:
- `active`
- `buffer`
- `thinkingBuffer`
- `toolCalls`
- `events`
- `messageId`
- `error`
- `finished`
- `streamingMessageId`

That local object is what most of the component uses.

---

## Send button / loader behavior: what changed

The stale version of this doc said the send button animation was driven by:

```ts
sendingState.compacting || sendingState.streaming || sendingState.sending
```

That is no longer the important behavior.

In the implemented `Chat.tsx`, the loading animation is driven by:

```ts
const showGenerationLoadingAnimation =
  isCurrentConversationCompacting || streamState.active || hasRunningToolJobForCurrentBranch
```

This means the visible loader is now tied to:
- compaction for the **current conversation**,
- the **current/effective view stream**,
- or running tool jobs associated with the **current branch / current stream**.

So the core mismatch described in the stale note has largely been fixed in the main UI path:
- branch-aware stream selection drives visible streaming state
- the send button is no longer simply animated by any global active stream

---

## Branch-aware tool-job coupling in `Chat.tsx`

`Chat.tsx` also computes `hasRunningToolJobForCurrentBranch`.

That logic scopes jobs by:
- current conversation,
- current `streamState.id`, and/or
- whether a job’s `messageId` is on `selectedPath`

That means the loading state can remain visible for the current branch even when the stream is waiting on tool work, without showing unrelated jobs from another branch/conversation.

---

## Current branch switching behavior

Branch selection still updates:
- `conversation.currentPath`
- via actions like `conversationPathSet(...)` / `selectedNodePathSet(...)`

Switching branches does **not** kill streams. Streams continue to live in:
- `streaming.byId`
- `streaming.activeIds`

What changed is the selection/render model:
- the UI no longer assumes every active stream belongs to the current branch
- `selectCurrentViewStream` can return `null`
- `Chat.tsx` shows streaming state from the current/effective branch stream only

So the current system is:
- **streams remain global in storage**,
- but **visibility is branch-aware and conversation-aware**.

---

## Practical takeaway

The app currently has two layers:

1. **Global compatibility layer**
   - `composition.sending`
   - `selectSendingState.streaming = activeIds.length > 0`
   - useful for coarse status and older call sites

2. **Implemented multi-stream branch-aware layer**
   - `streaming.byId`
   - `conversationId`
   - `lineage.rootMessageId`
   - `lineage.originMessageId`
   - `streamingMessageId`
   - `selectCurrentViewStream`
   - `effectiveViewStream` fallback in `Chat.tsx`
   - branch-scoped job/loading logic

If you are updating chat UI or streaming behavior, treat the second layer as the real current architecture.

---

## Files most relevant for this implementation

- `src/features/chats/chatTypes.ts`
- `src/features/chats/streamHelpers.ts`
- `src/features/chats/chatSlice.ts`
- `src/features/chats/chatSelectors.ts`
- `src/features/chats/chatActions.ts`
- `src/containers/Chat.tsx`
