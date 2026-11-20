import { Buffer } from 'node:buffer'
import { afterEach, expect, it, vi } from 'vitest'
import type { DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { ModelTokenCache } from '../src/model-token.ts'

const caches: ModelTokenCache[] = []
afterEach(async () => {
  await Promise.all(caches.splice(0).map(cache => cache.dispose()))
  vi.restoreAllMocks()
})

function jwt(exp: number, suffix = 'signature'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ exp })}.${suffix}`
}

function success(token: string, exp: number): Response {
  return Response.json({
    code: 0,
    data: { biz_code: 0, biz_data: { token, token_type: 'Bearer', expires_in: 900, expires_at: exp } },
  })
}

function fixture(options: {
  now?: () => number
  request: typeof fetch
  session?: () => PlatformSession | null
}) {
  const rejectToken = vi.fn(async (_token: string): Promise<void> => {})
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'rejectToken'> = {
    getPlatformSession: async () => options.session?.() ?? {
      origin: 'https://beta.qingclaw.com', token: 'device-session', userId: null,
      requestHeaders: { cookie: 'deployment=beta' },
    },
    rejectToken,
  }
  const cache = new ModelTokenCache({
    account,
    timeoutMs: () => 30_000,
    ...options.now === undefined ? {} : { now: options.now },
    request: options.request,
  })
  caches.push(cache)
  return { cache, rejectToken }
}

it('single-flights exchange requests and sends only the device token to Platform', async () => {
  const now = 1_800_000_000_000
  const token = jwt(now / 1_000 + 900)
  const response = Promise.withResolvers<Response>()
  const requests: Request[] = []
  const request: typeof fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push(new Request(input, init))
    return await response.promise
  })
  const { cache, rejectToken } = fixture({ now: () => now, request })
  const first = cache.resolve()
  const second = cache.resolve()
  await vi.waitFor(() => { expect(request).toHaveBeenCalledTimes(1) })
  response.resolve(success(token, now / 1_000 + 900))
  await expect(Promise.all([first, second])).resolves.toEqual([token, token])
  expect(requests[0]?.url).toBe('https://beta.qingclaw.com/auth-api/v0/dsh/model_token')
  expect(requests[0]?.method).toBe('POST')
  expect(requests[0]?.headers.get('x-dsh-auth-token')).toBe('device-session')
  expect(requests[0]?.headers.get('cookie')).toBe('deployment=beta')
  expect(await requests[0]?.text()).toBe('{}')
  expect(rejectToken).not.toHaveBeenCalled()
})

it('caches until exp minus 60 seconds and then exchanges again', async () => {
  let now = 1_800_000_000_000
  const firstExp = now / 1_000 + 900
  const secondExp = firstExp + 900
  const tokens = [jwt(firstExp, 'first'), jwt(secondExp, 'second')]
  let requests = 0
  const request: typeof fetch = vi.fn(async () => {
    requests += 1
    return success(tokens.shift()!, requests === 1 ? firstExp : secondExp)
  })
  const { cache } = fixture({ now: () => now, request })
  const first = await cache.resolve()
  expect(await cache.resolve()).toBe(first)
  expect(request).toHaveBeenCalledTimes(1)
  now = firstExp * 1_000 - 60_000
  expect(await cache.resolve()).not.toBe(first)
  expect(request).toHaveBeenCalledTimes(2)
})

it('clears only a gateway-rejected short JWT', async () => {
  const now = 1_800_000_000_000
  const exp = now / 1_000 + 900
  let issuance = 0
  const request: typeof fetch = vi.fn(async () => {
    issuance += 1
    return success(jwt(exp + issuance, `token-${issuance}`), exp + issuance)
  })
  const { cache, rejectToken } = fixture({ now: () => now, request })
  const first = await cache.resolve()
  cache.reject('another-token')
  expect(await cache.resolve()).toBe(first)
  cache.reject(first!)
  expect(await cache.resolve()).not.toBe(first)
  expect(request).toHaveBeenCalledTimes(2)
  expect(rejectToken).not.toHaveBeenCalled()
})

it('does not publish an in-flight short JWT after signed-out state clears the cache', async () => {
  const now = 1_800_000_000_000
  const exp = now / 1_000 + 900
  const firstResponse = Promise.withResolvers<Response>()
  let requests = 0
  const request: typeof fetch = vi.fn(async () => {
    requests += 1
    if (requests === 1) return await firstResponse.promise
    return success(jwt(exp, 'replacement'), exp)
  })
  const { cache, rejectToken } = fixture({ now: () => now, request })
  const pending = cache.resolve()
  await vi.waitFor(() => { expect(request).toHaveBeenCalledTimes(1) })
  cache.clear()
  firstResponse.resolve(success(jwt(exp, 'invalidated'), exp))
  await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
  await expect(cache.resolve()).resolves.toBe(jwt(exp, 'replacement'))
  expect(request).toHaveBeenCalledTimes(2)
  expect(rejectToken).not.toHaveBeenCalled()
})

it('clears the matching long-lived device session only when model_token answers 401', async () => {
  const unauthorized: typeof fetch = vi.fn(async () => new Response(null, { status: 401 }))
  const first = fixture({ request: unauthorized })
  await expect(first.cache.resolve()).rejects.toMatchObject({ code: 'ACCOUNT_SIGN_IN_REQUIRED' })
  expect(first.rejectToken).toHaveBeenCalledExactlyOnceWith('device-session')

  const forbidden: typeof fetch = vi.fn(async () => new Response(null, { status: 403 }))
  const second = fixture({ request: forbidden })
  await expect(second.cache.resolve()).rejects.toMatchObject({ code: 'ACCOUNT_QUOTA' })
  expect(second.rejectToken).not.toHaveBeenCalled()
})

it('rejects a response whose declared expiry disagrees with its JWT', async () => {
  const now = 1_800_000_000_000
  const exp = now / 1_000 + 900
  const request: typeof fetch = vi.fn(async () => success(jwt(exp), exp + 1))
  const { cache } = fixture({ now: () => now, request })
  await expect(cache.resolve()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
