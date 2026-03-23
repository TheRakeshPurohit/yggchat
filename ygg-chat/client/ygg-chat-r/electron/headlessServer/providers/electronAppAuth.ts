import Conf from 'conf'
import type { ProviderTokenStore } from './tokenStore.js'

export type StoredElectronAuthSession = {
  userId?: string | null
  accessToken?: string | null
  user?: { id?: string | null } | null
  session?: {
    access_token?: string | null
    user?: { id?: string | null } | null
  } | null
}

export function normalizeAuthorizationToken(token: string | null | undefined): string {
  return String(token || '').replace(/^Bearer\s+/i, '').trim()
}

export function readElectronAppAuthSession(): { userId: string | null; accessToken: string | null } {
  try {
    const store = new Conf({
      projectName: 'ygg-chat-r',
      configFileMode: 0o600,
    })

    const authSession = (store.get('auth_session') ?? null) as StoredElectronAuthSession | null
    const userId = String(authSession?.userId || authSession?.user?.id || authSession?.session?.user?.id || '').trim() || null
    const accessToken = normalizeAuthorizationToken(authSession?.accessToken || authSession?.session?.access_token)

    if (!userId || !accessToken || accessToken === 'electron-local-token') {
      return { userId: null, accessToken: null }
    }

    return { userId, accessToken }
  } catch {
    return { userId: null, accessToken: null }
  }
}

export function syncOpenRouterTokenFromElectronSession(tokenStore: ProviderTokenStore): void {
  const { userId, accessToken } = readElectronAppAuthSession()
  if (!userId || !accessToken) return

  tokenStore.upsert({
    provider: 'openrouter',
    userId,
    accessToken,
    refreshToken: null,
    expiresAt: null,
    accountId: null,
  })
}
