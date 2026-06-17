import React, { useEffect, useRef } from 'react'
import { uiActions } from '../../features/ui'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'

const AUTO_DISMISS_MS = 8000

export const GlobalNotifications: React.FC = () => {
  const dispatch = useAppDispatch()
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

  return null
}

export default GlobalNotifications
