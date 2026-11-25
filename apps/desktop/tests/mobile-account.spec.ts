import { expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account/types'
import { DesktopMobileAccount, registerMobileRoom } from '../src/mobile-account.ts'

const account: PlatformSession = {
  origin: 'https://beta.qingclaw.com', token: 'fixture', userId: null, requestHeaders: { 'x-deployment': 'test' },
}
const parent = {} as BrowserWindow

it('registers at the account issuer and never follows redirects with an account grant', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ room_id: 'room' }))
  await expect(registerMobileRoom(account.origin, account, new AbortController().signal, request)).resolves.toEqual({ room_id: 'room' })
  const [url, init] = request.mock.calls[0]!
  expect(String(url)).toBe('https://beta.qingclaw.com/auth-api/v0/dsh/mobile/rooms')
  expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' })
  expect(new Headers(init?.headers).get('x-dsh-auth-token')).toBe('fixture')
  expect(new Headers(init?.headers).get('x-deployment')).toBe('test')
  for (const domain of ['https://other.invalid', 'https://qingclaw.com', 'http://beta.qingclaw.com']) {
    await expect(registerMobileRoom(domain, account, new AbortController().signal, request)).rejects.toThrow()
  }
  expect(request).toHaveBeenCalledTimes(1)
})

it.each([[404, 'Service unavailable'], [401, 'Sign in required'], [500, 'Connection failed']] as const)(
  'keeps HTTP %i response text out of the public error', async (status, message) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture response', { status }))
    await expect(registerMobileRoom(account.origin, account, new AbortController().signal, request))
      .rejects.toThrow(message)
  })

it('keeps the stored room when the Host session is replaced', async () => {
  const first = { restore: vi.fn(async () => {}), open: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const second = { restore: vi.fn(async () => {}), open: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const create = vi.fn().mockReturnValueOnce(first).mockReturnValue(second)
  const phone = new DesktopMobileAccount(create)
  await expect(phone.open(parent, 'Pair')).rejects.toThrow('Sign in')
  phone.setSession(account)
  await phone.open(parent, 'Pair')
  expect(first.restore).toHaveBeenCalledTimes(1)
  phone.setSession({ ...account })
  expect(first.dispose).not.toHaveBeenCalled()
  phone.setSession({ ...account, token: 'next-fixture' })
  await phone.open(parent, 'Pair')
  expect(first.dispose).toHaveBeenCalledWith({ preserveRoom: true })
  expect(second.restore).toHaveBeenCalledTimes(1)
  expect(second.open).toHaveBeenCalledTimes(1)
  await phone.close({ preserveRoom: true })
  expect(second.dispose).toHaveBeenCalledWith({ preserveRoom: true })
})

it('revokes the room when the account signs out', async () => {
  const pairing = { restore: vi.fn(async () => {}), open: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const phone = new DesktopMobileAccount(() => pairing)
  phone.setSession(account)
  await phone.open(parent, 'Pair')
  phone.setSession(null)
  await phone.close()
  expect(pairing.dispose).toHaveBeenCalledWith({ preserveRoom: false })
})

it('rejects an open that outlived its session', async () => {
  let release!: () => void
  const blocked = new Promise<void>((resolve) => { release = resolve })
  const pairing = {
    restore: vi.fn(async () => {}),
    open: vi.fn(async () => {}),
    dispose: vi.fn(() => blocked),
  }
  const phone = new DesktopMobileAccount(() => pairing)
  phone.setSession(account)
  await phone.open(parent, 'Pair')
  phone.setSession({ ...account, token: 'next-fixture' })
  await vi.waitFor(() => {
    expect(pairing.dispose).toHaveBeenCalledTimes(1)
  })
  const staleOpen = phone.open(parent, 'Pair')
  phone.setSession(null)
  release()
  await expect(staleOpen).rejects.toThrow('Sign in')
  expect(pairing.open).toHaveBeenCalledTimes(1)
})
