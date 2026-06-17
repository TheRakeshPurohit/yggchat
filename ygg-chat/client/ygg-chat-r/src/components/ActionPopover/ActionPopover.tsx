import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button/button'
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

export const ActionPopover: React.FC<ActionPopoverProps> = ({ children, isActive = false, footer }) => {
  const [open, setOpen] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const prefersReducedMotion = shouldReduceMotion ?? false
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)
  const { theme: customTheme, enabled: customThemeEnabled } = useCustomChatTheme()
  const isDarkMode = useHtmlDarkMode()
  const actionPopoverBorderColor = customThemeEnabled
    ? getThemeModeColor(customTheme.colors.actionPopoverBorder, isDarkMode)
    : isDarkMode
      ? 'rgba(194, 65, 12, 0.4)'
      : '#dbeafe'
  const activeButtonBorderColor = customThemeEnabled
    ? actionPopoverBorderColor
    : isDarkMode
      ? 'rgba(194, 65, 12, 0.5)'
      : '#93c5fd'

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (popoverRef.current?.contains(t)) return
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
      <Button
        ref={btnRef}
        variant='outline2'
        size='large'
        onClick={handleToggle}
        className={isActive ? ' ' : ' '}
        // style={isActive ? {  } : undefined}
        title='Toggle options'
        aria-haspopup='true'
        aria-expanded={open}
      >
        <i
          className='bx bx-dots-horizontal-rounded text-[20px]'
          style={{ color: activeButtonBorderColor }}
          aria-hidden='true'
        />
      </Button>

      {popoverPosition &&
        createPortal(
          <>
            {open && !popoverPosition.measured && (
              <div
                ref={popoverRef}
                key='action-popover-measure'
                className='fixed z-[1000] rounded-2xl border-2 bg-white/90 p-1 shadow-xl backdrop-blur-md dark:bg-neutral-900/60'
                style={{
                  top: `${popoverPosition.top}px`,
                  left: `${popoverPosition.left}px`,
                  borderColor: actionPopoverBorderColor,
                  visibility: 'hidden',
                }}
              >
                <div className='flex items-center gap-1 px-1 py-0.5'>{children}</div>
                {footer && <div className='px-2 pb-2'>{footer}</div>}
              </div>
            )}

            <AnimatePresence initial={false} mode='popLayout' onExitComplete={() => setPopoverPosition(null)}>
              {open && popoverPosition.measured && (
                <motion.div
                  ref={popoverRef}
                  key='action-popover-shell'
                  layout
                  className='fixed z-[1000] overflow-visible rounded-2xl border-2 bg-white/90 p-1 shadow-xl backdrop-blur-md will-change-[transform,opacity] dark:bg-neutral-900/60'
                  initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.965 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.965 }}
                  transition={prefersReducedMotion ? collapseSoftTransition : springTransition}
                  style={{
                    top: `${popoverPosition.top}px`,
                    left: `${popoverPosition.left}px`,
                    borderColor: actionPopoverBorderColor,
                    transformOrigin: getPopoverTransformOrigin(popoverPosition.top, btnRef.current),
                  }}
                >
                  <motion.div
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    transition={prefersReducedMotion ? softTransition : internalTransition}
                  >
                    <div className='flex items-center gap-1 px-1 py-0.5'>{children}</div>
                    {footer && <div className='px-2 pb-2'>{footer}</div>}
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
