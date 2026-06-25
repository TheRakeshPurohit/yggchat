import { LOCAL_AUTH_USER_ID } from '../../config/runtimeMode'
import { localApi } from '../../utils/api'
import type { OpenAITokens } from './openaiOAuth'

// Must stay in sync with electron/headlessServer/providers/electronAppAuth.ts.
// Headless bootstraps Electron ChatGPT OAuth tokens under this persistent user id.
export const ELECTRON_OPENAI_CHATGPT_SYNC_USER_ID = 'electron-openai-chatgpt'

const isElectronRenderer = () => import.meta.env.VITE_ENVIRONMENT === 'electron'

export const getOpenAIHeadlessTokenUserIds = (...candidateUserIds: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      [...candidateUserIds, LOCAL_AUTH_USER_ID, ELECTRON_OPENAI_CHATGPT_SYNC_USER_ID].filter(
        (candidate): candidate is string => Boolean(candidate)
      )
    )
  )

export async function persistOpenAIChatGPTTokensToHeadless(
  tokens: OpenAITokens,
  candidateUserIds: Array<string | null | undefined> = []
): Promise<void> {
  if (!isElectronRenderer()) return

  const headlessUserIds = getOpenAIHeadlessTokenUserIds(...candidateUserIds)
  await Promise.all(
    headlessUserIds.map(candidateUserId =>
      localApi.post('/provider-auth/openai/token', {
        userId: candidateUserId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        accountId: tokens.accountId,
      })
    )
  )
}

export async function clearOpenAIChatGPTTokensFromHeadless(
  candidateUserIds: Array<string | null | undefined> = []
): Promise<void> {
  if (!isElectronRenderer()) return

  const headlessUserIds = getOpenAIHeadlessTokenUserIds(...candidateUserIds)
  await Promise.all(
    headlessUserIds.map(candidateUserId =>
      localApi.delete(`/provider-auth/openai/token?userId=${encodeURIComponent(candidateUserId)}`)
    )
  )
}
