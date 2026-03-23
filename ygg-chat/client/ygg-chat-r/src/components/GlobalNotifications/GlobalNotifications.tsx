import React, { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uiActions } from '../../features/ui'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'

const AUTO_DISMISS_MS = 8000

export const GlobalNotifications: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const notifications = useAppSelector(state => state.ui.notifications)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const activeIds = new Set(notifications.map(item => item.id))

    for (const notification of notifications) {
      if (timersRef.current.has(notification.id)) continue

      const timeout = setTimeout(() => {
        dispatch(uiActions.notificationDismissed(notification.id))
      }, AUTO_DISMISS_MS)

      timersRef.current.set(notification.id, timeout)
    }

    for (const [id, timeout] of timersRef.current.entries()) {
      if (activeIds.has(id)) continue
      clearTimeout(timeout)
      timersRef.current.delete(id)
    }
  }, [dispatch, notifications])

  useEffect(() => {
    return () => {
      for (const timeout of timersRef.current.values()) {
        clearTimeout(timeout)
      }
      timersRef.current.clear()
    }
  }, [])

  if (!notifications.length) return null

  return (
    <div className='pointer-events-none fixed bottom-6 right-6 z-[1800] flex w-[min(92vw,360px)] flex-col gap-2'>
      {notifications.map(notification => {
        const projectSegment = notification.projectId != null ? String(notification.projectId) : 'unknown'
        const targetRoute = `/chat/${projectSegment}/${notification.conversationId}#${notification.messageId}`

        return (
          <button
            key={notification.id}
            type='button'
            onClick={() => {
              dispatch(uiActions.notificationDismissed(notification.id))
              navigate(targetRoute)
            }}
            className='pointer-events-auto w-full rounded-xl border border-black/10 bg-white/95 px-3 py-2 text-left shadow-xl backdrop-blur transition hover:scale-[1.01] hover:bg-white dark:border-white/10 dark:bg-yBlack-900/95 dark:hover:bg-yBlack-900'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate'>
                  {notification.title}
                </div>
                {notification.description && (
                  <div className='mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 line-clamp-2'>
                    {notification.description}
                  </div>
                )}
              </div>

              <span
                role='button'
                aria-label='Dismiss notification'
                onClick={event => {
                  event.stopPropagation()
                  dispatch(uiActions.notificationDismissed(notification.id))
                }}
                className='shrink-0 rounded-md p-1 text-neutral-500 hover:bg-black/5 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-200'
              >
                ✕
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default GlobalNotifications
