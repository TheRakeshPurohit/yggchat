# Custom Tools Guide

This is the **recommended modern custom app model**.

Build custom apps like a **normal web app**, not like an injected HTML blob.

Use this for all new tools.

---

# 1. Core idea

A custom tool has two parts:

1. **Headless runtime** in `index.js`
   - handles actions
   - reads/writes state
   - launches files/apps/URLs
   - returns JSON for tool calls

2. **UI app** under `ui/`
   - real `index.html`
   - real `main.js`
   - normal JS/TS modules
   - normal CSS/assets
   - loaded through a real iframe URL, not only `srcDoc`

---

# 2. Recommended structure

```txt
custom-tools/
└── my_tool/
    ├── definition.json
    ├── index.js
    ├── resources/
    │   └── state.json
    └── ui/
        ├── index.html
        ├── main.js
        ├── lib/
        │   ├── bridge.js
        │   └── api.js
        ├── components/
        │   └── ...
        └── styles/
            └── app.css
```

---

# 3. Rules

## Tool runtime
- `index.js` must use **CommonJS**
- use `require(...)`
- export with `module.exports`

## Tool name
- lowercase with underscores
- good: `my_tool`
- bad: `MyTool`

## Schema
- use `inputSchema`
- not `input_schema`

## Resources
Store mutable app data under `resources/`

Examples:
- `resources/state.json`
- `resources/cache/`
- `resources/output/`

---

# 4. definition.json

Use `ui.entry` for the app entrypoint.

```json
{
  "name": "my_tool",
  "description": "Normal web app style custom tool.",
  "ui": {
    "entry": "ui/index.html"
  },
  "appPermissions": {
    "agent": "read"
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "mode": {
        "type": "string",
        "enum": ["headless", "ui"],
        "default": "headless"
      },
      "action": {
        "type": "string",
        "enum": ["get_state", "save_state"]
      },
      "state": {
        "type": "object"
      }
    },
    "required": []
  }
}
```

## Notes
- `ui.entry` is the recommended standard for new apps
- old tools may still use `ui.html` at the root
- `appPermissions.agent` is optional

---

# 5. index.js

The runtime handles headless actions.

```js
const fs = require('node:fs')
const path = require('node:path')

const TOOL_DIR = __dirname
const RESOURCES_DIR = path.join(TOOL_DIR, 'resources')
const STATE_PATH = path.join(RESOURCES_DIR, 'state.json')

function ensureResources() {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true })
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ count: 0 }, null, 2))
  }
}

function readState() {
  ensureResources()
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'))
}

function writeState(state) {
  ensureResources()
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
  return state
}

module.exports = {
  execute: async function execute(args = {}) {
    if (args.mode === 'ui') {
      return {
        success: true,
        type: 'text/html',
        content: '<!doctype html><html><body>Use ui.entry route</body></html>',
      }
    }

    switch (args.action) {
      case 'get_state':
        return { success: true, state: readState() }
      case 'save_state':
        return { success: true, state: writeState(args.state || readState()) }
      default:
        return { success: false, error: 'Unknown action' }
    }
  },
}
```

## Why return placeholder HTML for `mode: 'ui'`?
Because the **recommended UI path is now `ui.entry`**, not injected HTML.
The host should serve the UI from `ui/index.html`.

---

# 6. ui/index.html

Use a real HTML entrypoint.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Tool</title>
    <link rel="stylesheet" href="./styles/app.css" />
  </head>
  <body>
    <div id="app"></div>

    <script>
      window.APP_CONFIG = {{CONFIG}}
    </script>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

## Important
Use:
```html
<script type="module" src="./main.js"></script>
```

This is the new normal pattern.

---

# 7. main.js

Use normal module imports.

```js
import { createBridge } from './lib/bridge.js'
import { loadState, saveState } from './lib/api.js'

const bridge = createBridge(window.APP_CONFIG || {})

async function boot() {
  const result = await loadState(bridge)
  console.log(result)
}

boot()
```

You can split code into as many files as you want.

Example:

```txt
ui/
  main.js
  lib/
    bridge.js
    api.js
  components/
    dock.js
    launcherGrid.js
    settingsModal.js
  styles/
    app.css
```

This is just a normal web app.

---

# 8. Bridge pattern

The iframe still talks to the host through `postMessage`.

Minimal bridge:

```js
export function createBridge(config) {
  let reqId = 0
  const pending = new Map()

  function send(type, options = {}) {
    return new Promise((resolve, reject) => {
      const id = `req_${++reqId}_${Date.now()}`
      pending.set(id, { resolve, reject })
      window.parent.postMessage({ type, requestId: id, options }, '*')
      setTimeout(() => {
        if (!pending.has(id)) return
        pending.delete(id)
        reject(new Error('Request timeout'))
      }, 60000)
    })
  }

  window.addEventListener('message', event => {
    const data = event.data || {}
    if (!data.requestId || !pending.has(data.requestId)) return
    pending.get(data.requestId).resolve(data)
    pending.delete(data.requestId)
  })

  return { config, send }
}
```

---

# 9. Calling your own tool from UI

Recommended UI-to-runtime flow:

```js
const res = await bridge.send('CUSTOM_TOOL_EXECUTE', {
  toolPath: bridge.config.toolDir,
  args: {
    mode: 'headless',
    action: 'get_state',
  },
})
```

A helper wrapper is nicer:

```js
export async function invokeTool(bridge, payload) {
  const res = await bridge.send('CUSTOM_TOOL_EXECUTE', {
    toolPath: bridge.config.toolDir,
    args: {
      mode: 'headless',
      ...payload,
    },
  })

  const candidates = [res, res?.result, res?.data, res?.response].filter(Boolean)
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      if (typeof candidate.content === 'string') {
        try {
          return JSON.parse(candidate.content)
        } catch {}
      }
      if ('success' in candidate || 'state' in candidate || 'error' in candidate) {
        return candidate
      }
    }
  }

  return res
}
```

---

# 10. Other supported bridge calls

You can still use the existing host IPC calls when needed.

Common ones:
- `CUSTOM_TOOL_EXECUTE`
- `CUSTOM_TOOL_CLEAR_CACHE`
- `FS_READ_FILE`
- `FS_WRITE_FILE`
- `FS_STAT`
- `DIALOG_OPEN_FILE`
- `DIALOG_SAVE_FILE`
- `HTTP_REQUEST`
- `REQUEST_GENERATION`
- `AGENT_CONTEXT`
- `AGENT_MESSAGES`
- `AGENT_ENQUEUE_TASK`

Use them exactly as before.

The big difference is just that your UI is now a **real app entrypoint**.

---

# 11. Remote/browser behavior

Custom apps may also run in remote/mobile/browser contexts.

That means:
- some desktop-oriented apps may not work fully
- native shell launching may fail remotely
- local-only capabilities may be unavailable

Recommended UX:
- show warning for desktop-ish apps
- allow user to proceed anyway

Do not assume:
- Explorer replacement
- taskbar control
- unrestricted local execution in browser mode

---

# 12. When to use legacy instead

Use the legacy model only if:
- the tool already returns HTML and works
- it is tiny
- you do not want to migrate it yet

Legacy patterns are documented in:
- **`CUSTOM_TOOLS_LEGACY_GUIDE.md`**

---

# 13. Recommended default for new apps

For new tools, use this stack:

- `definition.json` with `ui.entry`
- `index.js` for headless runtime
- `ui/index.html`
- `ui/main.js`
- normal JS modules
- normal CSS files
- `CUSTOM_TOOL_EXECUTE` for persistence/actions

This is the preferred mental model:

> Build a custom tool UI like a small normal web app.

---

# 14. Minimal example structure

```txt
normal_app_test/
  definition.json
  index.js
  resources/
    state.json
  ui/
    index.html
    main.js
    lib/
      bridge.js
      api.js
    styles/
      app.css
```

That is now the recommended baseline.
