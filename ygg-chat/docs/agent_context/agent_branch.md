# Agent Context: Conversation Branching

Last reviewed: 2026-06-22

## Purpose

Explains how Ygg Chat represents branches inside a conversation. A conversation is not stored as one append-only linear transcript. It is stored as a per-conversation message tree where every message can point at a parent message and can have zero or more child messages. A branch is any selected root-to-leaf path through that tree.

## When to Open This File

Use this when changing:
- message parent/child fields or schema;
- branch creation, edit-branch, repeat/regenerate, or normal send continuation semantics;
- current visible branch selection in Redux;
- Heimdall node selection or branch highlighting;
- URL hash message focus and search-result navigation;
- local/headless `/messages/tree` endpoints or message-copy/delete behaviour.

## Key Files

- `shared/types.ts`: shared `BaseMessage` fields, including `parent_id` and `children_ids`.
- `client/ygg-chat-r/src/features/chats/chatTypes.ts`: frontend `Message` and `conversation.currentPath` state.
- `client/ygg-chat-r/src/features/chats/pathUtils.ts`: `buildBranchPathForMessage()` builds a branch path from a flat message list.
- `client/ygg-chat-r/src/features/chats/chatSlice.ts`: reducers that keep `currentPath`, parent `children_ids`, and branch navigation in sync.
- `client/ygg-chat-r/src/features/chats/chatSelectors.ts`: filters flat messages to the selected branch for display.
- `client/ygg-chat-r/src/features/chats/chatActions.ts`: normal send, edit-branch, streaming persistence, and branch-aware history construction.
- `client/ygg-chat-r/src/containers/Chat.tsx`: dispatches send/branch actions, auto-selects latest/hash branches, and coordinates focus.
- `client/ygg-chat-r/src/components/Heimdall/Heimdall.tsx`: visual tree selection and current path highlighting.
- `client/ygg-chat-r/electron/localServer.ts`: local SQLite schema, `children_ids` insert trigger, tree endpoint, and `buildMessageTree()`.
- `client/ygg-chat-r/electron/headlessServer/routes/appAutomationRoutes.ts`: headless app equivalents for message tree APIs.
- `client/ygg-chat-r/electron/headlessServer/services/branchOrchestrator.ts`: headless continuation semantics for `send`, `branch`, `edit-branch`, and `repeat`.
- `client/ygg-chat-r/electron/headlessServer/persistence/messageRepo.ts`: headless message creation and parent `children_ids` maintenance.

## Core Model

Every message belongs to exactly one conversation and has:

```ts
{
  id: MessageId
  conversation_id: ConversationId
  parent_id?: MessageId | null
  children_ids: MessageId[]
}
```

Meaning:
- `conversation_id` scopes the message tree. Branches never cross conversations.
- `parent_id: null` marks a top-level root message.
- `parent_id: <id>` makes the message a direct child of another message in the same conversation.
- `children_ids` is a denormalized ordered list of direct child IDs for fast tree construction and stable sibling order.

A normal single-path chat looks linear, but it is still a tree:

```text
u1 user      parent_id null    children_ids [a1]
  a1 assistant parent_id u1    children_ids [u2]
    u2 user    parent_id a1    children_ids [a2]
      a2 assistant parent_id u2 children_ids []
```

A branch is created when a parent has more than one child:

```text
u1 user
  a1 assistant  "old answer"
  a2 assistant  "regenerated answer"
```

or:

```text
u1 user
  a1 assistant
    u2 user "old follow-up"
    u3 user "edited follow-up"
```

The branch identity is not a separate database row or branch table. The branch is identified by the chain of message IDs selected through parent/child relationships.

## Branch Identity: `currentPath`

The active visible branch is stored in Redux as:

```ts
conversation.currentPath: MessageId[]
```

`currentPath` is the ordered root-to-leaf message ID path for the branch the user is currently viewing. For example:

```ts
['u1', 'a1', 'u3', 'a3']
```

means Chat should show only those messages from the flat conversation message list, in that order. `selectDisplayMessages()` maps each ID in `currentPath` back to its message and normally hides messages outside that path. If `currentPath` is empty, the selectors fall back to showing the conversation messages sorted by `created_at`.

Important distinction:
- The full conversation is the flat set/tree of all messages for one `conversation_id`.
- The visible transcript is one selected branch path through that tree.

## How Paths Are Built

`buildBranchPathForMessage(messages, messageId)` in `pathUtils.ts` is the shared path helper used by Chat and Heimdall.

It works in two phases:
1. Walk upward from `messageId` through `parent_id` until a root is reached, then reverse/unshift into root-to-target order.
2. From the target message, extend downward by repeatedly choosing the first child until a leaf is reached.

That second step matters for selecting an intermediate node. Clicking or focusing an ancestor should still resolve to a complete branch path, not just stop midway, so the visible transcript remains a complete conversation branch.

Some reducer-local helpers use the simpler root-to-message path when a newly persisted message is the known branch tip. The invariant is the same: a path is a valid ancestor chain inside one conversation.

## Creating Messages and Branches

### Normal send

For a normal user send, Chat dispatches send actions with a parent derived from the current branch tip. The persisted user message uses that parent:

```text
new user.parent_id = currentPath[currentPath.length - 1] ?? null
```

The assistant response is then persisted as a child of that user message:

```text
assistant.parent_id = new user.id
```

This extends the selected branch.

### Branch from a message

Branching means creating a new child under an existing message, or creating a sibling under an existing message's parent, depending on the operation.

In `Chat.tsx` regular branch/edit submission resolves:

```ts
const branchParentId =
  originalMessage.role === 'assistant' || originalMessage.role === 'ex_agent'
    ? originalMessage.id
    : (originalMessage.parent_id ?? null)
```

Then `editMessageWithBranching()` creates the new user message with `parent_id` based on the original message's parent for edit-branch semantics. In practice:
- editing/branching a user message creates a sibling user message under the original user's parent;
- branching from an assistant/ex-agent continuation can create a new user message under that assistant/ex-agent message;
- repeat/regenerate creates a new assistant sibling under the relevant user anchor.

### Headless semantics

`BranchOrchestrator` uses explicit operation names:
- `send`: create a user message under `request.parentId ?? null`, then assistant under that user.
- `branch`: create a user message under `request.messageId ?? request.parentId`.
- `edit-branch`: create a user sibling under `originalMessage.parent_id ?? null`.
- `repeat`: do not create a new user message; resolve the nearest user anchor and create a new assistant child/sibling from that user.

These operations all rely on `parent_id` to decide where new nodes attach.

## Maintaining `children_ids`

Whenever a message is inserted with a non-null `parent_id`, the parent must list that new child in `children_ids`.

Local SQLite has an insert trigger in `localServer.ts`:

```sql
CREATE TRIGGER IF NOT EXISTS messages_children_insert AFTER INSERT ON messages
WHEN NEW.parent_id IS NOT NULL
BEGIN
  UPDATE messages
  SET children_ids = ... append NEW.id ...
  WHERE id = NEW.parent_id;
END;
```

Headless routes/repos update the parent explicitly after insert. Frontend reducers also update the in-memory parent message in `messageBranchCreated` so the UI can navigate immediately before or while React Query refetches.

Rules:
- New messages start with `children_ids: []`.
- The parent's `children_ids` is append-only for normal insertion.
- Do not rely only on `children_ids`; `parent_id` remains the canonical ancestor pointer.
- When deleting or manually moving messages, remove stale child IDs from the old parent if the database path does not do it for you.

## Tree Fetching and Heimdall

Message fetch APIs return both:
- `messages`: normalized flat message rows;
- `tree`: a `ChatNode` tree for Heimdall.

Local `/api/local/conversations/:id/messages/tree`:
1. Loads all messages for the conversation.
2. Parses JSON fields such as `children_ids`, `tool_calls`, and `content_blocks`.
3. Builds a `ChatNode` tree using `children_ids`.
4. Wraps multiple root messages in a synthetic visual root with `id: 'root'`.

Heimdall renders the tree but uses the flat messages for robust selection. When a node is clicked, Heimdall calls `buildBranchPathForMessage(flatMessages, nodeId)`, then Chat stores that path in `conversation.currentPath` and focuses the clicked node.

The synthetic `root` is visual-only. Reducers such as `selectedNodePathSet` filter out `'root'`, `'empty'`, and empty IDs before storing a branch path.

## Display and Selection Behaviour

`selectDisplayMessages()` is the main branch-aware selector:
- if `currentPath` has IDs, it maps those IDs to messages and returns that selected chain;
- it can append hidden linear system descendants for display continuity;
- it usually filters out `ex_agent` messages unless persistent-agent display requires them;
- if no selected path resolves, it falls back to sorted unique displayable messages.

`Chat.tsx` initializes or changes `currentPath` in several places:
- URL hash focus: `#<messageId>` resolves to a full branch path once messages load.
- First load: if no selected path exists, the latest message by timestamp is resolved to a branch path and selected.
- Heimdall node click/search: selected node resolves to a branch path and focused message.
- Stream completion/branch creation reducers: can move `currentPath` to the newly created branch when the operation belongs to the current view.

## Storage Invariants

- Keep all messages in a branch under the same `conversation_id`.
- Use `parent_id: null`, not an empty string, for roots.
- Keep `children_ids` as JSON text in SQLite and arrays in normalized frontend state.
- Compare IDs defensively with `String(id)` when crossing local/cloud/legacy boundaries.
- Treat `children_ids` as sibling order for tree rendering, but use `parent_id` for ancestor walking.
- Multiple root messages are valid in one conversation; Heimdall handles them with a synthetic root.
- A branch is a path, not an independent object. Do not add branch-specific state unless it derives from message IDs or is deliberately new metadata.

## Common Change Recipes

### Add a new branch-style operation

1. Decide the anchor message and whether the new message should be a child or sibling.
2. Persist the new message with the correct `parent_id`.
3. Ensure the parent `children_ids` includes the new ID.
4. Update/invalidate message queries for the conversation.
5. Set `currentPath` to the new branch if the operation should navigate the user there.
6. Verify Heimdall receives a tree that includes the new child.

### Change branch selection

1. Update `buildBranchPathForMessage()` if the change is shared by Chat, Heimdall, URL hash focus, and search.
2. Update reducer helpers only if stream/new-message auto-navigation should change.
3. Check `selectDisplayMessages()` still returns messages in `currentPath` order.
4. Test hidden/tool/system message cases because Heimdall filtering is visual-only.

### Change persistence or schema

1. Update local SQLite schema and migration/backfill if required.
2. Update local/headless insert paths so parent/child maintenance remains consistent.
3. Update normalization to keep frontend `children_ids` arrays.
4. Re-check tree construction for multiple roots and stale child IDs.

## Testing and Validation

Useful targeted checks:
- `npm --prefix client/ygg-chat-r run build:web`
- `npm --prefix client/ygg-chat-r run build:electron`
- `npm --prefix client/ygg-chat-r run test:headless`

Manual checks:
- send a normal message and verify the branch extends linearly;
- edit a user message and verify a sibling branch appears;
- regenerate/repeat an assistant response and verify assistant siblings under the same user;
- click ancestor and leaf nodes in Heimdall and verify Chat shows the selected branch;
- open a `#messageId` URL and verify the correct branch and focus are selected;
- delete a branch and verify no stale child IDs remain visible;
- test local and headless/mobile tree endpoints if persistence changed.

## Related Docs

- `agent_message_storage_shape.md`
- `agent_chat_pipeline.md`
- `agent_chat_streaming_state.md`
- `agent_chat_container.md`
- `agent_heimdall.md`
- `agent_headless_server.md`
