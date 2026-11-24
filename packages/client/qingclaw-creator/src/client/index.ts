import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createElement } from 'react'
import { IconCodeOutlineRegular, IconUploadOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { CreatorCenter, type CenterInputs } from './CreatorCenter.tsx'
import { PublishPanel, publishPrompt, type PublishInputs } from './PublishPanel.tsx'
import { en, NS, zh } from './locales.ts'

const PANEL = 'qingclaw-creator' as MainPanelId
const PUBLISH_PANEL = 'qingclaw-publish' as MainPanelId
export const inject = ['locale', 'slots', 'layout', 'remote.account', 'remote', 'accountUi', 'workspaces', 'uiWorkspace']

/** Mount the creator center only for the currently authenticated creator or administrator. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }), 'qingclaw-creator: locale')
  const t = ctx.locale.bind(NS)
  ctx.effect(() => {
    let currentId: string | undefined
    let dispose: (() => void) | undefined
    let generation = 0
    let closed = false
    function clear(): void { currentId = undefined; dispose?.(); dispose = undefined }
    async function refresh(): Promise<void> {
      const sequence = ++generation
      if (ctx.accountUi.getSnapshot().view?.status !== 'credential-stored') { clear(); return }
      const result = await Promise.resolve().then(() => ctx.remote.account.getProfile(
        ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active),
      )).catch(() => undefined)
      if (closed || sequence !== generation) return
      const profile = result?.ok && result.value?.status === 'ready' ? result.value.value : undefined
      if (!profile?.id || (profile.role !== 'creator' && profile.role !== 'admin')) { clear(); return }
      if (profile.id === currentId) return
      clear()
      const userId = profile.id
      currentId = userId
      const attached = ctx.plugin({
        name: 'qingclaw-creator-account',
        apply(scope: Context) {
          const active = () => !closed && currentId === userId
          const inputs: CenterInputs = {
            userId, hooks: { workspaces: scope.workspaces.list },
            resume(workspaceId) {
              if (!active()) return
              scope.uiWorkspace.startSession(workspaceId, { agentPreset: 'cordis' })
            },
          }
          const publish: PublishInputs = {
            hooks: { workspaces: scope.workspaces.list },
            publish(workspace, candidate) {
              if (!active()) return
              scope.uiWorkspace.startSession(workspace.workspaceId, { agentPreset: 'cordis', prompt: publishPrompt(candidate) })
            },
            startWorkspace(workspace) {
              if (!active()) return
              scope.uiWorkspace.startSession(workspace.workspaceId, { agentPreset: 'cordis' })
            },
          }
          scope.slots.inject('main', () => scope.slots.inject('sidebar.panellist', function* () {
            yield scope.slots.register({ name: 'main', key: PANEL, locale: NS, inject: () => inputs }, CreatorCenter)
            yield scope.slots.register({ name: 'sidebar.panellist', id: PANEL, order: -19, label: () => t('center'), locale: NS },
              ({ size }) => createElement(IconCodeOutlineRegular, { size }))
            yield scope.slots.register({ name: 'main', key: PUBLISH_PANEL, locale: NS, inject: () => publish }, PublishPanel)
            yield scope.slots.register({ name: 'sidebar.panellist', id: PUBLISH_PANEL, order: -18, label: () => t('publish'), locale: NS },
              ({ size }) => createElement(IconUploadOutlineRegular, { size }))
          }))
        },
      })
      dispose = () => { void attached.dispose() }
    }
    const changed = ctx.on('account-ui/change', (_view, reset) => { if (reset) clear(); void refresh() })
    const refreshed = ctx.on('account-ui/refresh', refresh)
    void refresh()
    return () => { closed = true; ++generation; changed(); refreshed(); clear() }
  }, 'qingclaw-creator: signed-in surfaces')
}
