// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AccountProfile } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountSnapshot } from '../src/client/AccountSection.tsx'
import { AccountQuotaTool } from '../src/client/AccountQuotaTool.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function accountDetails(wallet: Partial<AccountProfile> | null | undefined): AccountSnapshot['details'] {
  if (wallet === undefined) return undefined
  if (wallet === null) return { profile: { status: 'failed' } }
  return { profile: { status: 'ready', value: { id: null, name: null, contact: null, ...wallet } } }
}

function mount(wallet: Partial<AccountProfile> | null | undefined, wide = true, signedIn = true) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const snapshot: AccountSnapshot = {
    view: { status: signedIn ? 'credential-stored' : 'signed-out', attempt: null, links: {
      usageUrl: 'https://example.test/usage', topUpUrl: 'https://example.test/top-up',
    } },
    details: accountDetails(wallet), avatar: undefined, failed: false,
  }
  const openPlatformPage = vi.fn()
  const refreshAccount = vi.fn(async () => {})
  type Props = ComponentProps<typeof AccountQuotaTool>
  const useAccount: Props['useAccount'] = selector => selector(snapshot)
  const t: Props['t'] = (key, params) => (zh as Record<string, string>)[key]?.replace('{plan}', typeof params?.plan === 'string' ? params.plan : '') ?? key
  const props = { wide, useAccount, t, refreshAccount, openPlatformPage } as Props
  const view = render(<AccountQuotaTool {...props} />)
  function update(wallet: Partial<AccountProfile>) {
    snapshot.details = accountDetails(wallet)
    view.rerender(<AccountQuotaTool {...props} />)
  }
  return { openPlatformPage, refreshAccount, update }
}

it.each([true, false])('shows weekly allowance separately from total and opens usage, wide=%s', async (wide) => {
  const { openPlatformPage, refreshAccount } = mount({
    plan: 'pro', subscriptionActive: true, weeklyLimit: 1000, weeklyRemaining: 220, quotaRemaining: 56173,
  }, wide)
  const ring = screen.getByRole('button', { name: /本周剩余 · 22%/ })
  fireEvent.focus(ring)
  fireEvent.pointerEnter(ring, { pointerType: 'mouse' })
  expect((await screen.findByRole('tooltip')).textContent).toBe('本周剩余 · 22%')
  fireEvent.click(ring)
  const menu = within(screen.getByRole('menu'))
  expect(menu.getByText(/Pro 套餐/)).toBeTruthy()
  expect(menu.getByText('22%')).toBeTruthy()
  expect(menu.getByText('56K')).toBeTruthy()
  expect(refreshAccount).toHaveBeenCalledOnce()
  fireEvent.click(menu.getByRole('menuitem', { name: '管理用量' }))
  expect(openPlatformPage).toHaveBeenCalledWith('usage', expect.any(Function))
  expect(screen.queryByRole('menu')).toBeNull()
})

it.each([
  [{ weeklyLimit: 5000, quotaRemaining: 2900 }, '暂不可用'],
  [{ weeklyLimit: 0, weeklyRemaining: 0 }, '无每周额度'],
  [{ weeklyLimit: 5000, weeklyRemaining: 0, quotaRemaining: 2900 }, '0%'],
] as const)('shows the paid plan even with missing or exhausted weekly allowance', (wallet, text) => {
  mount({ subscriptionActive: true, ...wallet })
  fireEvent.click(screen.getByRole('button', { name: `额度 · 本周剩余 · ${text}` }))
  expect(within(screen.getByRole('menu')).getByText('每周限额').nextElementSibling?.textContent).toBe(text)
})

it.each([
  ['free', { subscriptionActive: false, plan: 'free', trialTokens: 200000 }],
  ['expired', { subscriptionActive: false, plan: 'pro', weeklyLimit: 5000, weeklyRemaining: 100 }],
  ['top-up only', { subscriptionActive: false, topupTokens: 5000 }],
  ['unknown subscription', { plan: 'pro', quotaRemaining: 2900 }],
  ['loading profile', undefined],
  ['failed profile', null],
] as const)('hides the quota control for %s', (_state, wallet) => {
  mount(wallet)
  expect(screen.queryByRole('button')).toBeNull()
})

it('closes the open menu when a refreshed account no longer has a subscription', () => {
  const { update } = mount({ subscriptionActive: true })
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('menu')).toBeTruthy()
  update({ subscriptionActive: false })
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('menu')).toBeNull()
  update({ subscriptionActive: true })
  expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
})

it('hides the personal quota control when signed out', () => {
  mount({ subscriptionActive: true }, false, false)
  expect(screen.queryByRole('button')).toBeNull()
})
