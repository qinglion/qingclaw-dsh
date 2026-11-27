/** QingClaw provider composition, catalog fallback, and short-token failure boundaries. */
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { AccountRequestCredential, DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { BlockAssembler, createAssistantMessage, createToolResultMessage, createUserMessage, type GenerateOptions, LlmRuntime } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import LocalAttachments from '../../../attachment/attachment-local/src/index.ts'
import * as QingClawAccount from '../src/index.ts'

const contexts: Context[] = []

interface ChatCompletionRequest {
  messages: { role: string; content: string | { type: string; image_url?: { url: string } }[] }[]
  tools?: unknown[]
}

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

/** Website listing shared by the default-follow tests: one plain model and the marked default. */
const DEFAULT_FOLLOW_LISTING = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', input_modalities: ['text'], rate: 1 },
  { id: 'new-upstream-model', name: 'New Upstream Model', default: true, rate: 0.4 },
]

/** Serve the model-token grant and the shared listing; refuse every other route. */
function listingFetch(): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
    if (path === '/auth-api/v0/dsh/models') return Response.json({ data: DEFAULT_FOLLOW_LISTING })
    throw new Error(`unexpected request ${request.method} ${request.url}`)
  }
}

function completionStream(
  deltas: Record<string, unknown>[] = [{ role: 'assistant', content: 'QingClaw ' }, { content: 'ready' }],
  reason = 'stop',
  model = 'qwen-plus',
): Response {
  const metadata = { id: 'chatcmpl-qingclaw-test', object: 'chat.completion.chunk', created: 1, model }
  const chunks = [
    ...deltas.map(delta => ({ choices: [{ index: 0, delta, finish_reason: null }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: reason }] },
    { choices: [], usage: { prompt_tokens: 3, prompt_tokens_details: { cached_tokens: 1 }, completion_tokens: 2, total_tokens: 5 } },
  ]
  return new Response(chunks.map(chunk => `data: ${JSON.stringify({ ...metadata, ...chunk })}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  })
}

async function run(ctx: Context, options: Partial<GenerateOptions> = {}) {
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({
    provider: 'deepseek-account', model: 'qwen-plus', messages: [], ...options,
  })) assembler.push(chunk)
  return assembler
}

async function finishOf(ctx: Context, options: Partial<GenerateOptions> = {}) {
  return (await run(ctx, options)).finish
}

async function mount(request: typeof fetch) {
  const refreshUsage = vi.fn(async (_token: string): Promise<void> => {})
  const rejectToken = vi.fn(async (): Promise<void> => {})
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
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'refreshUsage'> & {
    resolveRequestCredential: (url: string) => Promise<AccountRequestCredential>
  } = {
    getPlatformSession: async (): Promise<PlatformSession> => session,
    refreshUsage,
    resolveRequestCredential: async () => ({
      headers: {}, revoked: new AbortController().signal, reject: rejectToken,
    }),
  }
  ctx.provide('deepseekAccount', account as DeepSeekAccount)
  await ctx.plugin(QingClawAccount, { baseURL: 'https://gateway.qingclaw.test/test/v1' })
  return { ctx, rejectToken, refreshUsage }
}

async function savedImage(ctx: Context, provider: string, model: string) {
  const home = await mkdtemp(join(tmpdir(), 'qingclaw-vision-'))
  vi.stubEnv('DSH_HOME', home)
  onTestFinished(async () => {
    vi.unstubAllEnvs()
    await rm(home, { recursive: true, force: true })
  })
  await ctx.plugin(LocalAttachments, { dshHome: home })
  const attachment = await ctx.attachments.saveImage({
    data: await readFile(new URL('../../llm-deepseek/tests/fixtures/red.png', import.meta.url)), mediaType: 'image/png',
  })
  const image = await ctx.attachments.readImageRequest(attachment, ctx.llm.imageRequestTarget(provider, model, attachment))
  return { attachment, dataURL: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` }
}

describe('QingClaw account provider', () => {
  it('offers no models until the website catalog answers and authenticates Chat Completions with the exchanged gateway key', async () => {
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
      if (url.pathname === '/test/v1/chat/completions') return completionStream()
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const { ctx, rejectToken } = await mount(request)

    await expect(ctx.llm.listModels('deepseek-account')).resolves.toEqual([])
    const result = await run(ctx)
    expect(result.finish.kind).toBe('stop')
    expect(result.blocks()).toContainEqual({ type: 'text', text: 'QingClaw ready' })
    expect(result.usage).toMatchObject({ inputTokens: 2, cacheReadTokens: 1, outputTokens: 2, totalTokens: 5 })

    const platform = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/model_token')
    const modelKey = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/model_key')
    const listing = observed.find(item => new URL(item.url).pathname === '/auth-api/v0/dsh/models')
    const messages = observed.find(item => new URL(item.url).pathname === '/test/v1/chat/completions')
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

  it.each(['deepseek-v4.1-flash', 'qwen4-max'])('sends retained image bytes on a %s follow-up from a saved Messages conversation', async (model) => {
    const messagesRequests: Request[] = []
    const { ctx } = await mount(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      switch (path) {
        case '/auth-api/v0/dsh/model_token': return grant(jwt(1))
        case '/auth-api/v0/dsh/model_key': return keyGrant(1)
        case '/auth-api/v0/dsh/models':
          return Response.json({ data: [{ id: model, input_modalities: ['text', 'image'] }] })
        case '/test/v1/chat/completions':
          messagesRequests.push(request)
          return completionStream(undefined, 'stop', model)
        default: throw new Error('unexpected request ' + request.url)
      }
    })
    const provider = 'deepseek-account'
    const { attachment, dataURL } = await savedImage(ctx, provider, model)
    const followUp = { type: 'text', text: 'What color was the image?' } as const
    const messages = [
      createUserMessage({ source: { kind: 'user' }, content: [{ type: 'image', attachment }] }),
      createAssistantMessage({ source: { provider, model, replayState: {
        response: { kind: 'deepseek-messages', version: 1, model }, blocks: [{ type: 'text' }],
      } }, content: [{ type: 'text', text: 'I see it.' }] }),
      createUserMessage({ source: { kind: 'user' }, content: [followUp] }),
    ]
    await expect(finishOf(ctx, { model, messages })).resolves.toMatchObject({ kind: 'stop' })
    expect(messagesRequests).toHaveLength(1)
    const { messages: sent } = await messagesRequests[0]!.json() as ChatCompletionRequest
    expect(sent).toMatchObject([{ role: 'user' }, { role: 'assistant', content: 'I see it.' }, { role: 'user' }])
    const original = sent[0]!.content
    const imagePart = Array.isArray(original) && original.find(part => part.type === 'image_url')
    expect(imagePart).toMatchObject({ image_url: { url: dataURL } })
    expect(JSON.stringify(sent[2]!.content)).toContain(followUp.text)
  })

  it('offers exactly the website catalog and names each model by its catalog id', async () => {
    const { ctx } = await mount(listingFetch())
    const saveSelection = vi.fn(async (_selection: { provider: string; model: string }) => {})
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-account', model: 'deepseek-v4.1-flash' }),
      isUserSelected: () => false,
      saveSelection,
    } as never)

    const models = await ctx.llm.listModels('deepseek-account')
    expect(saveSelection).toHaveBeenCalledWith({ provider: 'deepseek-account', model: 'new-upstream-model' })
    expect(models.map(model => model.id)).toEqual(['deepseek-v4.1-flash', 'new-upstream-model'])
    expect(models.map(model => model.name)).toEqual(['deepseek-v4.1-flash', 'new-upstream-model'])
    expect(models[0]?.inputModalities).toEqual(['text'])
    expect(models.map(model => model.rate)).toEqual([1, 0.4])
  })

  it('sizes each request from the capacity the website catalog declares', async () => {
    const { ctx } = await mount(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
      if (path === '/auth-api/v0/dsh/models') {
        return Response.json({ data: [
          { id: 'small-model', max_output_tokens: 4_096, context_window: 262_144 },
          { id: 'wide-model', max_output_tokens: 393_216, context_window: 1_000_000 },
          { id: 'zero-model', max_output_tokens: 0 },
          { id: 'fractional-model', max_output_tokens: 8_192.5, context_window: 1_000.5 },
        ] })
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    })

    // A declared output cap below the route default wins; one above it still answers at the route default.
    await expect(ctx.llm.resolveModelInfo('deepseek-account', 'small-model'))
      .resolves.toMatchObject({ context: { contextWindow: 262_144 }, defaultMaxTokens: 4_096 })
    await expect(ctx.llm.resolveModelInfo('deepseek-account', 'wide-model'))
      .resolves.toMatchObject({ context: { contextWindow: 1_000_000 }, defaultMaxTokens: 256_000 })
    // A value the catalog cannot read as a whole positive count declares nothing, so the route budget stays.
    for (const id of ['zero-model', 'fractional-model']) {
      await expect(ctx.llm.resolveModelInfo('deepseek-account', id))
        .resolves.toMatchObject({ context: { contextWindow: 1_000_000 }, defaultMaxTokens: 256_000 })
    }
  })
  it('keeps a user-saved model while the website default differs', async () => {
    const { ctx } = await mount(listingFetch())
    const saveSelection = vi.fn(async (_selection: { provider: string; model: string }) => {})
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-account', model: 'deepseek-v4.1-flash' }),
      isUserSelected: () => true,
      saveSelection,
    } as never)
    await ctx.llm.listModels('deepseek-account')
    expect(saveSelection).not.toHaveBeenCalled()
  })

  it('returns a remembered model to the website default once it leaves the catalog', async () => {
    const { ctx } = await mount(listingFetch())
    const saveSelection = vi.fn(async (_selection: { provider: string; model: string }) => {})
    ctx.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek-account', model: 'retired-model' }),
      isUserSelected: () => true,
      saveSelection,
    } as never)
    await ctx.llm.listModels('deepseek-account')
    expect(saveSelection).toHaveBeenCalledWith({ provider: 'deepseek-account', model: 'new-upstream-model' })
  })

  it('assembles streamed function arguments and delivers the image returned by the tool in the next request', async () => {
    const requests: Request[] = []
    const { ctx } = await mount(async (input, init) => {
      const request = new Request(input, init)
      switch (new URL(request.url).pathname) {
        case '/auth-api/v0/dsh/model_token': return grant(jwt(1))
        case '/auth-api/v0/dsh/model_key': return keyGrant(1)
        case '/auth-api/v0/dsh/models':
          return Response.json({ data: [{ id: 'deepseek-v4.1-flash', input_modalities: ['text', 'image'] }] })
        case '/test/v1/chat/completions':
          requests.push(request)
          return requests.length > 1 ? completionStream(undefined, 'stop', model) : completionStream([
            { role: 'assistant', tool_calls: [{ index: 0, id: 'call_color', type: 'function', function: { name: 'color', arguments: '{"x":' } }] },
            { tool_calls: [{ index: 0, function: { arguments: '7}' } }] },
          ], 'tool_calls', model)
        default: throw new Error('unexpected request ' + request.url)
      }
    })
    const model = 'deepseek-v4.1-flash'
    const provider = 'deepseek-account'
    const { attachment, dataURL } = await savedImage(ctx, provider, model)
    const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Check the color.' }] })
    const tools = [{ name: 'color', description: 'Look up a color', parameters: { type: 'object', properties: { x: { type: 'integer' } } } }]
    const first = await run(ctx, { model, messages: [user], tools })
    expect(first.finish.kind).toBe('tool-calls')
    const assistant = first.message({ provider, model })
    const call = assistant.content.find(block => block.type === 'tool-call')
    expect(call).toMatchObject({ name: 'color', id: 'call_color', arguments: '{"x":7}' })
    const toolResult = createToolResultMessage({
      callId: call!.id, content: [{ type: 'text', text: 'sampled pixel' }, { type: 'image', attachment }], isError: false,
    })
    const second = await run(ctx, { model, messages: [user, assistant, toolResult], tools })
    expect(second.finish.kind).toBe('stop')
    expect(requests).toHaveLength(2)
    const body = await requests[1]!.json() as ChatCompletionRequest
    expect(body.tools).toMatchObject([{ type: 'function', function: { name: 'color' } }])
    expect(body.messages).toMatchObject([
      { role: 'user' },
      { role: 'assistant', tool_calls: [{ type: 'function', id: 'call_color', function: { name: 'color', arguments: '{"x":7}' } }] },
      { role: 'tool', tool_call_id: 'call_color' },
      { role: 'user' },
    ])
    expect(body.messages[2]!.content).toContain('sampled pixel')
    const imageContents = body.messages[3]!.content
    expect(Array.isArray(imageContents) && imageContents.find(part => part.type === 'image_url')?.image_url?.url).toBe(dataURL)
  })

  it.each([
    { body: 'quota exceeded', delay: undefined, expected: 'ACCOUNT_QUOTA' },
    { body: 'too many requests', delay: undefined, expected: 'RATE_LIMIT' },
    { body: 'quota exceeded', delay: '3', expected: 'RATE_LIMIT' },
  ])('classifies the gateway HTTP 429 body "$body" with retry delay $delay as $expected', async ({ body, delay, expected }) => {
    let keyExchanges = 0
    let messageRequests = 0
    const { ctx, rejectToken, refreshUsage } = await mount(async (input, init) => {
      const request = new Request(input, init)
      const path = new URL(request.url).pathname
      if (path === '/auth-api/v0/dsh/model_token') return grant(jwt(1))
      if (path === '/auth-api/v0/dsh/model_key') {
        return keyGrant(++keyExchanges)
      }
      if (path === '/auth-api/v0/dsh/models') return new Response(null, { status: 404 })
      if (path === '/test/v1/chat/completions') {
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
      if (path === '/test/v1/chat/completions') {
        sent.push(request.headers.get('authorization'))
        return sent.length === 1
          ? Response.json({ error: { code: 'insufficient_balance', message: 'Insufficient balance' } }, { status: 402 })
          : completionStream()
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
      if (path === '/test/v1/chat/completions') {
        messageKeys.push(request.headers.get('authorization') ?? '')
        return messageKeys.length === 1
          ? new Response('Unauthorized', { status: 401 })
          : completionStream()
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
