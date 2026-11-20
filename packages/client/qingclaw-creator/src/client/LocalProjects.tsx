import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { getWorkspaceProjects } from './project-api.ts'
import type { PluginProject } from '../project-types.ts'
import type { NS } from './locales.ts'
import css from './CreatorCenter.module.css'

export interface CreatorWorkspace { workspaceId: WorkspaceId; title: string }
type Row = PluginProject & { workspace: CreatorWorkspace }

/** Discover local projects on demand from registered workspaces, including multi-package repos. */
export function LocalProjects({ workspaces, resume, t }: {
  workspaces: readonly CreatorWorkspace[]
  resume: (workspace: WorkspaceId, directory: string) => void
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
          const projects = await getWorkspaceProjects(workspace.workspaceId, controller.signal)
          for (const project of projects) result.push({ ...project, workspace })
        } catch { errors = true }
      }
      if (!controller.signal.aborted) { setRows(result); setLoading(false); setFailed(errors) }
    })()
    return () => controller.abort()
  }, [workspaces, revision])
  return <section className={css.body}>
    <div className={css.sectionHead}><h2>{t('local')}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => refresh(n => n + 1)}>{t('reload')}</Button></div>
    {failed && <p role="alert">{t('scanFailed')}</p>}
    {loading ? <p>{t('loading')}</p> : rows.length ? <ul className={css.list}>
      {rows.map(row => <li className={css.row} key={row.workspace.workspaceId + '/' + row.directory}>
        <div><button className={css.package} onClick={() => resume(row.workspace.workspaceId, row.directory)}>{row.title}</button>
          <p className={css.muted}>{row.name} · {row.workspace.title}{row.directory === '.' ? '' : ' / ' + row.directory}</p></div>
        <code>{row.version}</code></li>)}
    </ul> : <p className={css.muted}>{t('emptyLocal')}</p>}
  </section>
}
