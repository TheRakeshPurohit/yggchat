import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { MoreHorizontal } from 'lucide-react'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getThemeModeColor, useCustomChatTheme, useHtmlDarkMode } from '../ThemeManager/themeConfig'

interface ActionPopoverProps {
  children: React.ReactNode
  isActive?: boolean
  footer?: React.ReactNode
}

interface PopoverPosition {
  top: number
  left: number
  measured: boolean // Whether we've measured the popover dimensions
}

const springTransition = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 44,
  mass: 0.86,
}

const internalTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 40,
  mass: 0.8,
}

const softTransition = { duration: 0.18, ease: 'easeOut' as const }
const collapseSoftTransition = { duration: 0.24, ease: 'easeInOut' as const }

const getPopoverTransformOrigin = (popoverTop: number, button: HTMLButtonElement | null): string => {
  if (!button || typeof window === 'undefined') return 'bottom center'
  return popoverTop < button.getBoundingClientRect().top ? 'bottom center' : 'top center'
}

const actionRowClass =
  'flex flex-wrap items-center justify-center gap-2 rounded-full bg-white/35 p-1.5 backdrop-blur-xl dark:bg-black/20 [&_button]:min-h-10 [&_button]:rounded-full [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-sm [&_button]:transition-all [&_button]:duration-200 [&_button:hover]:-translate-y-0.5 [&_button:active]:translate-y-0 [&_button:active]:scale-95'

const footerClass =
  'mt-2 min-w-[280px] rounded-[1.75rem] bg-white/45 p-3 text-stone-700 backdrop-blur-xl dark:bg-black/20 dark:text-stone-200 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:tracking-tight [&_input]:rounded-full [&_input]:border-transparent [&_input]:bg-white/70 [&_input]:backdrop-blur-xl [&_input]:transition [&_input]:focus:ring-2 [&_input]:focus:ring-blue-400/30 dark:[&_input]:bg-yBlack-900/70 dark:[&_input]:focus:ring-orange-400/25 [&_label]:font-medium [&_button]:rounded-full [&_button]:transition-all [&_button:hover]:-translate-y-0.5 [&_button:active]:translate-y-0 [&_button:active]:scale-95'

export const ActionPopover: React.FC<ActionPopoverProps> = ({ children, isActive = false, footer }) => {
  const [open, setOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const prefersReducedMotion = shouldReduceMotion ?? false
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)
  const { theme: customTheme, enabled: customThemeEnabled } = useCustomChatTheme()
  const isDarkMode = useHtmlDarkMode()
  const popoverSurfaceStyle: React.CSSProperties | undefined = customThemeEnabled
    ? {
        backgroundColor: getThemeModeColor(customTheme.colors.settingsCustomThemesCardBg, isDarkMode),
        color: getThemeModeColor(customTheme.colors.toolJobsPrimaryText, isDarkMode),
      }
    : undefined
  const actionRowStyle: React.CSSProperties | undefined = customThemeEnabled
    ? {
        backgroundColor: getThemeModeColor(customTheme.colors.settingsCustomThemesInnerCardBg, isDarkMode),
      }
    : undefined
  const footerStyle: React.CSSProperties | undefined = customThemeEnabled
    ? {
        backgroundColor: getThemeModeColor(customTheme.colors.settingsCustomThemesListBg, isDarkMode),
        color: getThemeModeColor(customTheme.colors.toolJobsPrimaryText, isDarkMode),
      }
    : undefined
  const triggerStyle: React.CSSProperties | undefined = customThemeEnabled
    ? isActive || open
      ? {
          backgroundColor: getThemeModeColor(customTheme.colors.composerToggleActiveBg, isDarkMode),
          color: getThemeModeColor(customTheme.colors.composerToggleActiveText, isDarkMode),
        }
      : {
          backgroundColor: getThemeModeColor(customTheme.colors.settingsCustomThemesButtonBg, isDarkMode),
          color: getThemeModeColor(customTheme.colors.settingsCustomThemesButtonText, isDarkMode),
        }
    : undefined

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('[data-ygg-overlay="select-dropdown"]')) return
      setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Reset position when opening (start with unmeasured state)
  useEffect(() => {
    if (open) {
      const btn = btnRef.current
      if (!btn || typeof window === 'undefined') return
      const rect = btn.getBoundingClientRect()

      // Initial position (will be corrected after measurement)
      setPopoverPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        measured: false,
      })
    }
  }, [open])

  // Use layoutEffect to measure and reposition synchronously before paint
  useLayoutEffect(() => {
    if (!open || !popoverPosition || popoverPosition.measured) return

    const popover = popoverRef.current
    const btn = btnRef.current
    if (!popover || !btn || typeof window === 'undefined') return

    const btnRect = btn.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 8 // Minimum distance from viewport edges

    // Calculate ideal position (centered above button)
    let top = btnRect.top - 8 - popoverRect.height
    let left = btnRect.left + btnRect.width / 2 - popoverRect.width / 2

    // Adjust horizontal position to stay within viewport
    if (left < padding) {
      left = padding
    } else if (left + popoverRect.width > viewportWidth - padding) {
      left = viewportWidth - padding - popoverRect.width
    }

    // Adjust vertical position if not enough space above
    if (top < padding) {
      // Position below the button instead
      top = btnRect.bottom + 8
    }

    // If still overflows bottom, clamp to viewport
    if (top + popoverRect.height > viewportHeight - padding) {
      top = viewportHeight - padding - popoverRect.height
    }

    setPopoverPosition({
      top,
      left,
      measured: true,
    })
  }, [open, popoverPosition])

  // Handle resize and scroll while open
  useEffect(() => {
    if (!open || !popoverPosition?.measured) return

    const recompute = () => {
      const popover = popoverRef.current
      const btn = btnRef.current
      if (!popover || !btn || typeof window === 'undefined') return

      const btnRect = btn.getBoundingClientRect()
      const popoverRect = popover.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const padding = 8

      let top = btnRect.top - 8 - popoverRect.height
      let left = btnRect.left + btnRect.width / 2 - popoverRect.width / 2

      if (left < padding) {
        left = padding
      } else if (left + popoverRect.width > viewportWidth - padding) {
        left = viewportWidth - padding - popoverRect.width
      }

      if (top < padding) {
        top = btnRect.bottom + 8
      }

      if (top + popoverRect.height > viewportHeight - padding) {
        top = viewportHeight - padding - popoverRect.height
      }

      setPopoverPosition({
        top,
        left,
        measured: true,
      })
    }

    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [open, popoverPosition?.measured])

  const handleToggle = useCallback(() => {
    setOpen(o => !o)
  }, [])

  return (
    <div className='relative'>
      <button
        ref={btnRef}
        type='button'
        onClick={handleToggle}
        className={`group/action-popover relative flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-stone-700 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:bg-white hover:text-stone-950 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:bg-yBlack-900/80 dark:text-stone-200 dark:hover:bg-neutral-900 dark:hover:text-white dark:focus-visible:ring-orange-400/70 dark:focus-visible:ring-offset-yBlack-900 ${
          isActive || open
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:bg-orange-500/15 dark:text-orange-100 dark:hover:bg-orange-500/25 dark:hover:text-orange-50'
            : ''
        }`}
        style={triggerStyle}
        title='Toggle options'
        aria-label='Toggle chat options'
        aria-haspopup='true'
        aria-expanded={open}
        aria-pressed={open}
      >
        <MoreHorizontal
          size={18}
          strokeWidth={2.25}
          className='transition-transform duration-200 group-hover/action-popover:scale-110'
          aria-hidden='true'
        />
      </button>

      {popoverPosition &&
        createPortal(
          <>
            {open && !popoverPosition.measured && (
              <div
                ref={popoverRef}
                key='action-popover-measure'
                className='fixed z-[1000] overflow-visible rounded-[2rem] bg-white/70 p-2 backdrop-blur-2xl dark:bg-yBlack-900/70'
                style={{
                  top: `${popoverPosition.top}px`,
                  left: `${popoverPosition.left}px`,
                  ...popoverSurfaceStyle,
                  visibility: 'hidden',
                }}
              >
                <div className={actionRowClass} style={actionRowStyle}>
                  {children}
                </div>
                {footer && (
                  <div className={footerClass} style={footerStyle}>
                    {footer}
                  </div>
                )}
              </div>
            )}

            <AnimatePresence initial={false} mode='popLayout' onExitComplete={() => setPopoverPosition(null)}>
              {open && popoverPosition.measured && (
                <motion.div
                  ref={popoverRef}
                  key='action-popover-shell'
                  layout
                  className='fixed z-[1000] overflow-visible rounded-[2rem] bg-white/70 p-2 backdrop-blur-2xl will-change-[transform,opacity] dark:bg-yBlack-900/70'
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                  transition={prefersReducedMotion ? collapseSoftTransition : springTransition}
                  style={{
                    top: `${popoverPosition.top}px`,
                    left: `${popoverPosition.left}px`,
                    ...popoverSurfaceStyle,
                    transformOrigin: getPopoverTransformOrigin(popoverPosition.top, btnRef.current),
                  }}
                >
                  <motion.div
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    transition={prefersReducedMotion ? softTransition : internalTransition}
                  >
                    <div className={actionRowClass} style={actionRowStyle}>
                      {children}
                    </div>
                    {footer && (
                      <div className={footerClass} style={footerStyle}>
                        {footer}
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>,
          document.body
        )}
    </div>
  )
}
