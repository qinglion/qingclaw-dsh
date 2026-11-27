/** Distribution-only IPC channels: page capture and the completion badge. */
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { DESKTOP_IPC, SCHEME } from './ipc.ts'
import { capturePageRegion } from './page-capture.ts'
import type { DesktopAppBadge } from './app-badge.ts'

/** What these channels read from the shell they belong to. */
export interface ExtrasDeps {
  /** Live window whose renderer owns the channels, or undefined before one exists. */
  readonly mainWindow: () => BrowserWindow | undefined
  /** Whether an invocation came from this app's product renderer. */
  readonly assertProductSender: (event: IpcMainInvokeEvent) => BrowserWindow
  /** Badge owned by the shell; the page only reports the unread count. */
  readonly badge: DesktopAppBadge
}

/**
 * Install the screenshot and completion-badge channels.
 * @param deps - the window, the sender guard and the badge to drive.
 */
export function installQingclawExtras(deps: ExtrasDeps): void {
  ipcMain.handle(DESKTOP_IPC.capturePageRegion, (event, region: unknown) =>
    capturePageRegion(deps.assertProductSender(event), region))
  ipcMain.on(DESKTOP_IPC.attentionBadge, (event, count: unknown) => {
    const window = deps.mainWindow()
    if (window === undefined || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame
      || !event.senderFrame.url.startsWith(`${SCHEME}://app/`)) return
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return
    deps.badge.set(count)
  })
}
