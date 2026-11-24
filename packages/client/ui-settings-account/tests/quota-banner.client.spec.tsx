// @vitest-environment jsdom
/** Persistent account quota banner beside the composer. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountQuotaBanner } from '../src/client/AccountQuotaBanner.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function account(remaining: number, plan = 'pro', limit = 100_000) {
  return {
    view: { links: { topUpUrl: 'https://example.test/top-up' } },
    details: {
      profile: {
        status: 'ready' as const,
        value: { id: 'u1', name: '用户', contact: null, quotaRemaining: remaining, quotaTotal: limit, plan, subscriptionActive: false },
      },
    },
  }
}

function mount(value: ReturnType<typeof account>) {
  const open = vi.fn()
  render(AccountQuotaBanner({
    useAccount: (select: (snapshot: never) => unknown) => select(value as never),
    usePlatformPage: (select: (page: null) => unknown) => select(null),
    openPlatformPage: open,
    t: (key: keyof typeof zh) => zh[key],
  } as never))
  return open
}

it('points every account at a top-up once its credits run out', () => {
  const open = mount(account(0))
  expect(screen.getByRole('status').textContent).toContain('额度已用完，请充值后继续')
  fireEvent.click(screen.getByRole('button', { name: '去充值' }))
  expect(open).toHaveBeenCalledWith('top-up', expect.any(Function))
})

it('reports the remaining credits at 5% of the last recharge', () => {
  mount(account(4_000.6))
  expect(screen.getByRole('status').textContent).toContain('额度即将用完，剩余： 4,001')
})

it('stays hidden while more than 5% of the credits remain', () => {
  mount(account(80_000))
  expect(screen.queryByRole('status')).toBeNull()
})

it('warns a free account the same way, because a licence grants no credits', () => {
  mount(account(0.162, 'free', 1_000))
  expect(screen.getByRole('status').textContent).toContain('额度即将用完，剩余： 0')
})

it('keeps a newly funded free account out of the warning', () => {
  mount(account(1_000, 'free', 1_000))
  expect(screen.queryByRole('status')).toBeNull()
})

it('stays hidden while the account list already shows a Platform page', () => {
  render(AccountQuotaBanner({
    useAccount: (select: (snapshot: never) => unknown) => select(account(0) as never),
    usePlatformPage: (select: (page: { page: string }) => unknown) => select({ page: 'top-up' }),
    openPlatformPage: vi.fn(),
    t: (key: keyof typeof zh) => zh[key],
  } as never))
  expect(screen.queryByRole('status')).toBeNull()
})
