import { afterEach, expect, it, vi } from 'vitest'
import { DesktopAppBadge } from '../src/app-badge.ts'

const native = await vi.hoisted(async () => ({
  dock: { setBadge: vi.fn<(text: string) => void>() },
  setBadgeCount: vi.fn(() => true),
}))
vi.mock('electron', () => ({ app: { dock: native.dock, setBadgeCount: native.setBadgeCount } }))

afterEach(() => { vi.clearAllMocks() })

it('badges the macOS Dock icon with the unread count and caps the text', () => {
  const badge = new DesktopAppBadge('darwin')
  badge.set(0)
  badge.set(3)
  badge.set(3)
  badge.set(120)
  badge.set(4)
  expect(native.dock.setBadge.mock.calls.map(([text]) => text)).toEqual(['', '3', '99+', '4'])
})

it('clears the Dock badge', () => {
  const badge = new DesktopAppBadge('darwin')
  badge.set(2)
  badge.clear()
  badge.clear()
  expect(native.dock.setBadge.mock.calls.map(([text]) => text)).toEqual(['2', ''])
})

it('counts on Linux launchers and draws nothing where no counter exists', () => {
  new DesktopAppBadge('linux').set(2)
  expect(native.setBadgeCount).toHaveBeenCalledWith(2)
  vi.clearAllMocks()
  new DesktopAppBadge('win32').set(2)
  expect(native.dock.setBadge).not.toHaveBeenCalled()
  expect(native.setBadgeCount).not.toHaveBeenCalled()
})

it('reports a missing native badge without failing the reporter', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  native.dock.setBadge.mockImplementationOnce(() => { throw new Error('no Dock') })
  expect(() => { new DesktopAppBadge('darwin').set(1) }).not.toThrow()
  expect(warn).toHaveBeenCalledOnce()
  warn.mockRestore()
})
