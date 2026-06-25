# Agent Context: Design Patterns

Last reviewed: 2026-06-22

## Purpose

Shared UI design patterns for agents editing `ygg-chat`. Use this file when changing reusable button, control, overlay, modal, or chrome styling so new UI matches the project visual language.

## Minimal Glass UI Direction

The current preferred direction is minimalist glass that is also theme-aware: rounded surfaces, translucent fills, blur, clear typography, restrained motion, and color values borrowed from the active custom theme when available. Avoid making UI feel outlined, beveled, or fake-3D.

### Core Rules

- Prefer borderless glass surfaces where possible.
- Use soft background contrast, opacity, blur, whitespace, and typography for hierarchy.
- Do not use broad drop shadows as a default styling tool.
- Do not add inset top highlights, bevel-style shadows, or `inset_0_1px_0` top-line effects.
- Avoid outlining every card, input, button, and container.
- Add borders only when the UI becomes unclear without them, such as selected state, destructive state, or tight hit-area separation.
- If a border is needed, keep it subtle and local. Do not create a full outlined-card aesthetic.
- Keep surfaces visually flat and calm rather than raised.
- Respect the custom theme system for any modal, pane, project/editor, settings-like panel, chat surface, input surface, badge, active toggle, or reusable control that can appear in themed app chrome.
- Prefer borrowing existing semantic theme tokens over adding new ones. If a component resembles an existing surface, reuse tokens such as `settingsPaneBodyBg`, `settingsCustomThemesCardBg`, `settingsCustomThemesInnerCardBg`, `conversationToolbarBg`, `authModalBackdrop`, `toolJobsPrimaryText`, `toolJobsMutedText`, `settingsCustomThemesButtonBg`, `composerToggleActiveBg`, and related text/border tokens.
- Add new theme tokens only when no existing semantic token fits. When adding tokens, update both frontend and Electron theme schemas in lockstep, plus the ThemeManager editor controls.

### Controls and Buttons

- Prefer fully circular controls for compact icon actions: `h-11 w-11 rounded-full`.
- Use Lucide icons for icon-sized actions instead of Boxicons or text-only glyphs.
- Keep icons visually consistent: usually `size={18}` and `strokeWidth={2.25}`.
- Provide `title` and `aria-label` for icon-only buttons.
- Use `aria-pressed` for toggles.
- Include focus-visible rings for keyboard accessibility. Accessibility focus rings are allowed even when visual outlines are avoided.
- Use pressed motion: return to baseline and scale down slightly.
- Hover motion may use a slight lift or scale, but avoid adding hover shadows.
- Prefer brighter background or opacity changes for hover/active states.

### Minimal Control Button Pattern

Use this as a starting point for compact circular buttons in the current minimal style:

```tsx
const controlButtonClass =
  'group/control relative flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-700 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:bg-white hover:text-stone-950 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:bg-yBlack-900/85 dark:text-stone-200 dark:hover:bg-neutral-900 dark:hover:text-white dark:focus-visible:ring-orange-400/70 dark:focus-visible:ring-offset-yBlack-900'
```

For non-destructive active/toggled states, prefer fill/color changes rather than borders or shadows:

```tsx
const controlButtonActiveClass =
  'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:bg-orange-500/15 dark:text-orange-100 dark:hover:bg-orange-500/25 dark:hover:text-orange-50'
```

### Control Cluster Container

Wrap related controls in a rounded translucent shell, but keep it flat:

```tsx
className='flex items-center gap-2 rounded-full bg-white/25 p-1.5 backdrop-blur-xl dark:bg-black/20'
```

For hover-revealed row action panels, keep the panel itself pill-shaped (`rounded-full`) so it visually supports circular icon controls. Avoid square or mildly rounded shells like `rounded-md` around circular buttons.

For hover-revealed controls, combine opacity with a small vertical slide:

```tsx
isHovering ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
```

### Cards, Inputs, and Modals

- Prefer background tone changes over outlines: `bg-white/50`, `dark:bg-black/15`, `backdrop-blur-xl`.
- Avoid `shadow-*`, arbitrary `shadow-[...]`, and inset highlight shadows unless explicitly requested.
- Avoid `border-*` as the default card/input style. Use `border-transparent` only when a shared component requires a border reset.
- Keep modal chrome simple: translucent backdrop, rounded container, no heavy outline, no drop shadow.
- Sticky headers/footers should use background opacity and blur rather than dividing borders or shadows when possible.

### Custom Theme Integration

When a UI surface is part of the main app experience, make it theme-aware unless there is a strong reason not to.

- Use `useCustomChatTheme()` and `useHtmlDarkMode()` from `src/components/ThemeManager/themeConfig.ts`.
- Use `getThemeModeColor(pair, isDarkMode)` to resolve light/dark values.
- Apply theme values only when the custom theme is enabled; keep existing Tailwind classes as the disabled-theme fallback.
- Prefer small inline `style` objects for theme-derived colors. Keep layout, spacing, radius, motion, and accessibility classes in Tailwind.
- If a shared component wraps a native input/control and blocks color application, add a narrow `style?: React.CSSProperties` passthrough rather than duplicating the component.
- Theme surfaces broadly, not just one accent: modal backdrop, modal body, sticky header/footer chrome, section cards, nested panels, primary/muted text, badges, inputs/textareas, icon controls, and selected/toggled states should all be considered.
- Active/toggled states should usually borrow `composerToggleActive*` tokens. General pill or secondary actions can borrow `settingsCustomThemesButton*`. Primary apply/save actions can borrow `settingsCustomThemesPrimaryButton*` when using native buttons; if a shared `Button` does not support inline style, keep its default variant rather than widening the Button API unnecessarily.
- Do not hard-code theme-specific colors into new classes when a custom theme token already exists.

### Exceptions

- Focus-visible rings are required for keyboard accessibility.
- A subtle border can be used for selected/destructive/error states if fill alone is not enough.
- Special visual modes, such as heatmaps, may use gradients when the gradient directly communicates the mode.
- Existing component-specific theme overrides should be preserved unless the task explicitly asks to redesign them.

## Implementation Notes

- Keep design tokens inline only when the pattern is local to a component. Extract to a shared helper only after multiple components need the exact same style.
- Do not replace existing text labels with icons if the action is ambiguous or appears in a menu/list context.
- Prefer semantic buttons with `type='button'` unless the button intentionally submits a form.
- Preserve custom theme hooks and component-specific theme overrides where they already exist.
- For newly redesigned or newly touched chrome/modal/editor components, check whether custom theme hooks should be added before finishing the change.
- If older source examples still contain heavy borders or shadows, treat this document as the newer design direction for new or redesigned UI.
