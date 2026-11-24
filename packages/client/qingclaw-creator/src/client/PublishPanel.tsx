import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { getWorkspacePublishCandidates } from './project-api.ts'
import type { PublishCandidate } from '../project-types.ts'
import type { NS } from './locales.ts'
import css from './CreatorCenter.module.css'

export interface PublishWorkspace { workspaceId: WorkspaceId; title: string }

/** What the publish panel calls into: the sidebar list and the publish actions. */
export interface PublishInputs {
  hooks: { workspaces: HostObservable<WorkspaceSnapshot> }
  publish(workspace: PublishWorkspace, candidate: PublishCandidate): void
  startWorkspace(workspace: PublishWorkspace): void
}

/** The request one publish action sends to a new conversation. */
export function publishPrompt(candidate: PublishCandidate): string {
  const target = JSON.stringify({
    directory: candidate.directory, packageName: candidate.project.name, version: candidate.project.version,
  })
  return '请使用 qingclaw-plugin-publish 技能，将当前工作区中指定目录的包版本发布到青狮 npm 私服。目标包信息：' + target
}

interface Group { workspace: PublishWorkspace; candidates: PublishCandidate[] }

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<PublishInputs>

/**
 * Publish panel: every plugin package the registered workspaces hold, so a
 * collection workspace offers its own subdirectories. One action starts a
 * conversation that publishes the chosen package through the skill.
 */
export function PublishPanel({ useWorkspaces, publish, startWorkspace, t }: Pick<Props, 'useWorkspaces' | 'publish' | 'startWorkspace' | 't'>) {
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [groups, setGroups] = useState<Group[]>([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setFailed(false)
    void (async () => {
      const result: Group[] = []
      let errors = false
      for (const workspace of workspaces) {
        if (controller.signal.aborted) return
        try {
          const candidates = await getWorkspacePublishCandidates(workspace.workspaceId, controller.signal)
          if (candidates.length) result.push({ workspace, candidates })
        } catch { errors = true }
      }
      if (!controller.signal.aborted) { setGroups(result); setLoading(false); setFailed(errors) }
    })()
    return () => { controller.abort() }
  }, [workspaces, revision])
  return <section className={css.body}>
    <div className={css.sectionHead}><h2>{t('publish')}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => { refresh(n => n + 1) }}>{t('reload')}</Button></div>
    {failed && <p role="alert">{t('scanFailed')}</p>}
    {loading ? <p>{t('loading')}</p> : groups.length ? groups.map(group => <div key={group.workspace.workspaceId}>
      <p className={css.muted}>{group.workspace.title}</p>
      <ul className={css.list}>{group.candidates.map(candidate => <li className={css.row} key={candidate.directory}>
        <div>
          <button className={css.package} onClick={() => { startWorkspace(group.workspace) }}>{candidate.project.title}</button>
          <p className={css.muted}>{candidate.project.name} · {candidate.directory}</p>
        </div>
        <div className={css.actions}><code>{candidate.project.version}</code>
          <Button variant="outline" onClick={() => { publish(group.workspace, candidate) }}>{t('publish')}</Button></div>
      </li>)}</ul>
    </div>) : <p className={css.muted}>{t('publishEmpty')}</p>}
  </section>
}
