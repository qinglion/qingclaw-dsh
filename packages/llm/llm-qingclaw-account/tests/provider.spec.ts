/** QingClaw provider composition, catalog fallback, and short-token failure boundaries. */
import { Buffer } from 'node:buffer'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { BlockAssembler, LlmRuntime } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as QingClawAccount from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
})

function jwt(sequence: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1_000) + 900
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ exp })}.grant-${sequence}`
}

function grant(token: string): Response {
  const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { exp: number }
  return Response.json({
    code: 0,
    data: { biz_code: 0, biz_data: { token, token_type: 'Bearer', expires_in: 900, expires_at: payload.exp } },
  })
}

function keyGrant(sequence: number): Response {
  return Response.json({ code: 0, data: { biz_code: 0, biz_data: { api_key: `gateway-key-${sequence}` } } })
}

function successfulMessages(): Response {
  const events = [
    { type: 'message_start', message: { id: 'msg_qingclaw', model: 'qwen-plus', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'QingClaw ready' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function finishOf(ctx: Context) {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({
    provider: 'deepseek-account', model: 'qwen-plus', messages: [],
  })) assembler.push(chunk)
  return assembler.finish
}

async function mount(request: typeof fetch) {
  const refreshUsage = vi.fn(async (_token: string): Promise<void> => {})
  const rejectToken = vi.fn(async (_token: string): Promise<void> => {})
  const session: PlatformSession = {
    origin: 'https://beta.qingclaw.test',
    token: 'long-lived-device-session',
    userId: null,
    requestHeaders: { cookie: 'deployment=beta' },
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(request)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'rejectToken' | 'refreshUsage'> = {
    getPlatformSession: async (): Promise<PlatformSession> => session,
    rejectToken, refreshUsage,
  }
  ctx.provide('deepseekAccount', account as DeepSeekAccount)
  await ctx.plugin(QingClawAccount, { baseURL: 'https://gateway.qingclaw.test/anthropic' })
  return { ctx, rejectToken, refreshUsage }
}

describe('QingClaw account provider', () => {
  it('survives a missing website model catalog route with the bundled catalog and still sends Messages with the short JWT', async () => {
    const observed: Request[] = []
    const issued: string[] = []
    const apiKeys: string[] = []
    let exchanges = 0
    let keyExchanges = 0
    const request: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      observed.push(request.clone())
      const url = new URL(request.url)
      if (url.pathname === '/auth-api/v0/dsh/model_token') {
        const token = jwt(++exchanges)
        issued.push(token)
        return grant(token)
      }
      if (url.pathname === '/auth-api/v0/dsh/model_key') {
        const apiKey = `gateway-key-${++keyExchanges}`
        apiKeys.push(apiKey)
        return keyGrant(keyExchanges)
      }
      if (url.pathname === '/auth-api/v0/dsh/models') return new Response(null, { status: 404 })
      if (url.pathname === '/anthropic/v1/messages') return successfulMessages()
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const { ctx, rejectToken } = await mount(request)

    await expect(ctx.llm.listModels('deepseek-account'))
      .resolves.toEqual([
        expect.objectContaining({ provider: 'deepseek-account', id: 'deepseek-flash', name: 'DeepSeek Flash', inputModalities: ['text', 'image'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (latest)', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017 snapshot)', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'glm-5.3', name: 'GLM 5.3', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'glm-5.3-prime', name: 'GLM 5.3 Prime', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen-plus', name: 'Qwen Plus', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max', inputModalities: ['text'] }),
      ])
    await expect(finishOf(ctx)).resolves.toMatchObject({ kind: 'stop' })

    const platform = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/model_token')
    const modelKey = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/model_key')
    const listing = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/models')
    const messages = observed.find(item => new URL(item.url).pathname === '/anthropic/v1/messages')
    expect(platform?.headers.get('x-dsh-auth-token')).toBe('long-lived-device-session')
    expect(platform?.headers.get('authorization')).toBeNull()
    expect(platform?.headers.get('cookie')).toBe('deployment=beta')
    const issuedToken = issued[0]
    if (issuedToken === undefined) throw new Error('model-token exchange did not issue a token')
    expect(modelKey?.headers.get('x-dsh-auth-token')).toBe('long-lived-device-session')
    expect(listing?.headers.get('authorization')).toBeNull()
    expect(listing?.headers.get('x-dsh-auth-token')).toBe('Bearer ' + issuedToken)
    expect(messages?.headers.get('authorization')).toBe('Bearer ' + apiKeys[0]!)
    expect(messages?.headers.get('x-dsh-auth-token')).toBeNull()
    expect(exchanges).toBe(1)
    expect(keyExchanges).toBe(1)
    expect(rejectToken).not.toHaveBeenCalled()
  })

  it('offers the gateway model list instead of only the bundled fallback', async () => {
    const request: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
      if (path === '/auth-api/v0/dsh/models') {
        return Response.json({
          data: [
            { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash' },
            { id: 'new-upstream-model', name: 'New Upstream Model', default: true },
          ],
        })
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const { ctx } = await mount(request)
    const saveSelection = vi.fn(async (_selection: { provider: string; model: string }) => {})
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-account', model: 'deepseek-v4.1-flash' }),
      saveSelection,
    } as never)

    const models = await ctx.llm.listModels('deepseek-account')
    expect(saveSelection).toHaveBeenCalledWith({ provider: 'deepseek-account', model: 'new-upstream-model' })
    expect(models.map(model => model.id)).toEqual(['deepseek-v4.1-flash-1017', 'new-upstream-model'])
  })

  it.each([
    { body: 'quota exceeded', delay: undefined, expected: 'ACCOUNT_QUOTA' },
    { body: 'too many requests', delay: undefined, expected: 'RATE_LIMIT' },
    { body: 'quota exceeded', delay: '3', expected: 'RATE_LIMIT' },
  ])('classifies the gateway HTTP 429 body "$body" with retry delay $delay as $expected', async ({ body, delay, expected }) => {
    let keyExchanges = 0
    let messageRequests = 0
    const { ctx, rejectToken, refreshUsage } = await mount(async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
      if (path === '/auth-api/v0/dsh/model_key') {
        return keyGrant(++keyExchanges)
      }
      if (path === '/auth-api/v0/dsh/models') return new Response(null, { status: 404 })
      if (path === '/anthropic/v1/messages') {
        messageRequests++
        const headers = new Headers({ 'content-type': 'text/plain', 'x-request-id': 'gateway-test' })
        if (delay) headers.set('retry-after', delay)
        return new Response(body, { status: 429, headers })
      }
      throw new Error('unexpected path ' + path)
    })
    await expect(finishOf(ctx)).resolves.toMatchObject({
      kind: 'error', failure: { code: expected, status: 429, requestId: 'gateway-test',
        ...(expected === 'ACCOUNT_QUOTA' && { message: '网关返回额度不足，请刷新用量。' }),
        ...(delay && { providerRetryAfterMs: 3000 }),
      },
    })
    expect(messageRequests).toBe(1)
    expect(keyExchanges).toBe(1)
    expect(refreshUsage.mock.calls).toEqual(expected === 'ACCOUNT_QUOTA' ? [['long-lived-device-session']] : [])
    expect(rejectToken).not.toHaveBeenCalled()
  })

  it('refreshes after a structured gateway balance refusal and obtains a fresh key on the next request', async () => {
    let issued = 0
    const sent: Array<string | null> = []
    const { ctx, refreshUsage } = await mount(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
      if (path === '/auth-api/v0/dsh/models') return new Response(null, { status: 404 })
      if (path === '/auth-api/v0/dsh/model_key') return keyGrant(++issued)
      if (path === '/anthropic/v1/messages') {
        sent.push(request.headers.get('authorization'))
        return sent.length === 1
          ? Response.json({ error: { code: 'insufficient_balance', message: 'Insufficient balance' } }, { status: 402 })
          : successfulMessages()
      }
      throw new Error('unexpected path ' + path)
    })
    await expect(finishOf(ctx)).resolves.toMatchObject({ kind: 'error', failure: { code: 'ACCOUNT_QUOTA', status: 402 } })
    expect(sent).toEqual(['Bearer gateway-key-1'])
    expect(refreshUsage.mock.calls).toEqual([['long-lived-device-session']])
    await expect(finishOf(ctx)).resolves.toMatchObject({ kind: 'stop' })
    expect(sent).toEqual(['Bearer gateway-key-1', 'Bearer gateway-key-2'])
  })

  it('drops only a gateway-rejected API key and exchanges a new one without signing out the device', async () => {
    const messageKeys: string[] = []
    let keyExchanges = 0
    let tokenExchanges = 0
    const request: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(++tokenExchanges))
      if (path === '/auth-api/v0/dsh/model_key') {
        const sequence = ++keyExchanges
        return keyGrant(sequence)
      }
      if (path === '/auth-api/v0/dsh/models') return new Response(null, { status: 404 })
      if (path === '/anthropic/v1/messages') {
        messageKeys.push(request.headers.get('authorization') ?? '')
        return messageKeys.length === 1
          ? new Response('Unauthorized', { status: 401 })
          : successfulMessages()
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const { ctx, rejectToken } = await mount(request)

    await expect(finishOf(ctx)).resolves.toMatchObject({
      kind: 'error', failure: { code: 'ACCOUNT_TOKEN_INVALID' },
    })
    await expect(finishOf(ctx)).resolves.toMatchObject({ kind: 'stop' })
    expect(messageKeys).toEqual(['Bearer gateway-key-1', 'Bearer gateway-key-2'])
    expect(keyExchanges).toBe(2)
    expect(rejectToken).not.toHaveBeenCalled()
  })

  it('keeps the real Loader namespace-plugin shape', () => {
    expect('default' in QingClawAccount).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(QingClawAccount) as Record<string, unknown>
    expect(unwrapped).toBe(QingClawAccount)
    expect(unwrapped.name).toBe('llm-qingclaw-account')
    expect(unwrapped.inject).toEqual(['llm', 'deepseekAccount'])
    expect(unwrapped.Config).toBeDefined()
    expect(typeof unwrapped.apply).toBe('function')
  })
})
