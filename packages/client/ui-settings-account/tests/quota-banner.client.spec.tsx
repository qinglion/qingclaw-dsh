// @vitest-environment jsdom
/** Persistent account quota banner beside the composer. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountQuotaBanner } from '../src/client/AccountQuotaBanner.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

function account(remaining: number, active: boolean, plan = 'pro', limit = 100_000) {
  return {
    view: { links: { topUpUrl: 'https://example.test/top-up' } },
    details: {
      profile: {
        status: 'ready' as const,
        value: { id: 'u1', name: '用户', contact: null, quotaRemaining: remaining, quotaTotal: limit, plan, subscriptionActive: active },
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

it('shows the expired notice and opens top-up', () => {
  const open = mount(account(12_000, false))
  expect(screen.getByRole('status').textContent).toContain('套餐已到期')
  fireEvent.click(screen.getByRole('button', { name: '去充值' }))
  expect(open).toHaveBeenCalledWith('top-up', expect.any(Function))
})

it('shows the empty notice', () => {
  mount(account(0, true))
  expect(screen.getByRole('status').textContent).toContain('额度已用完')
})

it('stays hidden while quota is healthy', () => {
  mount(account(80_000, true))
  expect(screen.queryByRole('status')).toBeNull()
})

it('keeps a newly funded free account out of the expired and low-credit states', () => {
  mount(account(1_000, false, 'free', 1_000))
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows the actual fractional balance when credits run low', () => {
  mount(account(0.162, false, 'free', 1_000))
  expect(screen.getByRole('status').textContent).toContain('额度即将用完，剩余： 0')
})
