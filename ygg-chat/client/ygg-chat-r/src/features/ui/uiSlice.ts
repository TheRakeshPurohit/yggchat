// uiSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { ConversationId, MessageId, ProjectId } from '../../../../../shared/types'

export type UiNotification = {
  id: string
  kind: 'branch_stream_completed'
  title: string
  description?: string
  conversationId: ConversationId
  projectId: ProjectId | null
  messageId: MessageId
  createdAt: string
}

export interface UiState {
  rightBarCollapsed: boolean
  notifications: UiNotification[]
}

const MAX_NOTIFICATIONS = 6

// Load initial state from localStorage
const getInitialCollapsed = (): boolean => {
  try {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('rightbar:collapsed')
    if (stored !== null) {
      return stored === 'true'
    }
    return true // Default collapsed
  } catch {
    return true
  }
}

const initialState: UiState = {
  rightBarCollapsed: getInitialCollapsed(),
  notifications: [],
}

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    rightBarCollapsedSet: (state, action: PayloadAction<boolean>) => {
      state.rightBarCollapsed = action.payload
      // Persist to localStorage
      try {
        localStorage.setItem('rightbar:collapsed', String(action.payload))
      } catch {}
    },
    rightBarToggled: state => {
      state.rightBarCollapsed = !state.rightBarCollapsed
      // Persist to localStorage
      try {
        localStorage.setItem('rightbar:collapsed', String(state.rightBarCollapsed))
      } catch {}
    },
    rightBarExpanded: state => {
      state.rightBarCollapsed = false
      // Persist to localStorage
      try {
        localStorage.setItem('rightbar:collapsed', 'false')
      } catch {}
    },
    notificationAdded: (state, action: PayloadAction<UiNotification>) => {
      const notification = action.payload
      const existingIndex = state.notifications.findIndex(item => item.id === notification.id)
      if (existingIndex >= 0) {
        state.notifications[existingIndex] = notification
      } else {
        state.notifications.unshift(notification)
      }

      if (state.notifications.length > MAX_NOTIFICATIONS) {
        state.notifications = state.notifications.slice(0, MAX_NOTIFICATIONS)
      }
    },
    notificationDismissed: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(item => item.id !== action.payload)
    },
    notificationsCleared: state => {
      state.notifications = []
    },
  },
})

export const uiActions = uiSlice.actions

export default uiSlice.reducer
