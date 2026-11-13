/** Source-safe lifecycle for the QingClaw Workbench Remote and its two slot contributions. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@qinglion/dsh-qingclaw-workbench/remote'
import { WorkbenchPage, type WorkbenchPageInjected } from './WorkbenchPage.tsx'
import { WorkbenchPanelIcon } from './WorkbenchPanelIcon.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.ts'

/** Shared id used by the sidebar entry and its main panel. */
export const PANEL_ID = 'qingclaw-workbench' as MainPanelId

/** Register dictionaries and declaration-aware sidebar/main occupants. */
export function registerWorkbenchUi(ctx: Context): void {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }),
    'qingclaw-workbench: dictionaries',
  )
  const t = ctx.locale.bind(NS)
  const injected = (): WorkbenchPageInjected => ({
    loadFeed: async (refresh) => {
      const result = await ctx.remote.qingclawWorkbench.getFeed(refresh)
      if (!result.ok) throw result.error
      return result.value
    },
  })
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
  const ui = ctx.inject(['remote.qingclawWorkbench', 'slots', 'locale'], registerWorkbenchUi)
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
