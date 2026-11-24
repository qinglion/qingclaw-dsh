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

it.each([true, false])('shows the remaining share of the recharge total and opens usage, wide=%s', async (wide) => {
  const { openPlatformPage, refreshAccount } = mount({
    plan: 'pro', subscriptionActive: true, quotaTotal: 1000, quotaRemaining: 220,
  }, wide)
  const ring = screen.getByRole('button', { name: '可用额度 · 22%' })
  fireEvent.focus(ring)
  fireEvent.pointerEnter(ring, { pointerType: 'mouse' })
  expect((await screen.findByRole('tooltip')).textContent).toBe('可用额度 · 22%')
  fireEvent.click(ring)
  const menu = within(screen.getByRole('menu'))
  expect(menu.getByText(/Pro 套餐/)).toBeTruthy()
  expect(menu.getByText('总额度').nextElementSibling?.textContent).toBe('1,000')
  expect(menu.getByText('可用额度').nextElementSibling?.textContent).toBe('220')
  expect(refreshAccount).toHaveBeenCalledOnce()
  fireEvent.click(menu.getByRole('menuitem', { name: '管理用量' }))
  expect(openPlatformPage).toHaveBeenCalledWith('usage', expect.any(Function))
  expect(screen.queryByRole('menu')).toBeNull()
})

it.each([
  [{ quotaTotal: 120, quotaRemaining: 20 }, '17%'],
  [{ quotaTotal: 1000, quotaRemaining: 0 }, '0%'],
  [{ quotaTotal: 0, quotaRemaining: 0 }, '0%'],
  [{ quotaTotal: 1000, quotaRemaining: 2000 }, '100%'],
  [{ quotaTotal: 1000 }, '暂不可用'],
  [{ quotaRemaining: 2900 }, '暂不可用'],
] as const)('shares the remaining credits against the recharge total', (wallet, text) => {
  mount({ subscriptionActive: true, ...wallet })
  expect(screen.getByRole('button', { name: `可用额度 · ${text}` })).toBeTruthy()
})

it.each([
  ['free', { subscriptionActive: false, plan: 'free', quotaTotal: 200, quotaRemaining: 150 }],
  ['expired', { subscriptionActive: false, plan: 'pro', quotaTotal: 5000, quotaRemaining: 100 }],
  ['top-up only', { subscriptionActive: false, topupTokens: 5000, quotaTotal: 5000, quotaRemaining: 5000 }],
  ['unknown subscription', { plan: 'pro', quotaTotal: 2900, quotaRemaining: 2900 }],
] as const)('shows the control for a %s account', (_state, wallet) => {
  mount(wallet)
  expect(screen.getByRole('button')).toBeTruthy()
})

it.each([
  ['no reported credits', { plan: 'free', subscriptionActive: false }],
  ['loading profile', undefined],
  ['failed profile', null],
] as const)('hides the quota control with %s', (_state, wallet) => {
  mount(wallet)
  expect(screen.queryByRole('button')).toBeNull()
})

it('closes the open menu when a refreshed account no longer reports credits', () => {
  const { update } = mount({ subscriptionActive: true, quotaTotal: 1000, quotaRemaining: 500 })
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('menu')).toBeTruthy()
  update({ subscriptionActive: true })
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('menu')).toBeNull()
})

it('hides the personal quota control when signed out', () => {
  mount({ subscriptionActive: true, quotaTotal: 1000, quotaRemaining: 500 }, false, false)
  expect(screen.queryByRole('button')).toBeNull()
})
