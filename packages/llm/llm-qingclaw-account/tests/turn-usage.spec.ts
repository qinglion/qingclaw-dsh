import { Context } from '@deepseek-ai/cordis'
import type { DeepSeekAccount, PlatformSession } from '@deepseek-ai/dsh-deepseek-account'
import { afterEach, expect, it, vi } from 'vitest'
import { installTurnUsageRefresh } from '../src/turn-usage.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.useRealTimers()
})

function fixture() {
  vi.useFakeTimers()
  const ctx = new Context()
  contexts.push(ctx)
  let current: PlatformSession | null = { origin: 'https://platform.test', token: 'device-one', userId: null }
  const refreshUsage = vi.fn(async (_token: string) => {})
  const account: Pick<DeepSeekAccount, 'getPlatformSession' | 'refreshUsage'> = {
    getPlatformSession: async () => current, refreshUsage,
  }
  ctx.provide('deepseekAccount', account as DeepSeekAccount)
  installTurnUsageRefresh(ctx, 'deepseek-account')
  const chat = (provider: string) => {
    const session = { requestContext: () => ({ provider }) }
    const emit = (type: string, data: object) => { ctx.emit('session/event', session as never, { type, data } as never) }
    return {
      start: () => { emit('turn/start', { turn: 1 }) },
      answer: () => { emit('assistant/message', { turn: 1 }) },
      end: (kind: string) => { emit('turn/end', { turn: 1, reason: { kind } }) },
    }
  }
  return { ctx, chat, refreshUsage, switchAccount: (token?: string) => {
    current = token ? { origin: 'https://platform.test', token, userId: null } : null
  } }
}

it('refreshes once for multiple model steps and nearby completed turns, without blocking the turn', async () => {
  const { chat, refreshUsage } = fixture()
  const first = chat('deepseek-account')
  first.start()
  first.answer()
  first.answer()
  const second = chat('deepseek-account')
  second.start()
  second.answer()
  await vi.advanceTimersByTimeAsync(1000)
  expect(refreshUsage).not.toHaveBeenCalled()
  first.end('completed')
  second.end('max-tokens')
  expect(refreshUsage).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  expect(refreshUsage.mock.calls).toEqual([['device-one']])
})

it('omits non-account providers, empty and failed turns and old grants', async () => {
  const { chat, refreshUsage, switchAccount } = fixture()
  const local = chat('another-provider')
  local.start()
  local.answer()
  local.end('completed')
  const current = chat('deepseek-account')
  current.start()
  current.end('completed')
  current.start()
  current.answer()
  current.end('error')
  current.start()
  current.answer()
  switchAccount('device-two')
  current.end('completed')
  await vi.advanceTimersByTimeAsync(500)
  expect(refreshUsage).not.toHaveBeenCalled()
})
