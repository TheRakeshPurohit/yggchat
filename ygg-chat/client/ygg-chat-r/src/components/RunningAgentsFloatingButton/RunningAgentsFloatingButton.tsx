import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uiActions, type UiNotification } from '../../features/ui'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { useRunningAgentStreams, type AgentStreamListItem } from '../../hooks/useRunningAgentStreams'
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

const collapseTransition = springTransition

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

const formatAgentTime = (value: string | null | undefined): string => {
  if (!value) return ''
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const getNotificationHref = (notification: UiNotification): string => {
  const projectSegment = notification.projectId != null ? String(notification.projectId) : 'unknown'
  return `/chat/${projectSegment}/${notification.conversationId}#${notification.messageId}`
}

const ParentMessageTicker = ({ text, reduceMotion }: { text: string | null | undefined; reduceMotion: boolean | null }) => {
  const trimmed = String(text || '').trim()
  if (!trimmed) return null

  const duration = Math.min(48, Math.max(18, trimmed.length / 4))

  if (reduceMotion) {
    return (
      <div className='mt-1 truncate rounded-full bg-white/70 px-2 py-1 text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:bg-neutral-950/30 dark:text-neutral-400'>
        {trimmed}
      </div>
    )
  }

  return (
    <div
      className='mt-1 overflow-hidden rounded-full bg-white/70 px-2 py-1 text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:bg-neutral-950/30 dark:text-neutral-400'
      style={{ maskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)' }}
      title={trimmed}
    >
      <motion.div
        className='flex w-max whitespace-nowrap'
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        <span className='pr-8'>{trimmed}</span>
        <span className='pr-8' aria-hidden='true'>
          {trimmed}
        </span>
      </motion.div>
    </div>
  )
}

export const RunningAgentsFloatingButton: React.FC<RunningAgentsFloatingButtonProps> = ({
  notes = [],
  className = '',
  onOpenApps,
  appsOpen = false,
}) => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const shouldReduceMotion = useReducedMotion()
  const { activeStreams, streamHistory } = useRunningAgentStreams(notes)
  const notifications = useAppSelector(state => state.ui.notifications)
  const [expanded, setExpanded] = useState(false)
  const [inlineNotification, setInlineNotification] = useState<UiNotification | null>(null)
  const seenNotificationIdsRef = useRef<Set<string>>(new Set())
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasActiveStreams = activeStreams.length > 0
  const hasErroredStream = activeStreams.some(stream => stream.hasError)
  const compactLabel = 'agents'
  const activeCountLabel = activeStreams.length > 1 ? `+${activeStreams.length - 1}` : null

  const statusTone = hasErroredStream
    ? 'bg-rose-500'
    : hasActiveStreams
      ? 'bg-emerald-500'
      : 'bg-neutral-400 dark:bg-neutral-500'

  const ariaLabel = useMemo(() => {
    if (inlineNotification) return inlineNotification.title
    if (activeStreams.length === 0) return 'Running agents: none active'
    return `Running agents: ${activeStreams.length} active`
  }, [activeStreams.length, inlineNotification])

  useEffect(() => {
    const activeIds = new Set(notifications.map(notification => notification.id))
    seenNotificationIdsRef.current.forEach(id => {
      if (!activeIds.has(id)) seenNotificationIdsRef.current.delete(id)
    })

    const nextNotification = notifications
      .filter(notification => !seenNotificationIdsRef.current.has(notification.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]

    if (!nextNotification) return

    seenNotificationIdsRef.current.add(nextNotification.id)
    setExpanded(false)
    setInlineNotification(nextNotification)

    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current)
    }

    notificationTimerRef.current = setTimeout(() => {
      setInlineNotification(current => (current?.id === nextNotification.id ? null : current))
      notificationTimerRef.current = null
    }, 4200)
  }, [notifications])

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current)
      }
    }
  }, [])

  const navigateToNotification = (notification: UiNotification) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current)
      notificationTimerRef.current = null
    }
    setInlineNotification(null)
    dispatch(uiActions.notificationDismissed(notification.id))
    navigate(getNotificationHref(notification))
  }

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
        className='overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white/90 text-neutral-800 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl will-change-[width,height,transform] dark:border-neutral-700/70 dark:bg-yBlack-900/90 dark:text-neutral-100'
      >
        <div className='relative'>
          <motion.div layout className='relative flex w-full items-center justify-between gap-1.5 p-1.5'>
            <AnimatePresence mode='popLayout' initial={false}>
              {inlineNotification ? (
                <motion.button
                  key={`notification-${inlineNotification.id}`}
                  type='button'
                  layout
                  onClick={() => navigateToNotification(inlineNotification)}
                  className='group flex min-h-11 max-w-[min(19rem,calc(100vw-6rem))] items-center gap-2 rounded-full px-3 py-2 text-left outline-none transition-colors hover:bg-neutral-100/75 focus-visible:ring-2 focus-visible:ring-emerald-400/70 dark:hover:bg-neutral-800/70'
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10, scale: 0.985 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 8, scale: 0.985 }}
                  transition={shouldReduceMotion ? softTransition : internalTransition}
                  aria-label={inlineNotification.title}
                >
                  <span className='relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'>
                    <i className='bx bx-check text-sm lg:text-base' aria-hidden='true' />
                  </span>
                  <span className='min-w-0'>
                    <span className='block truncate text-xs lg:text-sm font-semibold text-neutral-900 dark:text-neutral-100'>
                      {inlineNotification.title}
                    </span>
                    {inlineNotification.description ? (
                      <span className='block truncate text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:text-neutral-400'>
                        {inlineNotification.description}
                      </span>
                    ) : null}
                  </span>
                </motion.button>
              ) : (
                <motion.button
                  key='agent-compact'
                  type='button'
                  layout
                  onClick={() => setExpanded(value => !value)}
                  className='group flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-sm lg:text-base font-semibold outline-none transition-colors hover:bg-neutral-100/75 focus-visible:ring-2 focus-visible:ring-emerald-400/70 dark:hover:bg-neutral-800/70'
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.985 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.985 }}
                  transition={shouldReduceMotion ? softTransition : internalTransition}
                  aria-label={ariaLabel}
                  aria-expanded={expanded}
                >
                  <span className='relative flex h-3.5 w-3.5 items-center justify-center' aria-hidden='true'>
                    <motion.span
                      className={`relative h-2.5 w-2.5 rounded-full ${statusTone}`}
                      animate={
                        hasActiveStreams && !shouldReduceMotion
                          ? { scale: [1, 1.32, 1], opacity: [1, 0.55, 1] }
                          : { scale: 1, opacity: 1 }
                      }
                      transition={{ duration: 1.25, repeat: hasActiveStreams ? Infinity : 0, ease: 'easeInOut' }}
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
                        className='rounded-full bg-neutral-900/90 px-1.5 py-0.5 text-[10px] lg:text-[11px] font-bold leading-none text-white dark:bg-neutral-100 dark:text-neutral-900'
                      >
                        {activeCountLabel}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </motion.button>
              )}
            </AnimatePresence>

            <button
              type='button'
              onClick={event => {
                event.stopPropagation()
                onOpenApps()
              }}
              className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-200/70 bg-neutral-50/85 text-neutral-700 shadow-sm transition-colors duration-150 hover:bg-white hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 dark:border-neutral-700/70 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:bg-neutral-800'
              aria-label={appsOpen ? 'Close apps modal' : 'Open apps modal'}
              title={appsOpen ? 'Close apps' : 'Open apps'}
            >
              <motion.i
                key={appsOpen ? 'apps-close' : 'apps-expand'}
                className={`bx ${appsOpen ? 'bx-x' : 'bx-expand-alt'} text-lg`}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, rotate: -8 }}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
                transition={shouldReduceMotion ? softTransition : { duration: 0.14, ease: 'easeOut' }}
                aria-hidden='true'
              />
            </button>
          </motion.div>

          <AnimatePresence initial={false} mode='popLayout'>
            {expanded && (
              <motion.div
                key='details-shell'
                initial={shouldReduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0 }}
                animate={shouldReduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 1, height: 'auto' }}
                exit={shouldReduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0, transition: springTransition }}
                transition={shouldReduceMotion ? collapseSoftTransition : springTransition}
                className='w-[min(22rem,calc(100vw-2rem))] overflow-hidden border-t border-neutral-200/70 dark:border-neutral-800/80'
              >
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                  transition={shouldReduceMotion ? softTransition : { duration: 0.18, ease: 'easeOut' }}
                  className='px-2 pb-2 pt-1'
                >
                <div className='flex items-center justify-between px-2 py-2'>
                  <div className='flex items-center gap-2'>
                    <div className='text-[11px] lg:text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400'>
                      Running agents
                    </div>
                    <span className='flex items-center gap-1.5 rounded-full bg-neutral-100/80 px-2 py-0.5 text-[10px] lg:text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300'>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusTone}`} aria-hidden='true' />
                      {activeStreams.length}
                    </span>
                  </div>
                </div>

                {activeStreams.length === 0 ? (
                  <div className='rounded-2xl bg-neutral-50/80 px-3 py-3 text-xs lg:text-sm text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400'>
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
                                <span className='shrink-0 text-[11px] lg:text-xs font-bold text-emerald-600 dark:text-emerald-300'>
                                  {stream.displayName}
                                </span>
                                <span className='shrink-0 text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:text-neutral-400'>
                                  {formatAgentTime(stream.createdAt)}
                                </span>
                                <span className='truncate text-[12px] lg:text-sm font-semibold text-neutral-900 dark:text-neutral-100'>
                                  {stream.conversationTitle || `Conversation ${stream.conversationId || 'Unknown'}`}
                                </span>
                              </div>
                              <ParentMessageTicker text={stream.parentMessageText} reduceMotion={shouldReduceMotion} />
                              <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[11px] lg:text-xs'>
                                <span className='relative flex h-4 w-4 items-center justify-center' aria-label='Agent stream active'>
                                  <motion.span
                                    className='h-2.5 w-2.5 rounded-full bg-emerald-500'
                                    animate={shouldReduceMotion ? { scale: 1, opacity: 1 } : { scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
                                    transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
                                  />
                                </span>
                                {stream.hasError ? (
                                  <span className='rounded-full bg-rose-100 px-2 py-0.5 text-[10px] lg:text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'>
                                    error
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className='shrink-0 text-right'>
                              <i
                                className='bx bx-right-arrow-alt text-base text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-neutral-500'
                                aria-hidden='true'
                              />
                            </div>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                )}

                <div className='mt-3 border-t border-neutral-200/70 pt-3 dark:border-neutral-800/80'>
                  <div className='flex items-center justify-between px-2 pb-2'>
                    <div className='text-[11px] lg:text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400'>
                      History
                    </div>
                    {streamHistory.length > 0 ? (
                      <div className='text-[10px] lg:text-[11px] text-neutral-500 dark:text-neutral-400'>
                        last {streamHistory.length}
                      </div>
                    ) : null}
                  </div>

                  {streamHistory.length === 0 ? (
                    <div className='rounded-2xl bg-neutral-50/70 px-3 py-2.5 text-xs lg:text-sm text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400'>
                      Completed streams will appear here.
                    </div>
                  ) : (
                    <div className='max-h-56 space-y-1.5 overflow-y-auto pr-1 thin-scrollbar'>
                      {streamHistory.map(stream => {
                        const href = getStreamHref(stream)
                        return (
                          <motion.button
                            key={`history-${stream.streamId}`}
                            type='button'
                            layout
                            onClick={() => navigateToStream(stream)}
                            disabled={!href}
                            className='group w-full rounded-2xl bg-stone-50/70 px-3 py-2.5 text-left opacity-90 transition hover:bg-neutral-100/90 hover:opacity-100 disabled:cursor-default disabled:opacity-60 dark:bg-neutral-900/35 dark:hover:bg-neutral-800/65'
                            transition={shouldReduceMotion ? softTransition : internalTransition}
                            whileHover={shouldReduceMotion ? undefined : { scale: 1.004 }}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.996 }}
                          >
                            <div className='flex items-start justify-between gap-3'>
                              <div className='min-w-0 flex-1'>
                                <div className='flex min-w-0 items-center gap-2'>
                                  <span className='shrink-0 text-[11px] lg:text-xs font-bold text-neutral-500 dark:text-neutral-400'>
                                    {stream.displayName}
                                  </span>
                                  <span className='shrink-0 text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:text-neutral-400'>
                                    {formatAgentTime(stream.completedAt || stream.createdAt)}
                                  </span>
                                  <span className='truncate text-[12px] lg:text-sm font-semibold text-neutral-800 dark:text-neutral-100'>
                                    {stream.conversationTitle || `Conversation ${stream.conversationId || 'Unknown'}`}
                                  </span>
                                </div>
                                <ParentMessageTicker text={stream.parentMessageText} reduceMotion={shouldReduceMotion} />
                                <div className='mt-1 flex flex-wrap items-center gap-1.5 text-[11px] lg:text-xs'>
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${stream.hasError ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                    aria-label={stream.hasError ? 'Agent stream ended with error' : 'Agent stream completed'}
                                  />
                                  {stream.hasError ? (
                                    <span className='rounded-full bg-rose-100 px-2 py-0.5 text-[10px] lg:text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-200'>
                                      ended with error
                                    </span>
                                  ) : (
                                    <span className='rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] lg:text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'>
                                      completed
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  )}
                </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
