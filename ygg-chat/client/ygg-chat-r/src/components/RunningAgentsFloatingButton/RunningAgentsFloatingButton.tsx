import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAgentActivityBadgeClasses,
  useRunningAgentStreams,
  type AgentStreamListItem,
} from '../../hooks/useRunningAgentStreams'
import type { ResearchNoteItem } from '../../hooks/useQueries'

interface RunningAgentsFloatingButtonProps {
  notes?: ResearchNoteItem[]
  className?: string
  onOpenApps: () => void
  appsOpen?: boolean
}

const springTransition = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 44,
  mass: 0.86,
}

const collapseTransition = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 50,
  mass: 0.82,
}

const internalTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 40,
  mass: 0.8,
}

const softTransition = { duration: 0.18, ease: 'easeOut' as const }
const collapseSoftTransition = { duration: 0.24, ease: 'easeInOut' as const }

const getStreamHref = (stream: AgentStreamListItem): string | null => {
  if (!stream.conversationId) return null
  const projectSegment = stream.projectId ? String(stream.projectId) : 'unknown'
  const hash = stream.anchorMessageId ? `#${stream.anchorMessageId}` : ''
  return `/chat/${projectSegment}/${stream.conversationId}${hash}`
}

export const RunningAgentsFloatingButton: React.FC<RunningAgentsFloatingButtonProps> = ({
  notes = [],
  className = '',
  onOpenApps,
  appsOpen = false,
}) => {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { activeStreams } = useRunningAgentStreams(notes)
  const [expanded, setExpanded] = useState(false)
  const hasActiveStreams = activeStreams.length > 0
  const hasErroredStream = activeStreams.some(stream => stream.hasError)
  const primaryStream = activeStreams[0] ?? null
  const compactLabel = primaryStream?.displayName || 'agent-1'
  const activeCountLabel = activeStreams.length > 1 ? `+${activeStreams.length - 1}` : null

  const statusTone = hasErroredStream
    ? 'bg-rose-500 shadow-rose-500/40'
    : hasActiveStreams
      ? 'bg-emerald-500 shadow-emerald-500/40'
      : 'bg-neutral-400 shadow-neutral-400/20 dark:bg-neutral-500'

  const ariaLabel = useMemo(() => {
    if (activeStreams.length === 0) return 'Running agents: none active'
    return `Running agents: ${activeStreams.length} active`
  }, [activeStreams.length])

  const navigateToStream = (stream: AgentStreamListItem) => {
    const href = getStreamHref(stream)
    if (!href) return
    navigate(href)
    setExpanded(false)
  }

  return (
    <motion.div
      layout
      transition={shouldReduceMotion ? softTransition : expanded ? springTransition : collapseTransition}
      className={`fixed z-[1500] ${className}`}
      style={{ transformOrigin: 'bottom right' }}
    >
      <motion.div
        layout
        transition={shouldReduceMotion ? softTransition : expanded ? springTransition : collapseTransition}
        className={`overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white/90 text-neutral-800 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-neutral-700/70 dark:bg-yBlack-900/90 dark:text-neutral-100 ${
          hasActiveStreams ? 'ring-1 ring-emerald-400/25 dark:ring-emerald-300/20' : ''
        }`}
      >
        <div className='relative'>
          {hasActiveStreams && !shouldReduceMotion ? (
            <motion.div
              className='pointer-events-none absolute inset-0 rounded-[28px] bg-emerald-400/10'
              animate={{ opacity: [0.12, 0.28, 0.12] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden='true'
            />
          ) : null}

          <motion.div layout className='relative flex items-center gap-1.5 p-1.5'>
            <motion.button
              type='button'
              layout
              onClick={() => setExpanded(value => !value)}
              className='group flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold outline-none transition-colors hover:bg-neutral-100/75 focus-visible:ring-2 focus-visible:ring-emerald-400/70 dark:hover:bg-neutral-800/70'
              aria-label={ariaLabel}
              aria-expanded={expanded}
            >
              <span className='relative flex h-3.5 w-3.5 items-center justify-center' aria-hidden='true'>
                {hasActiveStreams && !shouldReduceMotion ? (
                  <motion.span
                    className={`absolute h-3.5 w-3.5 rounded-full ${statusTone}`}
                    animate={{ scale: [1, 1.8, 1], opacity: [0.35, 0, 0.35] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  />
                ) : null}
                <motion.span
                  className={`relative h-2.5 w-2.5 rounded-full shadow-lg ${statusTone}`}
                  animate={
                    hasActiveStreams && !shouldReduceMotion
                      ? { scale: [1, 1.22, 1], opacity: [1, 0.78, 1] }
                      : { scale: 1, opacity: 1 }
                  }
                  transition={{ duration: 1.5, repeat: hasActiveStreams ? Infinity : 0, ease: 'easeInOut' }}
                />
              </span>

              <motion.span layout className='whitespace-nowrap tracking-[-0.01em]'>
                {compactLabel}
              </motion.span>

              <AnimatePresence mode='popLayout' initial={false}>
                {activeCountLabel ? (
                  <motion.span
                    layout
                    key='count'
                    initial={{ opacity: 0, scale: 0.75, x: -4 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.75, x: -4 }}
                    transition={shouldReduceMotion ? softTransition : internalTransition}
                    className='rounded-full bg-neutral-900/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-neutral-100 dark:text-neutral-900'
                  >
                    {activeCountLabel}
                  </motion.span>
                ) : null}
              </AnimatePresence>

            </motion.button>

            <motion.button
              type='button'
              layout
              onClick={event => {
                event.stopPropagation()
                onOpenApps()
              }}
              className='flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200/70 bg-neutral-50/85 text-neutral-700 shadow-sm transition hover:scale-[1.03] hover:bg-white hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800'
              aria-label={appsOpen ? 'Close apps modal' : 'Open apps modal'}
              title={appsOpen ? 'Close apps' : 'Open apps'}
            >
              <i className={`bx ${appsOpen ? 'bx-x' : 'bx-expand-alt'} text-lg`} aria-hidden='true' />
            </motion.button>
          </motion.div>

          <AnimatePresence initial={false} mode='wait'>
            {expanded && (
              <motion.div
                key='details-shell'
                initial={shouldReduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0 }}
                animate={shouldReduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 1, height: 'auto' }}
                exit={shouldReduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0 }}
                transition={shouldReduceMotion ? collapseSoftTransition : collapseTransition}
                className='w-[min(22rem,calc(100vw-2rem))] overflow-hidden border-t border-neutral-200/70 dark:border-neutral-800/80'
              >
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.992 }}
                  transition={shouldReduceMotion ? softTransition : { duration: 0.18, ease: 'easeOut' }}
                  className='px-2 pb-2 pt-1'
                >
                <div className='flex items-center justify-between px-2 py-2'>
                  <div>
                    <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400'>
                      Running agents
                    </div>
                    <div className='mt-0.5 text-xs text-neutral-500 dark:text-neutral-400'>
                      {hasActiveStreams ? `${activeStreams.length} active stream${activeStreams.length === 1 ? '' : 's'}` : 'No active agents'}
                    </div>
                  </div>
                </div>

                {activeStreams.length === 0 ? (
                  <div className='rounded-2xl bg-neutral-50/80 px-3 py-3 text-xs text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400'>
                    Agents are idle. New running streams will appear here instantly.
                  </div>
                ) : (
                  <div className='max-h-72 space-y-1.5 overflow-y-auto pr-1 thin-scrollbar'>
                    {activeStreams.map(stream => {
                      const href = getStreamHref(stream)
                      return (
                        <motion.button
                          key={stream.streamId}
                          type='button'
                          layout
                          onClick={() => navigateToStream(stream)}
                          disabled={!href}
                          className='group w-full rounded-2xl bg-neutral-50/80 px-3 py-2.5 text-left transition hover:bg-neutral-100/90 disabled:cursor-default disabled:opacity-60 dark:bg-neutral-900/45 dark:hover:bg-neutral-800/70'
                          transition={shouldReduceMotion ? softTransition : internalTransition}
                          whileHover={shouldReduceMotion ? undefined : { scale: 1.004 }}
                          whileTap={shouldReduceMotion ? undefined : { scale: 0.996 }}
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0 flex-1'>
                              <div className='flex min-w-0 items-center gap-2'>
                                <span className='shrink-0 text-[11px] font-bold text-emerald-600 dark:text-emerald-300'>
                                  {stream.displayName}
                                </span>
                                <span className='truncate text-[12px] font-semibold text-neutral-900 dark:text-neutral-100'>
                                  {stream.conversationTitle || `Conversation ${stream.conversationId || 'Unknown'}`}
                                </span>
                              </div>
                              <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[11px]'>
                                <span className={getAgentActivityBadgeClasses(stream.activityKind)}>
                                  {stream.activityLabel}
                                </span>
                                {stream.hasError ? (
                                  <span className='rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'>
                                    error
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className='shrink-0 text-right'>
                              <div className='text-[10px] text-neutral-500 dark:text-neutral-400'>
                                {new Date(stream.createdAt).toLocaleTimeString()}
                              </div>
                              <i
                                className='bx bx-right-arrow-alt mt-2 text-base text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-neutral-500'
                                aria-hidden='true'
                              />
                            </div>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
