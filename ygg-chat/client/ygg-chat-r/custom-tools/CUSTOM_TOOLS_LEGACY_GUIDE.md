# Legacy Custom Tools Guide

This guide documents the **old custom app model** based on:
- returning HTML from `index.js`
- loading app UI via `iframe.srcDoc`
- optional runtime HTML/CSS/JS injection
- root-level `ui.html`

Use this only for:
- tiny demos
- quick prototypes
- maintaining older tools that already work this way

For all new custom apps, use **`CUSTOM_TOOLS_GUIDE.md`** instead.

---

## Legacy architecture

```txt
custom-tools/
└── my_tool/
    ├── definition.json
    ├── index.js
    ├── ui.html
    └── resources/
```

## Key legacy rules

- `index.js` is still **CommonJS** (`require` / `module.exports`)
- `name` must be lowercase with underscores
- use `inputSchema`, not `input_schema`
- store mutable data under `resources/`

---

## Legacy definition example

```json
{
  "name": "my_tool",
  "description": "Legacy custom tool with inline HTML UI.",
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
        "enum": ["list", "add", "clear"]
      }
    },
    "required": []
  }
}
```

---

## Legacy UI flow

Typical pattern:
1. `index.js` reads `ui.html`
2. injects `{{CONFIG}}`
3. returns `{ type: 'text/html', content: html }`
4. host renders it with `iframe.srcDoc`

Example:

```js
module.exports = {
  execute: async function execute(args = {}) {
    if (args.mode === 'ui') {
      let html = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf-8')
      html = html.replace('{{CONFIG}}', JSON.stringify({ toolDir: __dirname }))
      return { type: 'text/html', content: html }
    }

    return {
      type: 'application/json',
      content: JSON.stringify({ success: true }),
    }
  },
}
```

---

## Legacy componentized no-build pattern

This older guide also supported a file-injection pattern like:

```txt
ui.html
ui/
  manifest.json
  components/
    header/
    controls/
    shell/
```

where `ui.html` would:
- use `FS_READ_FILE`
- load HTML/CSS/JS as text
- inject those files at runtime

This still works, but is now considered **legacy** because it is harder to:
- reason about
- debug
- type-check
- scale like a normal web app

---

## Legacy IPC example

```js
function send(type, options = {}) {
  return new Promise((resolve, reject) => {
    const id = `r${Date.now()}`
    window.parent.postMessage({ type, requestId: id, options }, '*')
  })
}
```

Common legacy calls:
- `CUSTOM_TOOL_EXECUTE`
- `FS_READ_FILE`
- `FS_WRITE_FILE`
- `DIALOG_OPEN_FILE`
- `REQUEST_GENERATION`

---

## When to keep using this

Keep the legacy model only when:
- the tool already exists and works
- it is very small
- migrating it is not worth it yet

For new apps, prefer:
- `ui/index.html`
- `ui/main.js`
- normal module imports
- URL-backed iframe loading

See **`CUSTOM_TOOLS_GUIDE.md`**.
