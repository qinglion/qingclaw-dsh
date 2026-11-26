/** QingClaw credit surfaces composed from upstream slots: composer banner and sidebar control. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@qinglion/dsh-client-ui-qingclaw-platform/client'
import { AccountQuotaAction, type AccountQuotaActionInjected } from './AccountQuotaAction.tsx'
import { AccountQuotaBanner, type AccountQuotaBannerInjected } from './AccountQuotaBanner.tsx'
import { de, en, es, fr, ja, pt, ru, zh, type AccountKey } from './locales.ts'
import { createQuotaStore } from './quota-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.account': AccountKey }
}

const NS = 'qingclaw.account'
/** Services required by the credit surfaces and their dictionary. */
export const inject = ['slots', 'locale', 'accountUi', 'remote', 'remote.account', 'qingclawPlatform']

/**
 * Register the credit banner beside the composer and the quota control in the sidebar footer.
 * @param ctx - client plugin context reading the account service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'qingclaw-account: dictionaries')
  const quota = createQuotaStore(ctx)
  const hooks = {
    account: { getSnapshot: () => quota.getSnapshot(), subscribe: (listener: () => void) => quota.subscribe(listener) },
  }
  void quota.refresh()
  ctx.effect(() => ctx.on('account-ui/change', () => { void quota.refresh() }), 'qingclaw-account: account stream')
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'qingclaw-account-quota', locale: NS,
    inject: (): AccountQuotaBannerInjected => ({
      hooks,
      openTopUp: () => { ctx.qingclawPlatform.open('top-up', () => { void quota.refresh() }) },
    }),
  }, AccountQuotaBanner))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'qingclaw-account-quota', order: 10, locale: NS,
    inject: (): AccountQuotaActionInjected => ({
      hooks,
      refresh: () => quota.refresh(),
      openUsage: () => { ctx.qingclawPlatform.open('usage', () => { void quota.refresh() }) },
    }),
  }, AccountQuotaAction))
}
