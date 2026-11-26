import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import { createElement } from 'react'
import { IconSettingsOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { MobilePairingAction } from './MobilePairingAction.tsx'
import { AdminSection } from './AdminSection.tsx'
import { en, zh } from './locales.ts'

const NS = 'qingclaw.admin'
const PANEL = 'qingclaw-admin' as MainPanelId
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.account', 'accountUi']

/** Register the phone pairing control and the role-gated management panel. @param ctx - client plugin context. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }), 'qingclaw-admin: dictionaries')
  const t = ctx.locale.bind(NS)
  const desktop = (globalThis as typeof globalThis & { dshDesktop?: { mobilePairing?: { open(): Promise<void> } } }).dshDesktop
  const pairing = desktop?.mobilePairing
  if (pairing) {
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action', id: 'qingclaw-connect-phone', order: 20, locale: NS,
      inject: () => ({ openPairing: () => pairing.open() }),
    }, MobilePairingAction))
  }
  ctx.effect(() => {
    let currentId: string | undefined
    let dispose: (() => void) | undefined
    let generation = 0
    let closed = false
    const clear = (): void => { currentId = undefined; dispose?.(); dispose = undefined }
    const refresh = async (): Promise<void> => {
      const sequence = ++generation
      if (ctx.accountUi.getSnapshot().view?.status !== 'credential-stored') { clear(); return }
      const result = await Promise.resolve().then(() => ctx.remote.account.getProfile(
        ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active),
      )).catch(() => undefined)
      if (closed || sequence !== generation) return
      const profile = result?.ok && result.value?.status === 'ready' ? result.value.value : undefined
      if (!profile?.id || profile.role !== 'admin') { clear(); return }
      if (profile.id === currentId) return
      clear()
      const userId = profile.id
      currentId = userId
      const attached = ctx.plugin({
        name: 'qingclaw-admin-account',
        apply(scope: Context) {
          const active = (): boolean => !closed && currentId === userId
          scope.slots.inject('main', () => scope.slots.inject('sidebar.panellist', function* () {
            yield scope.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => ({ role: 'admin' as const, userId }) }, AdminSection)
            yield scope.slots.register({
              name: 'sidebar.panellist', id: PANEL, order: -18, label: () => t('admin'), locale: NS,
            }, ({ size }) => createElement(IconSettingsOutlineRegular, { size }))
          }))
          scope.effect(() => () => { if (!active()) return }, 'qingclaw-admin: scope lifetime')
        },
      })
      dispose = () => { void attached.dispose() }
    }
    const changed = ctx.on('account-ui/change', (_view, reset) => { if (reset) clear(); void refresh() })
    const refreshed = ctx.on('account-ui/refresh', refresh)
    void refresh()
    return () => { closed = true; ++generation; changed(); refreshed(); clear() }
  }, 'qingclaw-admin: signed-in surfaces')
}
