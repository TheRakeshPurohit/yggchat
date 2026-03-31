import { useQueryClient } from '@tanstack/react-query'
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProjectWithLatestConversation } from '../../../../shared/types'
import { chatSliceActions } from '../features/chats'
import { createConversation } from '../features/conversations'
import { createProject } from '../features/projects/projectActions'
import { setSelectedProject } from '../features/projects/projectSlice'
import { useAppDispatch } from '../hooks/redux'
import { useAuth } from '../hooks/useAuth'
import { useProjects, useRecentConversations } from '../hooks/useQueries'

const DEFAULT_PROJECT_NAME = 'Quick Chat'
const DEFAULT_CONVERSATION_TITLE = 'New Chat'

const HomepageRedirect: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { userId, accessToken, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const redirectInFlightRef = useRef(false)

  const {
    data: allProjects = [],
    isLoading: projectsLoading,
    isRefetching: projectsRefetching,
  } = useProjects()
  const {
    data: recentConversations = [],
    isLoading: conversationsLoading,
    isRefetching: conversationsRefetching,
  } = useRecentConversations(10)

  useEffect(() => {
    if (redirectInFlightRef.current) return
    if (authLoading) return
    if (!userId || !accessToken) return
    if (projectsLoading || projectsRefetching || conversationsLoading || conversationsRefetching) return

    redirectInFlightRef.current = true

    const redirectToChat = async () => {
      try {
        setError(null)

        const latestConversation = recentConversations.find(conversation => conversation.project_id)
        if (latestConversation?.id && latestConversation.project_id) {
          const matchingProject = allProjects.find(project => String(project.id) === String(latestConversation.project_id))
          if (matchingProject) {
            dispatch(setSelectedProject(matchingProject))
          }

          dispatch(chatSliceActions.conversationSet(latestConversation.id))
          navigate(`/chat/${latestConversation.project_id}/${latestConversation.id}`, {
            replace: true,
            state: latestConversation.storage_mode ? { storageMode: latestConversation.storage_mode } : undefined,
          })
          return
        }

        let targetProject: ProjectWithLatestConversation | null = allProjects[0] ?? null
        if (!targetProject) {
          const createdProject = await dispatch(
            createProject({
              name: DEFAULT_PROJECT_NAME,
            })
          ).unwrap()

          targetProject = createdProject as ProjectWithLatestConversation
          queryClient.invalidateQueries({ queryKey: ['projects', userId] })
        }

        dispatch(setSelectedProject(targetProject))

        const targetStorageMode = targetProject.storage_mode || 'cloud'
        const conversation = await dispatch(
          createConversation({
            title: DEFAULT_CONVERSATION_TITLE,
            projectId: String(targetProject.id),
            systemPrompt: null,
            conversationContext: null,
            storageMode: targetStorageMode,
          })
        ).unwrap()

        dispatch(chatSliceActions.conversationSet(conversation.id))

        queryClient.invalidateQueries({ queryKey: ['conversations'] })
        queryClient.invalidateQueries({ queryKey: ['conversations', 'recent'] })
        queryClient.invalidateQueries({ queryKey: ['conversations', 'project', targetProject.id] })

        navigate(`/chat/${targetProject.id}/${conversation.id}`, {
          replace: true,
          state: { storageMode: conversation.storage_mode || targetStorageMode },
        })
      } catch (bootstrapError) {
        console.error('[HomepageRedirect] Failed to bootstrap startup chat:', bootstrapError)
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'Failed to open chat')
        redirectInFlightRef.current = false
      }
    }

    void redirectToChat()
  }, [
    accessToken,
    allProjects,
    authLoading,
    conversationsLoading,
    conversationsRefetching,
    dispatch,
    navigate,
    projectsLoading,
    projectsRefetching,
    queryClient,
    recentConversations,
    userId,
  ])

  return (
    <div className='min-h-screen flex items-center justify-center px-6'>
      <div className='text-center space-y-3'>
        <div className='text-lg font-medium dark:text-neutral-100'>Opening your chat…</div>
        <div className='text-sm text-neutral-600 dark:text-neutral-400'>Preparing your default project and conversation.</div>
        {error ? <div className='text-sm text-red-500 dark:text-red-400'>{error}</div> : null}
      </div>
    </div>
  )
}

export default HomepageRedirect
