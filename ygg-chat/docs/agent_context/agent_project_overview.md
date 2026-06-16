# Agent Context: Project Overview

Last reviewed: 2026-06-16

## Purpose

High-level orientation for `ygg-chat`, a full-stack AI chat and agent harness with a React UI, Electron desktop runtime, local Express/SQLite server, agentic tools, custom tools, MCP, hooks, and headless/mobile surfaces.

## When to Open This File

Open this first when:
- you are new to the repository;
- a task crosses frontend, Electron, tools, and persistence boundaries;
- you need to decide which subsystem context file to read next.

## Top-Level Layout

- `client/ygg-chat-r/`: main app workspace: React/Vite frontend plus Electron/backend/tooling code.
- `shared/`: cross-runtime shared contracts and tool/provider metadata.
- `docs/`: general docs and this `agent_context` directory.
- Root `*.md` context files: existing deep context docs for persistent agent, HTML iframe apps, themes, compaction, streams.
- `package.json`: root npm workspace wrapper and top-level scripts.

Note: `general_project_context.md` mentions a `server/` directory, but this checkout did not contain one during the initial scan. Treat cloud/server references as historical, external, or to be verified before relying on them.

## Runtime Map

- Web mode: React app calls cloud/API endpoints via `API_BASE` when configured.
- Electron mode: Electron main process starts local server, renderer calls local APIs and local tools.
- Local storage mode: `storage_mode: 'local'` entities remain in SQLite/local server and should not sync to cloud.
- Headless mode: local server exposes headless chat/provider/tool APIs and a mobile LAN UI.

## Key Files

- `general_project_context.md`: broad architecture map.
- `package.json`: root workspace and scripts.
- `client/ygg-chat-r/package.json`: app scripts, dependencies, test commands.
- `shared/types.ts`: shared domain contracts.
- `shared/builtinToolDefinitions.ts`: built-in tool schema contracts.
- `client/ygg-chat-r/src/App.tsx`: app shell and runtime bootstraps.
- `client/ygg-chat-r/src/main.tsx`: React/Redux/React Query bootstrap.
- `client/ygg-chat-r/electron/main.ts`: Electron process entry.
- `client/ygg-chat-r/electron/localServer.ts`: embedded local API server.

## Common Commands

From repository root:

```bash
npm run dev
npm run dev:electron
npm run build
npm run build:web
npm run build:electron
```

From `client/ygg-chat-r`:

```bash
npm run lint
npm run test:tools
npm run test:headless
npm run build:electron:main
```

## Agent Workflow

1. Read this overview and the most relevant subsystem doc.
2. Open key files listed by the subsystem doc before editing.
3. Preserve runtime boundaries: browser UI, Electron main, local server, shared contracts.
4. For local-only agent/tool work, verify Electron/local mode assumptions.
5. Run the narrowest validation command that covers the changed subsystem.

## Related Docs

- `general_project_context.md`
- `docs/agent_context/README.md`
- `docs/agent_context/agent_runtime_modes.md`
