import { randomUUID } from 'node:crypto'
import { BrowserWindow, nativeTheme, type WebContents } from 'electron'
import type { RemoteMobileBridge } from './mobile/remote-mobile-bridge.ts'

type PairingBridge = Pick<RemoteMobileBridge, 'start' | 'stop' | 'createDesktopUrl' | 'snapshot'>

/** The QR and its management cookie stay inside a sandboxed, loopback-only window. */
export class MobilePairingWindow {
  private window?: BrowserWindow | undefined
  private opening?: Promise<void> | undefined
  private stopping?: Promise<void> | undefined
  private disposed = false

  constructor(private readonly bridge: PairingBridge) {}

  open(parent: BrowserWindow, title: string): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Pairing has stopped'))
    if (this.opening) return this.opening
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return Promise.resolve()
    }
    this.opening = this.create(parent, title).finally(() => { this.opening = undefined })
    return this.opening
  }

  private stop(): Promise<void> {
    this.stopping ??= this.bridge.stop().finally(() => { this.stopping = undefined })
    return this.stopping
  }

  private async create(parent: BrowserWindow, title: string): Promise<void> {
    try {
      if (this.stopping) await this.stopping
      if (this.disposed || parent.isDestroyed()) throw new Error('Pairing unavailable')
      await this.bridge.start()
      const bootstrap = this.bridge.createDesktopUrl()
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while the bridge starts.
      if (this.disposed || parent.isDestroyed() || !bootstrap) throw new Error('Pairing unavailable')
      const local = new URL(bootstrap)
      if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.pathname !== '/desktop') {
        throw new Error('Invalid pairing origin')
      }
      const win = new BrowserWindow({
        parent, width: 420, height: 252, minWidth: 340, useContentSize: true, title, show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#141416' : '#ffffff',
        webPreferences: {
          partition: 'qingclaw-pairing-' + randomUUID(), sandbox: true, contextIsolation: true,
          nodeIntegration: false, webSecurity: true, devTools: false, enablePreferredSizeMode: true,
        },
      })
      this.window = win
      // Fit the scanned/paired state as well as the taller QR, without changing the user's chosen width.
      win.webContents.on('preferred-size-changed', (_event, size) => {
        const [width, current] = win.getContentSize()
        const height = Math.max(200, Math.min(600, size.height))
        if (width && height !== current) win.setContentSize(width, height)
      })
      win.on('page-title-updated', (event) => { event.preventDefault() })
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-attach-webview', (event) => { event.preventDefault() })
      const canCopy = (contents: WebContents | null, permission: string, from: string) => {
        if (permission !== 'clipboard-sanitized-write' || contents !== win.webContents) return false
        const document = URL.parse(contents.getURL())
        return document?.origin === local.origin && document.pathname === '/desktop' && URL.parse(from)?.origin === local.origin
      }
      win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
        callback(details.isMainFrame && canCopy(contents, permission, details.requestingUrl))
      })
      win.webContents.session.setPermissionCheckHandler((contents, permission, origin, details) =>
        !details.embeddingOrigin && canCopy(contents, permission, origin))
      win.webContents.on('will-navigate', (event, url) => {
        const destination = URL.parse(url)
        if (destination?.origin !== local.origin || destination.pathname !== '/desktop') event.preventDefault()
      })
      win.on('closed', () => {
        if (this.window === win) this.window = undefined
        const room = this.bridge.snapshot()
        if (!this.disposed && !room.paired && !room.denied) void this.stop().catch(() => undefined)
      })
      await win.loadURL(bootstrap)
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
    } catch {
      if (this.window && !this.window.isDestroyed()) this.window.destroy()
      await this.stop().catch(() => undefined)
      // Electron loadURL errors may contain the local bootstrap secret.
      throw new Error('Could not open the phone pairing window')
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    await this.opening?.catch(() => undefined)
    await this.stop()
  }
}
