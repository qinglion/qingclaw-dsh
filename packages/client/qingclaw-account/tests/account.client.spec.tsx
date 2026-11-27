// @vitest-environment jsdom
/** The QingClaw account page, its first-run prompt and their registrations. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, vi } from 'vitest'
import { ClientRoster, createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { QuotaState } from '../src/client/quota-store.ts'
import { AccountOnboardingPrompt } from '../src/client/AccountOnboardingPrompt.tsx'
import { AccountSettingsSection, planTier } from '../src/client/AccountSettingsSection.tsx'
import * as platformPlugin from '@qinglion/dsh-client-ui-qingclaw-platform/client'
import platformManifest from '@qinglion/dsh-client-ui-qingclaw-platform/package.json' with { type: 'json' }
import * as plugin from '../src/client/index.ts'
import manifest from '../package.json' with { type: 'json' }

const roster = ClientRoster.of([
  ...webApp.rows,
  { name: platformManifest.name, inject: platformManifest.dsh.client.inject, immediately: false },
  { name: manifest.name, inject: manifest.dsh.client.inject, immediately: false },
])
const it = createClientTest({
  roster,
  provide: { [platformManifest.name]: platformPlugin, [manifest.name]: plugin },
})

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const signedOut: QuotaState = { signedIn: false, profile: undefined, topUpUrl: '', usageUrl: '' }
const signedIn: QuotaState = {
  signedIn: true,
  topUpUrl: 'https://qingclaw.test/top_up',
  usageUrl: 'https://qingclaw.test/usage',
  profile: {
    id: null, name: '林律师', contact: null, plan: 'pro', subscriptionActive: true,
    quotaRemaining: 1200, quotaTotal: 5000, trialTokens: 0, topupTokens: 5000,
  } as QuotaState['profile'],
}

/**
 * @param state - quota facts the page reads.
 * @param overrides - operation stubs to replace.
 * @returns props for the account page.
 */
function props(state: QuotaState, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    // The standard seats are framework-supplied; these specs drive the components directly.
    ...({} as GlobalStandardProps),
    useAccount: <T,>(select: (value: QuotaState) => T): T => select(state),
    t: (key: string) => key,
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    openTopUp: vi.fn(),
    openUsage: vi.fn(),
    hasRunningTasks: vi.fn(async () => false),
    // Owner props the settings shell supplies to the page and the first-run prompt.
    close: vi.fn(),
    stepId: 'account',
    complete: vi.fn(),
    openSection: vi.fn(),
    ...overrides,
  }
}

it('registers the account page over the shipped one, the credit surfaces, and the desktop prompt', async ({ start }) => {
  vi.stubGlobal('dshDesktop', {})
  const c = await start()
  await waitFor(() => {
    expect(c.ctx.slots.entries('conversation.input.dock').some(entry => entry.options.id === 'qingclaw-account-quota')).toBe(true)
  })
  expect(c.ctx.slots.entries('sidebar.footer.action').some(entry => entry.options.id === 'qingclaw-account-quota')).toBe(true)
  const section = c.ctx.slots.entries('settings.section').filter(entry => entry.options.id === 'account')
  expect(section.some(entry => entry.options.priority === -10)).toBe(true)
  expect(c.ctx.slots.entries('settings.onboarding').some(entry => entry.options.id === 'qingclaw-account-sign-in')).toBe(true)
}, 120_000)

it('keeps the first-run prompt out of a browser host', async ({ start }) => {
  const c = await start()
  await waitFor(() => { expect(c.ctx.slots.entries('sidebar.footer.action').length).toBeGreaterThan(0) })
  expect(c.ctx.slots.entries('settings.onboarding').some(entry => entry.options.id === 'qingclaw-account-sign-in')).toBe(false)
}, 120_000)

it('asks for the account while signed out and shows credits and plan once signed in', () => {
  const out = render(<AccountSettingsSection {...props(signedOut)} />)
  fireEvent.click(screen.getByRole('button', { name: 'signIn' }))
  out.unmount()

  render(<AccountSettingsSection {...props(signedIn)} />)
  expect(screen.getByText('林律师')).toBeTruthy()
  expect(screen.getByText('1,200')).toBeTruthy()
  expect(screen.getByText('5,000')).toBeTruthy()
})

it('confirms before signing out while a task still runs', async () => {
  const signOut = vi.fn(async () => undefined)
  render(<AccountSettingsSection {...props(signedIn, { signOut, hasRunningTasks: vi.fn(async () => true) })} />)
  fireEvent.click(screen.getByRole('button', { name: 'signOut' }))
  await screen.findByText('signOutConfirm')
  expect(signOut).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'signOutConfirmAction' }))
  await waitFor(() => { expect(signOut).toHaveBeenCalledOnce() })
})

it('signs out directly when no task runs, and treats an unreadable answer as running', async () => {
  const signOut = vi.fn(async () => undefined)
  const first = render(<AccountSettingsSection {...props(signedIn, { signOut })} />)
  fireEvent.click(screen.getByRole('button', { name: 'signOut' }))
  await waitFor(() => { expect(signOut).toHaveBeenCalledOnce() })
  first.unmount()

  render(<AccountSettingsSection {...props(signedIn, {
    signOut, hasRunningTasks: vi.fn(async () => { throw new Error('unreadable') }),
  })} />)
  fireEvent.click(screen.getByRole('button', { name: 'signOut' }))
  await screen.findByText('signOutConfirm')
})

it('completes the first-run prompt once the account is signed in', () => {
  const complete = vi.fn()
  const out = render(<AccountOnboardingPrompt {...props(signedIn, { complete })} />)
  expect(complete).toHaveBeenCalled()
  out.unmount()
  render(<AccountOnboardingPrompt {...props(signedOut, { complete })} />)
  expect(complete).toHaveBeenCalledTimes(1)
})

it('reads an inactive paid plan as the free tier', () => {
  expect(planTier('pro', false)).toBe('free')
  expect(planTier('team', true)).toBe('team')
  expect(planTier(null, true)).toBeUndefined()
})
