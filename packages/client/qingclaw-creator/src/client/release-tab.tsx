import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PluginProject } from '../project-types.ts'
import { getWorkspaceProjects } from './project-api.ts'
import { ReleaseView } from './ReleaseView.tsx'
import { en, releaseNamespace, zh } from './release-locales.ts'

/** Both a clicked release and a user-authored request invoke this ordinary Session skill. */
export function releasePrompt(project: PluginProject): string {
  const target = JSON.stringify({ directory: project.directory, packageName: project.name, version: project.version })
  return '请使用 qingclaw-plugin-publish 技能，将当前工作区中指定的包版本发布到青狮 npm 私服。目标包信息：' + target
}

export function registerReleaseTab(ctx: Context): () => void {
  const offLocale = ctx.locale.register(releaseNamespace, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en })
  const translate = ctx.locale.bind(releaseNamespace)
  const offView = ctx.slots.inject('conversation.view', () => {
    let workspaceId: string | undefined
    let cached: PluginProject[] = []
    let pending: AbortController | undefined
    let removeTab: (() => void) | undefined
    let disposed = false
    const lifetime = new AbortController()
    const mainWorkspace = () => {
      const sessions = ctx.sessions.list.getSnapshot().byId
      const selected = Object.values(sessions).find(row => (row.retainedBy.mainView ?? 0) > 0)
      if (!selected) return
      const workspaces = ctx.workspaces.list.getSnapshot().items
      const workspace = workspaces.find(item => item.sessionIds.includes(selected.id))
        ?? workspaces.find(item => item.path === selected.cwd)
      return workspace && { workspace, session: selected.id }
    }
    function clearTab(): void {
      removeTab?.()
      removeTab = undefined
      cached = []
    }
    function updateTab(projects: PluginProject[], id: string): void {
      if (JSON.stringify(projects) === JSON.stringify(cached)) return
      clearTab()
      cached = projects
      if (!projects.length) return
      removeTab = ctx.slots.register({
        name: 'conversation.view', id: 'qingclaw-release', order: 8, locale: releaseNamespace, supportsBlankSession: true,
        label: () => translate('release'),
        inject: (sessionId: SessionId) => ({
          projects, workspaceId: id, workspace: ctx.workspaces.list.getSnapshot().items.find(item => item.workspaceId === id),
          publish: async (project: PluginProject) => {
            const isCurrent = () => {
              const current = mainWorkspace()
              return !disposed && current?.workspace.workspaceId === id && current.session === sessionId
            }
            if (!isCurrent()) throw new Error('changed')
            const checked = await getWorkspaceProjects(id, lifetime.signal)
            if (!isCurrent() || !checked.some(item => item.name === project.name
              && item.version === project.version && item.directory === project.directory)) throw new Error('changed')
            const session = ctx.sessions.binding(sessionId)?.session
            if (!session) throw new Error('changed')
            const result = await session.prompt([{ type: 'text', text: releasePrompt(project) }], 'queue')
            if (!result.ok) throw new Error('sendFailed')
          },
        }),
      }, ReleaseView)
    }
    const check = async (force: boolean) => {
      if (disposed) return
      const id = mainWorkspace()?.workspace.workspaceId
      if (id !== workspaceId) {
        pending?.abort()
        pending = undefined
        clearTab()
        workspaceId = id
      } else if (!force || pending) return
      if (!id) return
      const request = new AbortController()
      pending = request
      try {
        const projects = await getWorkspaceProjects(id, request.signal)
        if (!request.signal.aborted && workspaceId === id) updateTab(projects, id)
      } catch {
        if (!request.signal.aborted && workspaceId === id) clearTab()
      } finally {
        if (pending === request) pending = undefined
      }
    }
    const onChange = () => { void check(false) }
    const refresh = () => { if (!document.hidden) void check(true) }
    const offSession = ctx.sessions.list.subscribe(onChange)
    const offWorkspace = ctx.workspaces.list.subscribe(onChange)
    const interval = window.setInterval(refresh, 20000)
    window.addEventListener('focus', refresh)
    void check(true)
    return () => {
      disposed = true
      lifetime.abort()
      pending?.abort()
      offSession()
      offWorkspace()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      clearTab()
    }
  })
  return () => { offView(); offLocale() }
}
