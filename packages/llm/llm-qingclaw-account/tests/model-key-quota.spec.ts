/** Account-bound, coalesced balance reconciliation after a gateway quota refusal. */
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { expect, it, vi } from 'vitest'
import { ModelKeyCache } from '../src/model-key.ts'

const first = { token: 'device-one', origin: 'https://beta.qingclaw.test', userId: null }
const second = { ...first, token: 'device-two' }

function key(): Response {
  return Response.json({ code: 0, data: { biz_code: 0, biz_data: { api_key: 'same-persistent-key' } } })
}

function fixture(response: (count: number) => Response | Promise<Response>) {
  let session: PlatformSession | null = first
  const tokens: string[] = []
  const refreshUsage = vi.fn(async (_token: string) => {})
  const cache = new ModelKeyCache({
    account: { getPlatformSession: async () => session, refreshUsage },
    timeoutMs: () => 3_000,
    request: async (_input, init) => {
      tokens.push(new Headers(init?.headers).get('x-dsh-auth-token')!)
      return await response(tokens.length)
    },
  })
  return { cache, tokens, refreshUsage, switchAccount: (next: PlatformSession | null) => { session = next } }
}

it('coalesces concurrent and late refusals for a key generation, including when the website gives the same key again', async () => {
  const gate = Promise.withResolvers<Response>()
  const { cache, tokens, refreshUsage } = fixture(count => count === 2 ? gate.promise : key())
  try {
    const rejected = (await cache.resolveBound())!
    const firstCheck = cache.reconcileQuota(rejected)
    const secondCheck = cache.reconcileQuota(rejected)
    const nextRequest = cache.resolveBound()
    expect(secondCheck).toBe(firstCheck)
    gate.resolve(key())
    await Promise.all([firstCheck, secondCheck, nextRequest])
    await cache.reconcileQuota(rejected)
    expect(tokens).toEqual([first.token, first.token])
    expect(refreshUsage.mock.calls).toEqual([[first.token]])
    expect((await nextRequest)?.key).toBe(rejected.key)
    expect(await nextRequest).not.toBe(rejected)
  } finally { await cache.dispose() }
})

it.each([null, second])('does not reconcile for a replaced or signed-out account (%o)', async (replacement) => {
  const { cache, tokens, refreshUsage, switchAccount } = fixture(() => key())
  try {
    const rejected = (await cache.resolveBound())!
    switchAccount(replacement)
    await cache.reconcileQuota(rejected)
    expect(tokens).toEqual([first.token])
    expect(refreshUsage).not.toHaveBeenCalled()
  } finally { await cache.dispose() }
})

it('retires a rejected key even if refreshing the account fails', async () => {
  const { cache, tokens, refreshUsage } = fixture(() => key())
  refreshUsage.mockRejectedValueOnce(new Error('wallet offline'))
  try {
    const rejected = (await cache.resolveBound())!
    await cache.reconcileQuota(rejected)
    await cache.reconcileQuota(rejected)
    expect(refreshUsage).toHaveBeenCalledTimes(1)
    expect(tokens).toHaveLength(1)
    expect(await cache.resolveBound()).not.toBe(rejected)
    expect(tokens).toHaveLength(2)
  } finally { await cache.dispose() }
})

it.each([
  { data: { reason: 'no_quota' }, expected: 'ACCOUNT_QUOTA' },
  { data: { reason: 'free_quota_exhausted', remaining_tokens: 0 }, expected: 'ACCOUNT_QUOTA' },
  { data: { reason: 'subscription_expired', remaining_tokens: 0 }, expected: 'ACCOUNT_QUOTA' },
  { data: { reason: 'subscription_expired', remaining_tokens: 100 }, expected: 'HTTP_403' },
  { data: { reason: 'no_access', remaining_tokens: 0 }, expected: 'HTTP_403' },
  { data: null, expected: 'HTTP_403' },
])('notifies current-account observers only for explicit 403 quota refusals ($data)', async ({ data, expected }) => {
  const { cache, refreshUsage, tokens } = fixture(() => Response.json({ code: 40300, data }, { status: 403 }))
  try {
    await Promise.all([0, 1].map(async () => {
      await expect(cache.resolveBound()).rejects.toMatchObject({ code: expected, failure: { status: 403 } })
    }))
    expect(tokens).toEqual([first.token])
    expect(refreshUsage.mock.calls).toEqual(expected === 'ACCOUNT_QUOTA' ? [[first.token]] : [])
  } finally { await cache.dispose() }
})

it('ignores an explicit model-key quota refusal from an account that has just signed out', async () => {
  const gate = Promise.withResolvers<Response>()
  const started = Promise.withResolvers<undefined>()
  const { cache, refreshUsage, switchAccount } = fixture(() => {
    started.resolve(undefined)
    return gate.promise
  })
  try {
    const outcome = expect(cache.resolve()).rejects.toMatchObject({ code: 'ACCOUNT_QUOTA' })
    await started.promise
    switchAccount(null)
    gate.resolve(Response.json({ code: 40300, data: { reason: 'no_quota' } }, { status: 403 }))
    await outcome
    expect(refreshUsage).not.toHaveBeenCalled()
  } finally { await cache.dispose() }
})
