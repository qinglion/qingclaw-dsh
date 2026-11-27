/** Browser half of the QingClaw entitlement gate: the upgrade prompt for a lapsed enable attempt. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@qinglion/dsh-client-ui-qingclaw-platform/client'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import type { UpgradeRequired } from '../events.ts'
import { UpgradeDialog } from './UpgradeDialog.tsx'
import { en, zh } from './locales.ts'
import { createUpgradeSource } from './upgrade-source.ts'

/** Services the prompt needs. */
export const inject = ['slots', 'locale', 'remote']

/**
 * Register dictionaries and the upgrade prompt overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('qingclaw.entitlement', { zh, en }), 'qingclaw-entitlement: dictionaries')
  const source = createUpgradeSource()
  let activeRequest: UpgradeRequired | undefined
  let dismissedAt: number | undefined
  let poll: ReturnType<typeof setInterval> | undefined

  const stopPoll = (): void => {
    if (poll === undefined) return
    clearInterval(poll)
    poll = undefined
  }

  /** While the prompt is open, and for five minutes after it closes, retry the enable once the licence is active. */
  const confirmPayment = async (): Promise<void> => {
    const request = activeRequest
    if (request === undefined) return
    if (dismissedAt !== undefined && Date.now() - dismissedAt > 5 * 60_000) {
      stopPoll()
      activeRequest = undefined
      return
    }
    try {
      const entitlement = await ctx.remote.qingclawWorkbench.getEntitlement()
      if (!entitlement.ok || !entitlement.value.active) return
    } catch {
      return
    }
    stopPoll()
    await ctx.remote.pluginManager.setBundleEnabled(request.packageName, true).catch(() => undefined)
  }

  const startPoll = (): void => {
    if (poll !== undefined) return
    void confirmPayment()
    poll = setInterval(() => { void confirmPayment() }, 5_000)
  }

  const dismiss = (): void => {
    dismissedAt = Date.now()
    source.dismiss()
  }

  const openUpgrade = (): void => {
    // Keep polling while the payment page is open; its close starts the five-minute tail.
    source.dismiss()
    const platform = ctx.get('qingclawPlatform')
    if (platform !== undefined) platform.open('top-up', () => { dismissedAt = Date.now() })
    else {
      window.open('https://qingclaw.com/top_up', '_blank', 'noopener')
      dismissedAt = Date.now()
    }
  }
  ctx.effect(() => ctx.remote.$on('qingclaw-entitlement/upgrade-required', (request) => {
    activeRequest = request
    dismissedAt = undefined
    source.show(request)
    startPoll()
  }), 'qingclaw-entitlement: upgrade requests')
  ctx.effect(() => () => { stopPoll() }, 'qingclaw-entitlement: payment watch')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'qingclaw-entitlement.upgrade', locale: 'qingclaw.entitlement',
    inject: () => ({ hooks: { request: source.request }, dismiss, openUpgrade }),
  }, UpgradeDialog))
}
