# Agent Context: Design Patterns

Last reviewed: 2026-06-17

## Purpose

Shared UI design patterns for agents editing `ygg-chat`. Use this file when changing reusable button, control, overlay, or chrome styling so new UI matches the project visual language.

## Circular Glass Control Buttons

The Heimdall graph controls define the current compact control-button pattern for this project.

Reference implementation:
- `client/ygg-chat-r/src/components/Heimdall/Heimdall.tsx`: `heimdallControlButtonClass`, `heimdallControlButtonActiveClass`, and the bottom-left Heimdall controls.

### Visual Rules

- Prefer fully circular controls for compact action clusters: `h-11 w-11 rounded-full`.
- Use Lucide icons for action buttons instead of Boxicons or text labels when the action is icon-sized.
- Keep icons visually consistent: `size={18}` and `strokeWidth={2.25}` worked well in Heimdall.
- Wrap related controls in a rounded pill/glass container with subtle border, translucent background, blur, and shadow.
- Use strong but restrained hover motion: slight lift, slight scale-up, brighter border/background.
- Use pressed motion: return to baseline and scale down slightly.
- Include focus-visible rings for keyboard accessibility.
- Provide `title` and `aria-label` for icon-only buttons.
- Use `aria-pressed` for toggles.

### Base Button Style

Use this as the starting Tailwind class pattern for compact circular buttons:

```tsx
const controlButtonClass =
  'group/control relative flex h-11 w-11 items-center justify-center rounded-full border border-stone-200/80 bg-white/85 text-stone-700 shadow-[0_18px_42px_-24px_rgba(15,23,42,0.65),0_4px_14px_-10px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:border-stone-300 hover:bg-white hover:text-stone-950 hover:shadow-[0_22px_46px_-22px_rgba(15,23,42,0.7)] active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:border-white/10 dark:bg-yBlack-900/85 dark:text-stone-200 dark:shadow-[0_20px_52px_-24px_rgba(0,0,0,0.9)] dark:hover:border-white/20 dark:hover:bg-neutral-900 dark:hover:text-white dark:focus-visible:ring-orange-400/70 dark:focus-visible:ring-offset-yBlack-900'
```

### Active Toggle Style

For non-destructive toggles, layer this on top of the base button style:

```tsx
const controlButtonActiveClass =
  'border-blue-300 bg-blue-50 text-blue-700 shadow-[0_18px_42px_-22px_rgba(37,99,235,0.55)] hover:border-blue-300 hover:bg-blue-100 hover:text-blue-800 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100 dark:shadow-[0_20px_52px_-24px_rgba(249,115,22,0.65)] dark:hover:border-orange-300/60 dark:hover:bg-orange-500/25 dark:hover:text-orange-50'
```

For special visual modes such as heatmaps, an active gradient is acceptable when it directly communicates the mode:

```tsx
'border-transparent bg-gradient-to-br from-sky-500 via-emerald-500 to-orange-500 text-white shadow-[0_18px_44px_-20px_rgba(249,115,22,0.75)] hover:border-transparent hover:text-white dark:border-transparent dark:bg-gradient-to-br dark:from-sky-500 dark:via-emerald-500 dark:to-orange-500 dark:text-white'
```

### Control Cluster Container

Use a rounded, translucent shell around related controls:

```tsx
className={`flex items-center gap-2 rounded-full border border-stone-200/70 bg-white/30 p-1.5 shadow-[0_24px_56px_-30px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-all duration-200 dark:border-white/10 dark:bg-black/20`}
```

For hover-revealed controls, combine opacity with a small vertical slide:

```tsx
isHovering ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
```

## Implementation Notes

- Keep design tokens inline only when this pattern is local to a component. Extract to a shared helper only after multiple components need the exact same style.
- Do not replace existing text labels with icons if the action is ambiguous or appears in a menu/list context.
- Prefer semantic buttons with `type='button'` unless the button intentionally submits a form.
- Preserve custom theme hooks and component-specific theme overrides where they already exist.
