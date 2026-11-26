/** QingClaw website pages opened inside the application when the host owns a native view. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'

/** Destinations the QingClaw website serves for this distribution. */
export type QingClawPlatformPage = 'top-up' | 'usage'

/** In-app website surface shared by the QingClaw plugins. */
export interface QingClawPlatform {
  /**
   * Show one QingClaw website page.
   * A host with the native Platform view shows it inside the application; any
   * other host opens a browser tab, which is the only place it can render.
   * @param page - destination to show.
   * @param onReturned - runs when the viewer comes back from that page.
   */
  open(page: QingClawPlatformPage, onReturned?: () => void): void
}

declare module '@deepseek-ai/cordis' {
  interface Context { qingclawPlatform: QingClawPlatform }
}

/** Services this plugin reads; the account plugin owns the Platform host. */
export const inject = ['accountUi']

/**
 * Register the in-app QingClaw website surface.
 * @param ctx - client plugin context reading the account's Platform host.
 */
export function apply(ctx: Context): void {
  const open: QingClawPlatform['open'] = (page, onReturned) => {
    const native = ctx.accountUi.openPlatformPage
    if (native !== undefined) {
      native(page, (reason) => { if (reason === 'returned') onReturned?.() })
      return
    }
    const links = ctx.accountUi.getSnapshot().view?.links
    const url = page === 'top-up' ? links?.topUpUrl : links?.usageUrl
    if (url === undefined || url === '') return
    window.open(url, '_blank', 'noopener,noreferrer')
    if (onReturned === undefined) return
    // A browser tab cannot report its own return, so the window's next focus is the viewer coming back.
    const focus = (): void => { window.removeEventListener('focus', focus); onReturned() }
    window.addEventListener('focus', focus)
  }
  ctx.provide('qingclawPlatform', { open })
}
