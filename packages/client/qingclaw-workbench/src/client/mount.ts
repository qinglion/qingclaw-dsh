/** Source-safe lifecycle for the QingClaw Workbench Remote and its three slot contributions. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@qinglion/dsh-client-ui-qingclaw-platform/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import { WorkbenchPage, type WorkbenchPageInjected } from './WorkbenchPage.tsx'
import { WorkbenchNoticeToast, type WorkbenchNoticeInjected } from './WorkbenchNoticeToast.tsx'
import { WorkbenchPanelIcon } from './WorkbenchPanelIcon.tsx'
import { en, NS, zh } from './locales.ts'
import { createWorkbenchPluginStore } from './workbench-plugin-store.ts'

/** Shared id used by the sidebar entry and its main panel. */
export const PANEL_ID = 'qingclaw-workbench' as MainPanelId

/** Register dictionaries, the sidebar/main pair, and the overlay that reports operation failures.
 * @param ctx - client plugin context supplying the Remote, slots, locale, and the account page channel.
 */
export function registerWorkbenchUi(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }),
    'qingclaw-workbench: dictionaries',
  )
  const t = ctx.locale.bind(NS)
  const pluginStore = createWorkbenchPluginStore(ctx)
  ctx.effect(() => () => { pluginStore.dispose() }, 'qingclaw-workbench: catalog')
  const injected = (): WorkbenchPageInjected => ({
    pluginStore,
    hooks: { locale: ctx.locale },
    openSubscriptionPage: (onReturned) => { ctx.qingclawPlatform.open('top-up', onReturned) },
  })
  // Failures outlive the market panel, so the shell overlay owns their toast.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'qingclaw-workbench-notice',
    locale: NS,
    inject: (): WorkbenchNoticeInjected => ({
      hooks: { notice: { getSnapshot: () => pluginStore.notice(), subscribe: pluginStore.subscribe } },
      dismissNotice: () => { pluginStore.dismissNotice() },
    }),
  }, WorkbenchNoticeToast))
  // Keep the navigation entry and its target transactional across late slot declarations.
  ctx.slots.inject('main', () => ctx.slots.inject('sidebar.panellist', function* () {
    yield ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      inject: injected,
    }, WorkbenchPage)
    yield ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: -20,
      label: () => t('panel'),
      locale: NS,
    }, WorkbenchPanelIcon)
  }))
}

/** Mount this bundle-local Remote contribution, then install UI once its namespace exists. */
export async function mountWorkbench(
  ctx: Context,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(
    ['remote.qingclawWorkbench', 'remote.pluginManager', 'accountUi', 'layout', 'slots', 'locale'],
    registerWorkbenchUi,
  )
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
