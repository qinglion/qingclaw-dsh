import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { getWorkspacePluginState } from './project-api.ts'
import type { PluginProject } from '../project-types.ts'
import { CreatorNotice } from './Notice.tsx'
import type { NS } from './locales.ts'
import css from './CreatorCenter.module.css'

export interface CreatorWorkspace { workspaceId: WorkspaceId; title: string }

interface Row {
  readonly workspace: CreatorWorkspace
  readonly project?: PluginProject
}

/**
 * One row per registered workspace with the plugin its root manifest declares,
 * if any. The row is discovery only: publishing is offered to the creator in
 * every session, so a collection workspace publishes from its subdirectories.
 */
export function LocalProjects({ workspaces, resume, t }: {
  workspaces: readonly CreatorWorkspace[]
  resume: (workspace: WorkspaceId) => void
  t: TranslateNS<typeof NS>
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setFailed(false)
    void (async () => {
      const result: Row[] = []
      let errors = false
      for (const workspace of workspaces) {
        if (controller.signal.aborted) return
        try {
          const state = await getWorkspacePluginState(workspace.workspaceId, controller.signal)
          result.push({ workspace, ...(state.project && { project: state.project }) })
        } catch { errors = true }
      }
      if (!controller.signal.aborted) { setRows(result); setLoading(false); setFailed(errors) }
    })()
    return () => { controller.abort() }
  }, [workspaces, revision])
  return <section className={css.body}>
    <div className={css.sectionHead}><h2>{t('local')}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => { refresh(n => n + 1) }}>{t('reload')}</Button></div>
    {failed && <CreatorNotice tone="error" title={t('noticeReadFailed')}>{t('scanFailed')}</CreatorNotice>}
    {loading ? <p>{t('loading')}</p> : rows.length ? <ul className={css.list}>
      {rows.map(row => <li className={css.row} key={row.workspace.workspaceId}>
        <div>
          <button className={css.package} onClick={() => resume(row.workspace.workspaceId)}>
            {row.project?.title ?? row.workspace.title}</button>
          <p className={css.muted}>{row.project ? row.project.name + ' · ' + row.workspace.title : t('unrecognizedRoot')}</p>
        </div>
        {row.project && <code>{row.project.version}</code>}
      </li>)}
    </ul> : <p className={css.muted}>{t('noWorkspaces')}</p>}
  </section>
}
