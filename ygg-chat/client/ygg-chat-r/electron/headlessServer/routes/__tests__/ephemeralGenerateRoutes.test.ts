import express from 'express'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderTokenStore } from '../../providers/tokenStore.js'
import { registerEphemeralGenerateRoutes } from '../ephemeralGenerateRoutes.js'

describe('registerEphemeralGenerateRoutes', () => {
  let appServer: Server
  let baseUrl = ''
  let tokenStore: ProviderTokenStore
  let previousXdgConfigHome: string | undefined
  let tempConfigDir = ''

  beforeEach(async () => {
    previousXdgConfigHome = process.env.XDG_CONFIG_HOME
    tempConfigDir = await mkdtemp(join(tmpdir(), 'ygg-ephemeral-routes-'))
    process.env.XDG_CONFIG_HOME = tempConfigDir
    delete process.env.OPENAI_CHATGPT_ACCESS_TOKEN
    delete process.env.OPENAI_ACCESS_TOKEN
    delete process.env.OPENAI_CHATGPT_ACCOUNT_ID
    delete process.env.YGG_APP_ACCESS_TOKEN
    delete process.env.YGG_ACCESS_TOKEN
    delete process.env.SUPABASE_ACCESS_TOKEN
    tokenStore = new ProviderTokenStore()
    const app = express()
    app.use(express.json())
    registerEphemeralGenerateRoutes(app, {
      tokenStore,
    })

    appServer = app.listen(0)
    const address = appServer.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    delete process.env.OPENAI_CHATGPT_ACCESS_TOKEN
    delete process.env.OPENAI_ACCESS_TOKEN
    delete process.env.OPENAI_CHATGPT_ACCOUNT_ID
    delete process.env.YGG_APP_ACCESS_TOKEN
    delete process.env.YGG_ACCESS_TOKEN
    delete process.env.SUPABASE_ACCESS_TOKEN
    if (previousXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = previousXdgConfigHome
    if (tempConfigDir) await rm(tempConfigDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    await new Promise<void>((resolve, reject) => {
      appServer.close(error => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  it('direct provider responses endpoint fails fast without auth', async () => {
    const res = await fetch(`${baseUrl}/api/headless/provider/openai/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello', modelName: 'gpt-5.1-codex-mini', history: [] }),
    })

    expect(res.status).toBe(500)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('OpenAI ChatGPT auth missing')
  })

  it('ephemeral chat alias defaults to openai and fails fast without auth', async () => {
    const res = await fetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello', modelName: 'gpt-5.1-codex-mini', history: [] }),
    })

    expect(res.status).toBe(500)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('OpenAI ChatGPT auth missing')
  })

  it('ephemeral chat normalizes ChatGPT display labels before calling the backend', async () => {
    process.env.OPENAI_CHATGPT_ACCESS_TOKEN = 'header.eyJodHRwczovL2FwaS5vcGVuYWkuY29tL2F1dGgiOnsiY2hhdGdwdF9hY2NvdW50X2lkIjoiYWNjdC1yb3V0ZSJ9fQ.sig'
    const nativeFetch = globalThis.fetch.bind(globalThis)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body || '{}'))
      expect(body.model).toBe('gpt-5.4-mini')
      return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }) as any
    })

    const res = await nativeFetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hello', modelName: 'GPT-5.4 Mini', history: [] }),
    })

    expect(res.status).toBe(200)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(true)
    expect(payload.provider).toBe('openaichatgpt')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ephemeral chat routes explicit openrouter requests through openrouter handling', async () => {
    const res = await fetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        content: 'hello',
        modelName: 'openai/gpt-4o-mini',
        history: [],
      }),
    })

    expect(res.status).toBe(500)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('Graviton app auth token missing')
  })

  it('ephemeral chat infers openrouter from non-openai prefixed model names', async () => {
    const res = await fetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: 'hello',
        modelName: 'anthropic/claude-3.5-sonnet',
        history: [],
      }),
    })

    expect(res.status).toBe(500)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('Graviton app auth token missing')
  })

  it('ephemeral openrouter requests can use preloaded token store auth without passing userId', async () => {
    tokenStore.upsert({
      provider: 'openrouter',
      userId: 'u-openrouter',
      accessToken: 'app-token',
    })

    const nativeFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: {"text":"hi"}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }) as any
    )

    const res = await nativeFetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openrouter',
        content: 'hello',
        modelName: 'anthropic/claude-3.5-sonnet',
        history: [],
      }),
    })

    expect(res.status).toBe(200)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(true)
    expect(payload.provider).toBe('openrouter')
    expect(payload.message?.content).toBe('hi')
  })

  it('ephemeral chat routes explicit bedrock requests through local bedrock handling', async () => {
    const res = await fetch(`${baseUrl}/api/headless/ephemeral/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'bedrock',
        content: 'hello',
        modelName: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        history: [],
      }),
    })

    expect(res.status).toBe(500)
    const payload = (await res.json()) as any
    expect(payload.success).toBe(false)
    expect(payload.error).toContain('AWS Bedrock credentials missing')
  })
})
