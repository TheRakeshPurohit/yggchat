# Agent Context: Runtime Modes

Last reviewed: 2026-06-16

## Purpose

Explains how the app behaves across web, Electron, local storage, and headless runtime modes.

## When to Open This File

Use this when changing:
- API routing or base URL selection;
- `storage_mode` behaviour;
- Electron-only features;
- local/headless server endpoints;
- code gated by `BUILD_TARGET` or runtime detection.

## Key Files

- `client/ygg-chat-r/src/config/runtimeMode.ts`: runtime/build target helpers.
- `client/ygg-chat-r/src/utils/api.ts`: cloud/local API clients and endpoint selection.
- `client/ygg-chat-r/src/lib/auth/*`: auth providers per runtime.
- `client/ygg-chat-r/src/lib/sync/*`: dual sync abstractions.
- `client/ygg-chat-r/electron/main.ts`: starts Electron shell and local server.
- `client/ygg-chat-r/electron/localServer.ts`: local API surface on Electron.
- `client/ygg-chat-r/electron/headlessServer/index.ts`: headless server composition.
- `shared/types.ts`: `StorageMode` and core entity contracts.

## Runtime Context

### Web Mode

- React app runs in browser/Vite/deployed web context.
- Cloud/Supabase/API behaviour depends on configured API base.
- Local Electron-only APIs are unavailable.

### Electron Mode

- Renderer runs the same React app.
- Electron main process owns window lifecycle and starts local Express server.
- Renderer can call local API endpoints and execute local tools through server routes.
- Native-sensitive code belongs in `electron/`, not browser components.

### Local Storage Mode

- Entities marked `storage_mode: 'local'` should remain local-only.
- Local persistence uses SQLite behind the Electron/local server.
- Persistent/global agent work should use local mode only.

### Headless Mode

- Headless APIs under `electron/headlessServer` expose server-side chat orchestration, providers, tool execution, and CRUD routes.
- Mobile LAN UI is served from the headless server and lives under `electron/headlessServer/ui/mobile`.

## Gotchas and Constraints

- Do not call Electron/local APIs from pure web flows without runtime checks.
- Do not sync `storage_mode: 'local'` data to cloud.
- Keep shared type changes backward-compatible across renderer, Electron, and headless server.
- `general_project_context.md` references a root `server/`; verify it exists before editing server paths.

## Testing and Validation

- Runtime helper/API changes: `npm --prefix client/ygg-chat-r run build:web` and/or `npm --prefix client/ygg-chat-r run build:electron`.
- Headless changes: `npm --prefix client/ygg-chat-r run test:headless`.
- Electron tool/server changes: `npm --prefix client/ygg-chat-r run test:tools` when relevant.

## Related Docs

- `agent_project_overview.md`
- `agent_electron_main_local_server.md`
- `agent_headless_server.md`
- `agent_global_persistent_agent.md`
