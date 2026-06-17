# Agent Context Index

Last reviewed: 2026-06-16

This directory contains subsystem-specific context files for agents working in `ygg-chat`.

Start here, then open the smallest relevant subsystem context file before editing code. These docs are intentionally operational: they point to entry files, runtime constraints, data flow, invariants, and validation commands.

## Core

- `agent_project_overview.md` - repository layout, workspace scripts, runtime map, and how to use the context set.
- `agent_runtime_modes.md` - web, local, Electron, and headless runtime behaviour.

## Chat

- `agent_chat_pipeline.md` - normal send/edit/branch generation flow, providers, tools, and persistence.
- `agent_chat_streaming_state.md` - Redux multi-stream state, branch-aware selectors, streaming invariants.
- `agent_chat_container.md` - `Chat.tsx` main screen orchestration, message rendering, composer, routing, and Heimdall integration.
- `agent_heimdall.md` - Heimdall conversation tree rendering, node selection, notes, search, subagent badges, and selected-node actions.
- `agent_message_storage_shape.md` - per-conversation message schema, `parent_id`/`children_ids` tree shape, normalization, and write/read invariants.

## Tools

- `agent_tool_registry.md` - built-in, custom, and MCP tool definitions visible to model/runtime.
- `agent_local_tools_runtime.md` - Electron tool implementations, execution routes, utility host, and tests.
- `agent_custom_tools.md` - custom tool loading, definition format, RPC/UI tools, managed paths.

## Agent Runtime

- `agent_global_persistent_agent.md` - persistent Electron/local background agent loop and task queue.
- `agent_headless_server.md` - headless local server API, server-side chat orchestration, mobile UI.

## Platform and Integration

- `agent_electron_main_local_server.md` - Electron main/preload/local Express server responsibilities.
- `agent_html_iframe_apps.md` - custom app iframe rendering, bridge permissions, HTML cache.
- `agent_hooks_system.md` - Ygg hook lifecycle, hook runner, sync/async execution, model feedback.
- `agent_floating_agent_button_design.md` - floating agent/app button animation, shell layout, inline stream-completion notifications, and reusable compact-to-expanded design pattern.

## Design

- `agent_design.md` - shared UI design patterns, including the circular Lucide glass control-button style used by Heimdall.

## Coverage Notes

This MVP set deliberately covers the highest-risk agent-editing surfaces first. The compaction and memory surface is covered by:

- `agent_context_compaction_memory.md`

Potential future context topics that do not yet have dedicated files in this checkout include branching conversations, projects/conversations/messages, providers/models, auth/provider tokens, MCP, subagents orchestration, local storage sync, frontend app shell, settings/preferences, theme UI, IDE/LSP context, and workspace mutations.

## Maintenance Rules

- Keep these docs concise and file-oriented.
- Prefer links to source files over copied implementation details.
- Update a subsystem doc in the same PR/change when moving its core files or changing its invariants.
- If an agent doc conflicts with source code, source code wins and the doc should be corrected.
