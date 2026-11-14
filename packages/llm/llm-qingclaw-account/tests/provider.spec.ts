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
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'rejectToken'> = {
    getPlatformSession: async (): Promise<PlatformSession> => session,
    rejectToken,
  }
  ctx.provide('deepseekAccount', account as DeepSeekAccount)
  await ctx.plugin(QingClawAccount, { baseURL: 'https://gateway.qingclaw.test/anthropic' })
  return { ctx, rejectToken }
}

describe('QingClaw account provider', () => {
  it('survives a missing root /models route with the bundled catalog and still sends Messages with the short JWT', async () => {
    const observed: Request[] = []
    const issued: string[] = []
    let exchanges = 0
    const request: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      observed.push(request.clone())
      const url = new URL(request.url)
      if (url.pathname === '/auth-api/v0/dsh/model_token') {
        const token = jwt(++exchanges)
        issued.push(token)
        return grant(token)
      }
      if (url.pathname === '/models') return new Response(null, { status: 404 })
      if (url.pathname === '/anthropic/v1/messages') return successfulMessages()
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const { ctx, rejectToken } = await mount(request)

    await expect(ctx.llm.listModels('deepseek-account'))
      .resolves.toEqual([
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen-plus', name: 'Qwen Plus', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash', inputModalities: ['text'] }),
        expect.objectContaining({ provider: 'deepseek-account', id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', inputModalities: ['text'] }),
      ])
    await expect(finishOf(ctx)).resolves.toMatchObject({ kind: 'stop' })

    const platform = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/model_token')
    const listing = observed.find(item => new URL(item.url).pathname === '/models')
    const messages = observed.find(item => new URL(item.url).pathname === '/anthropic/v1/messages')
    expect(platform?.headers.get('x-dsh-auth-token')).toBe('long-lived-device-session')
    expect(platform?.headers.get('authorization')).toBeNull()
    expect(platform?.headers.get('cookie')).toBe('deployment=beta')
    const issuedToken = issued[0]
    if (issuedToken === undefined) throw new Error('model-token exchange did not issue a token')
    expect(listing?.headers.get('authorization')).toBeNull()
    expect(listing?.headers.get('x-dsh-auth-token')).toBe('Bearer ' + issuedToken)
    expect(messages?.headers.get('authorization')).toBeNull()
    expect(messages?.headers.get('x-dsh-auth-token')).toBe('Bearer ' + issuedToken)
    expect(exchanges).toBe(1)
    expect(rejectToken).not.toHaveBeenCalled()
  })

  it('drops only a gateway-rejected short JWT and exchanges a new one without signing out the device', async () => {
    const messageTokens: string[] = []
    const issued: string[] = []
    let exchanges = 0
    const request: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') {
        const token = jwt(++exchanges)
        issued.push(token)
        return grant(token)
      }
      if (path === '/models') return new Response(null, { status: 404 })
      if (path === '/anthropic/v1/messages') {
        messageTokens.push(request.headers.get('x-dsh-auth-token') ?? '')
        return messageTokens.length === 1
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
    expect(messageTokens).toEqual(issued.map(token => 'Bearer ' + token))
    expect(exchanges).toBe(2)
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
