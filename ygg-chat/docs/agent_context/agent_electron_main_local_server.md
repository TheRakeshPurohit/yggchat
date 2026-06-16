# Agent Context: Electron Main and Local Server

Last reviewed: 2026-06-16

## Purpose

Documents Electron main/preload responsibilities and the embedded local Express server used by the desktop app.

## When to Open This File

Use this when changing:
- BrowserWindow lifecycle;
- preload APIs;
- app startup/shutdown;
- local API routes;
- local server registration for tools, hooks, MCP, skills, headless server;
- OAuth callbacks in local runtime.

## Key Files

- `client/ygg-chat-r/electron/main.ts`: Electron entry and window/server lifecycle.
- `client/ygg-chat-r/electron/preload.ts`: renderer preload bridge.
- `client/ygg-chat-r/electron/localServer.ts`: embedded Express server, local APIs, tools, agent endpoints.
- `client/ygg-chat-r/electron/localOperations.ts`: local storage/operation helpers.
- `client/ygg-chat-r/electron/localToolsRoutes.ts`: HTML tools route/table integration.
- `client/ygg-chat-r/electron/envLoader.ts`: environment loading.
- `client/ygg-chat-r/electron/proxyGateway.ts`: proxy/gateway support.
- `client/ygg-chat-r/electron/openaiChatgptOAuth.ts`: local OpenAI OAuth helpers.
- `client/ygg-chat-r/electron/headlessServer/index.ts`: mounted/extracted headless server pieces.

## Runtime Context

- Electron main process owns native capabilities.
- Renderer should access native/local features through preload/local API, not direct Node APIs.
- Local server commonly listens on `127.0.0.1:3002` in Electron local mode.

## Important Invariants

- Keep renderer/main boundaries explicit and secure.
- Do not expose broad native capabilities over preload without validation.
- Local server route changes can affect renderer, tools, mobile UI, and iframe apps.
- Startup/shutdown changes must clean up server, windows, and long-running processes.

## Extension Points

- New local APIs usually belong in extracted route modules where practical, not as huge inline blocks in `localServer.ts`.
- New native capabilities should be mediated by typed request/response shapes.
- New tool registrations should update shared definitions and tests.

## Testing and Validation

- Build Electron: `npm --prefix client/ygg-chat-r run build:electron`.
- Build main/preload bundle: `npm --prefix client/ygg-chat-r run build:electron:main`.
- Tool/local route changes: `npm --prefix client/ygg-chat-r run test:tools` or `test:headless` depending on touched area.

## Related Docs

- `agent_runtime_modes.md`
- `agent_local_tools_runtime.md`
- `agent_headless_server.md`
- `agent_hooks_system.md`
