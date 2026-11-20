import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { MobilePairingAction } from './MobilePairingAction.tsx'
import { AdminSection } from './AdminSection.tsx'
import { AdminMenuItem } from './AdminMenuItem.tsx'
import { en, zh } from './locales.ts'

const NS = 'qingclaw.admin'
const PANEL = 'qingclaw-admin' as MainPanelId
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.account', 'accountUi']

/** Register the account action and its dedicated panel while the website grants access. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }), 'qingclaw-admin: dictionaries')
  const desktop = (globalThis as typeof globalThis & { dshDesktop?: { mobilePairing?: { open(): Promise<void> } } }).dshDesktop
  const pairing = desktop?.mobilePairing
  if (pairing) {
    ctx.slots.inject('settings.launcher.tools', () => ctx.slots.register({
      name: 'settings.launcher.tools', id: 'qingclaw-connect-phone', order: 20, locale: NS,
      inject: () => ({ openPairing: () => pairing.open() }),
    }, MobilePairingAction))
  }
  ctx.slots.inject('main', () => ctx.slots.inject('settings.launcher.actions', () => {
    let clearEntry: (() => void) | undefined
    let identity: string | undefined
    let generation = 0
    let disposed = false

    const clear = () => {
      clearEntry?.()
      clearEntry = undefined
      identity = undefined
    }
    const refresh = async () => {
      const current = ++generation
      if (ctx.accountUi.getSnapshot().view?.status !== 'credential-stored') {
        clear()
        return
      }
      const result = await Promise.resolve().then(() =>
        ctx.remote.account.getProfile(ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active))).catch(() => undefined)
      if (disposed || current !== generation) return
      const profile = result?.ok && result.value?.status === 'ready' ? result.value.value : undefined
      const role = profile?.role
      if (!profile || role !== 'admin') { clear(); return }
      const key = JSON.stringify([profile.id, role])
      if (identity === key) return
      clear()
      const removePanel = ctx.slots.register({
        name: 'main', key: PANEL, locale: NS, inject: () => ({ role, userId: profile.id }),
      }, AdminSection)
      const removeMenu = ctx.slots.register({
        name: 'settings.launcher.actions', id: 'qingclaw-admin', locale: NS,
        inject: () => ({ role, openPanel: () => ctx.layout.selectPanel(PANEL) }),
      }, AdminMenuItem)
      identity = key
      clearEntry = () => { removeMenu(); removePanel() }
    }
    const offAccount = ctx.on('account-ui/change', (_state, reset) => { if (reset) clear(); void refresh() })
    const offRefresh = ctx.on('account-ui/refresh', refresh)
    void refresh()
    return () => { disposed = true; generation++; offAccount(); offRefresh(); clear() }
  }))
}
