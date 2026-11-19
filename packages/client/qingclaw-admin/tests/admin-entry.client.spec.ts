// @vitest-environment jsdom
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { ok } from '@deepseek-ai/dsh-remote-mock'
import { ClientRoster, createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type { AccountDetails, AccountUserId, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import * as adminPlugin from '../src/client/index.ts'
import manifest from '../package.json' with { type: 'json' }

const roster = ClientRoster.of([...webApp.rows, { name: manifest.name, inject: manifest.dsh.client.inject, immediately: false }])
const it = createClientTest({ roster, provide: { [manifest.name]: adminPlugin } })
beforeEach(() => { vi.stubEnv('DSH_CLIENT_VERSION', '0.0.0-test') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const signedOut: AccountView = {
  status: 'signed-out', attempt: null,
  links: { usageUrl: 'https://qingclaw.test/usage', topUpUrl: 'https://qingclaw.test/top_up' },
}
const signedIn: AccountView = { ...signedOut, status: 'credential-stored' }

it('registers the admin section only for an administrator and removes it on sign-out', async ({ start }) => {
  const c = await start()
  const admin: AccountDetails['profile'] = {
    status: 'ready',
    value: {
      id: 'admin-user' as AccountUserId, name: 'Admin', contact: null,
      role: 'admin',
    },
  }
  c.mock.remote.account.getProfile.mockResolvedValue(ok(admin))

  c.mock.streams.push('account/watch', { type: 'snapshot', state: signedIn })
  await vi.waitFor(() => {
    expect(c.ctx.slots.entries('main').find(entry => entry.options.key === 'qingclaw-admin')).toBeDefined()
  })
  const entry = c.ctx.slots.entries('main').find(candidate => candidate.options.key === 'qingclaw-admin')!
  expect(entry.inject?.()).toEqual({ role: 'admin', userId: 'admin-user' })
  const action = c.ctx.slots.entries('settings.launcher.actions').find(row => row.options.id === 'qingclaw-admin')
  const menu = action?.inject?.() as { role: string; openPanel: () => void }
  expect(menu.role).toBe('admin')
  menu.openPanel()
  expect(c.ctx.layout.panelInfo.getSnapshot().activePanelId).toBe('qingclaw-admin')
  expect(c.ctx.slots.entries('settings.section').some(row => row.options.id === 'qingclaw-admin')).toBe(false)

  c.mock.streams.push('account/watch', { type: 'credentials-changed', state: signedOut })
  await vi.waitFor(() => {
    expect(c.ctx.slots.entries('main').some(candidate => candidate.options.key === 'qingclaw-admin')).toBe(false)
    expect(c.ctx.slots.entries('settings.launcher.actions').some(row => row.options.id === 'qingclaw-admin')).toBe(false)
  })
}, 120_000)

it('keeps native phone pairing available to ordinary users alongside their account', async ({ start }) => {
  const open = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('dshDesktop', { mobilePairing: { open } })
  const c = await start()
  c.mock.remote.account.getProfile.mockResolvedValue(ok({
    status: 'ready',
    value: { id: 'ordinary-user' as AccountUserId, name: 'User', contact: null, role: 'user' },
  }))
  c.mock.streams.push('account/watch', { type: 'snapshot', state: signedIn })
  await vi.waitFor(() => { expect(c.mock.remote.account.getProfile).toHaveBeenCalled() })
  const entry = c.ctx.slots.entries('settings.launcher.tools').find(row => row.options.id === 'qingclaw-connect-phone')
  expect(entry?.options.order).toBe(20)
  await (entry?.inject?.() as { openPairing(): Promise<void> }).openPairing()
  expect(open).toHaveBeenCalledOnce()
  expect(c.ctx.slots.entries('main').some(entry => entry.options.key === 'qingclaw-admin')).toBe(false)
  expect(c.ctx.slots.entries('settings.launcher.actions').some(entry => entry.options.id === 'qingclaw-admin')).toBe(false)
}, 120_000)

it('registers Creator center for a creator account', async ({ start }) => {
  const c = await start()
  c.mock.remote.account.getProfile.mockResolvedValue(ok({
    status: 'ready',
    value: { id: 'creator' as AccountUserId, name: null, contact: null, role: 'creator' },
  }))
  c.mock.streams.push('account/watch', { type: 'snapshot', state: signedIn })
  await vi.waitFor(() => {
    const entry = c.ctx.slots.entries('main').find(candidate => candidate.options.key === 'qingclaw-admin')
    expect(entry?.inject?.()).toEqual({ role: 'creator', userId: 'creator' })
  })
}, 120_000)
