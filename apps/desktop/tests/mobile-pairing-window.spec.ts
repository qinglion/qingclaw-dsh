import { EventEmitter } from 'node:events'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { beforeEach, expect, it, vi } from 'vitest'
import { MobilePairingWindow } from '../src/mobile-pairing-window.ts'
import type { RemoteMobileBridgeSnapshot } from '../src/mobile/remote-mobile-bridge.ts'

const windows: TestWindow[] = []
const bootstrap = 'http://127.0.0.1:34001/desktop?k=fixture'
class TestWindow extends EventEmitter {
  readonly show = vi.fn()
  readonly focus = vi.fn()
  readonly getContentSize = vi.fn(() => [420, 252])
  readonly setContentSize = vi.fn()
  readonly loadURL = vi.fn().mockResolvedValue(undefined)
  readonly webContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(),
    getURL: vi.fn(() => 'http://127.0.0.1:34001/desktop'),
    session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
  })
  destroyed = false
  constructor(readonly options?: BrowserWindowConstructorOptions) {
    super()
    if (options) windows.push(this)
  }
  isDestroyed() { return this.destroyed }
  destroy() { this.destroyed = true; this.emit('closed') }
}
vi.mock('electron', () => ({ get BrowserWindow() { return TestWindow }, nativeTheme: { shouldUseDarkColors: false } }))

function kit() {
  const snapshot = { running: true, paired: false } as RemoteMobileBridgeSnapshot
  const bridge = { start: vi.fn().mockResolvedValue(snapshot), stop: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn(() => snapshot), createDesktopUrl: vi.fn(() => bootstrap) }
  const parent = new TestWindow() as unknown as BrowserWindow
  return { parent, bridge, pairing: new MobilePairingWindow(bridge) }
}
beforeEach(() => { windows.length = 0 })

it('opens one isolated local management page only after the desktop requests it', async () => {
  const { bridge, pairing, parent } = kit()
  expect(bridge.start).not.toHaveBeenCalled()
  await Promise.all([pairing.open(parent, '连接手机'), pairing.open(parent, '连接手机')])
  expect(bridge.start).toHaveBeenCalledTimes(1)
  expect(windows).toHaveLength(1)
  const win = windows[0]!
  expect(win.options?.webPreferences).toMatchObject({ partition: expect.stringMatching(/^qingclaw-pairing-/),
    sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false })
  expect(win.options?.webPreferences).not.toHaveProperty('preload')
  expect(win.loadURL).toHaveBeenCalledWith(bootstrap)
  expect(win.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' })
  for (const url of ['https://example.com/desktop', 'http://127.0.0.1:34001/pair', 'invalid']) {
    const evt = { preventDefault: vi.fn() }
    win.webContents.emit('will-navigate', evt, url)
    expect(evt.preventDefault).toHaveBeenCalledTimes(1)
  }
  const check = win.webContents.session.setPermissionCheckHandler.mock.calls[0]![0]
  const origin = 'http://127.0.0.1:34001'
  expect(check(win.webContents, 'clipboard-sanitized-write', origin, {})).toBe(true)
  expect(check(win.webContents, 'clipboard-read', origin, {})).toBe(false)
  expect(check(win.webContents, 'clipboard-sanitized-write', 'https://example.com', {})).toBe(false)
  expect(check(win.webContents, 'clipboard-sanitized-write', origin, { embeddingOrigin: 'https://example.com' })).toBe(false)
  const local = { preventDefault: vi.fn() }
  win.webContents.emit('will-navigate', local, 'http://127.0.0.1:34001/desktop')
  expect(local.preventDefault).not.toHaveBeenCalled()
  await pairing.open(parent, '连接手机')
  expect(windows).toHaveLength(1)
  expect(win.focus).toHaveBeenCalledTimes(2)
  await pairing.dispose()
})

it('fits short connection states and the QR page without changing the window width', async () => {
  const { pairing, parent } = kit()
  await pairing.open(parent, '连接手机')
  const win = windows[0]!
  expect(win.options?.webPreferences?.enablePreferredSizeMode).toBe(true)
  win.webContents.emit('preferred-size-changed', {}, { width: 100, height: 235 })
  win.webContents.emit('preferred-size-changed', {}, { width: 900, height: 1200 })
  expect(win.setContentSize.mock.calls).toEqual([[420, 235], [420, 600]])
  await pairing.dispose()
})

it('lets a paired phone continue after the window closes and disconnects it when the app exits', async () => {
  const { bridge, pairing, parent } = kit()
  await pairing.open(parent, '连接手机')
  bridge.snapshot.mockReturnValue({ ...bridge.snapshot(), paired: true } as RemoteMobileBridgeSnapshot)
  windows[0]!.destroy()
  expect(bridge.stop).not.toHaveBeenCalled()
  await pairing.dispose()
  expect(bridge.stop).toHaveBeenCalledTimes(1)
  await expect(pairing.open(parent, '连接手机')).rejects.toThrow()
})

it('waits for an abandoned listener to finish stopping before opening the next QR', async () => {
  const { bridge, pairing, parent } = kit()
  await pairing.open(parent, '连接手机')
  let finish!: () => void
  bridge.stop.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  windows[0]!.destroy()
  const reopening = pairing.open(parent, '连接手机')
  expect(bridge.start).toHaveBeenCalledTimes(1)
  finish()
  await reopening
  expect(bridge.start).toHaveBeenCalledTimes(2)
  expect(windows).toHaveLength(2)
  await pairing.dispose()
})

it('keeps the bootstrap credential out of errors returned to the caller', async () => {
  const { bridge, pairing, parent } = kit()
  bridge.createDesktopUrl.mockReturnValue('https://example.com/desktop?k=fixture')
  await expect(pairing.open(parent, '连接手机')).rejects.toThrow(/^Could not open the phone pairing window$/)
  expect(windows).toHaveLength(0)
  expect(bridge.stop).toHaveBeenCalledTimes(1)
})
