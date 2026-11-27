/** QingClaw account surfaces composed from upstream slots: settings page, composer banner and sidebar control. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@qinglion/dsh-client-ui-qingclaw-platform/client'
import { AccountQuotaAction, type AccountQuotaActionInjected } from './AccountQuotaAction.tsx'
import { AccountQuotaBanner, type AccountQuotaBannerInjected } from './AccountQuotaBanner.tsx'
import { AccountOnboardingPrompt, type AccountOnboardingPromptInjected } from './AccountOnboardingPrompt.tsx'
import { AccountSettingsSection, type AccountSettingsInjected } from './AccountSettingsSection.tsx'
import { de, en, es, fr, ja, pt, ru, zh, type AccountKey } from './locales.ts'
import { createQuotaStore } from './quota-store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.account': AccountKey }
}

const NS = 'qingclaw.account'
/** Services required by the account surfaces and their dictionary. */
export const inject = ['slots', 'locale', 'accountUi', 'remote', 'remote.account', 'qingclawPlatform', 'remoteAccess']

/**
 * Register the QingClaw account page and its credit surfaces.
 * @param ctx - client plugin context reading the account service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'qingclaw-account: dictionaries')
  const t = ctx.locale.bind(NS)
  const quota = createQuotaStore(ctx)
  const hooks = {
    account: { getSnapshot: () => quota.getSnapshot(), subscribe: (listener: () => void) => quota.subscribe(listener) },
  }
  void quota.refresh()
  ctx.effect(() => ctx.on('account-ui/change', () => { void quota.refresh() }), 'qingclaw-account: account stream')
  const clientMetadata = () => ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active)
  const openTopUp = () => { ctx.qingclawPlatform.open('top-up', () => { void quota.refresh() }) }
  const openUsage = () => { ctx.qingclawPlatform.open('usage', () => { void quota.refresh() }) }
  // The Desktop host shows the authorization page itself; a browser opens its own tab first,
  // so a popup blocker lets the tab through while the request is still in flight.
  const signIn = async (): Promise<void> => {
    const global = globalThis as typeof globalThis & {
      dshDesktop?: unknown
      __DSH_TRANSPORT__?: { streamBaseUrl?: string }
    }
    const onDesktop = global.dshDesktop !== undefined
    const transport = global.__DSH_TRANSPORT__
    const popup = onDesktop ? undefined : window.open('about:blank', '_blank', 'noopener,noreferrer')
    const result = await ctx.remote.account.startSignIn(
      clientMetadata(),
      onDesktop && transport?.streamBaseUrl !== undefined ? new URL(transport.streamBaseUrl).origin : window.location.origin,
      onDesktop ? 'desktop' : 'web',
    )
    if (!result.ok) { popup?.close(); throw new Error('QingClaw sign-in did not start') }
    const url = result.value.attempt?.authorizeUrl
    if (popup !== null && popup !== undefined && url !== undefined) popup.location.href = url
  }
  const signOut = async (): Promise<void> => {
    const result = await ctx.remote.account.signOut(clientMetadata())
    if (!result.ok) throw new Error('QingClaw sign-out failed')
    await quota.refresh()
  }
  ctx.remoteAccess.whenAccess('account/watch', () => ctx.slots.inject('settings.section', () => ctx.slots.register({
    // The shipped account page owns this cell; this distribution renders its own page there.
    name: 'settings.section', id: 'account', order: -10, priority: -10, label: () => t('nav'), locale: NS,
    inject: (): AccountSettingsInjected => ({
      hooks, signIn, signOut, refresh: () => quota.refresh(), openTopUp, openUsage,
      // An unreadable answer asks before dropping the grant rather than interrupting silently.
      hasRunningTasks: async () => {
        const result = await ctx.remote.account.hasRunningAccountTasks()
        return result.ok ? result.value : true
      },
    }),
  }, AccountSettingsSection)))
  // The upstream introduction is disabled in this distribution, so the first run asks for the
  // account instead; the prompt completes itself once the grant is stored.
  if ((globalThis as typeof globalThis & { dshDesktop?: unknown }).dshDesktop !== undefined) {
    ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
      name: 'settings.onboarding', id: 'qingclaw-account-sign-in', order: -10, locale: NS,
      inject: (): AccountOnboardingPromptInjected => ({ hooks, signIn }),
    }, AccountOnboardingPrompt))
  }
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'qingclaw-account-quota', locale: NS,
    inject: (): AccountQuotaBannerInjected => ({ hooks, openTopUp }),
  }, AccountQuotaBanner))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'qingclaw-account-quota', order: 10, locale: NS,
    inject: (): AccountQuotaActionInjected => ({ hooks, refresh: () => quota.refresh(), openUsage }),
  }, AccountQuotaAction))
}
