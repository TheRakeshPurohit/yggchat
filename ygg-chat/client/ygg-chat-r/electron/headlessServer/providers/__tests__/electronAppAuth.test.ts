import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProviderTokenStore } from '../tokenStore.js'

const { mockConfGet } = vi.hoisted(() => ({
  mockConfGet: vi.fn(),
}))

vi.mock('conf', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: mockConfGet,
  })),
}))

import { readElectronAppAuthSession, syncOpenRouterTokenFromElectronSession } from '../electronAppAuth.js'

describe('electronAppAuth', () => {
  beforeEach(() => {
    mockConfGet.mockReset()
    mockConfGet.mockReturnValue(null)
  })

  it('reads the current auth_session from Electron storage', () => {
    mockConfGet.mockReturnValue({
      session: {
        access_token: 'Bearer latest-app-token',
        user: { id: 'user-123' },
      },
    })

    expect(readElectronAppAuthSession()).toEqual({
      userId: 'user-123',
      accessToken: 'latest-app-token',
    })
  })

  it('syncs the latest Electron auth session into the openrouter token store', () => {
    const tokenStore = new ProviderTokenStore()
    mockConfGet.mockReturnValue({
      userId: 'user-123',
      accessToken: 'fresh-token',
    })

    syncOpenRouterTokenFromElectronSession(tokenStore)

    expect(tokenStore.get('openrouter', 'user-123')).toMatchObject({
      provider: 'openrouter',
      userId: 'user-123',
      accessToken: 'fresh-token',
    })
  })

  it('ignores placeholder local tokens', () => {
    const tokenStore = new ProviderTokenStore()
    mockConfGet.mockReturnValue({
      userId: 'user-123',
      accessToken: 'electron-local-token',
    })

    syncOpenRouterTokenFromElectronSession(tokenStore)

    expect(tokenStore.get('openrouter', 'user-123')).toBeNull()
  })
})
