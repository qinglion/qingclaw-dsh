import { useEffect, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginProject } from '../project-types.ts'
import type { CreatorVersion } from '../types.ts'
import { getProjectVersions } from './project-api.ts'
import { getMyPackages } from './api.ts'
import type { releaseNamespace, zh } from './release-locales.ts'
import css from './ReleaseView.module.css'

interface ReleaseActions {
  workspaceId: string
  workspace?: { title: string; path: string; createdAt: string } | undefined
  projects: readonly PluginProject[]
  publish: (project: PluginProject) => Promise<void>
}

type Label = keyof typeof zh
type Props = ReleaseActions & PropsLocale<typeof releaseNamespace> & Pick<PropsRuntime<'conversation.view'>, 'openView'>

function marketLabel(state: string | null | undefined): Label | undefined {
  switch (state) {
    case 'pending': case 'publishing': case 'published': case 'rejected': case 'failed': case 'superseded': return state
    case 'withdrawn': case 'delisted': return 'withdrawn'
    case 'unlisted': return 'unlisted'
    default: return undefined
  }
}

export function ReleaseView({ workspaceId, workspace, projects, publish, openView, t }: Props) {
  const [chosen, setChosen] = useState('')
  const project = projects.length === 1 ? projects[0] : projects.find(item => item.directory === chosen)
  const [revision, refresh] = useState(0)
  const [history, setHistory] = useState<{ name: string; versions: CreatorVersion[] } | null>(null)
  const [failedFor, setFailedFor] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Label | null>(null)
  const inFlight = useRef(false)
  const name = project?.name
  useEffect(() => {
    if (!name) return
    const controller = new AbortController()
    setFailedFor('')
    setHistory(null)
    const ownPackages = getMyPackages(controller.signal).catch(() => [])
    void getProjectVersions(workspaceId, name, controller.signal).then(async (releases) => {
      if (controller.signal.aborted) return
      setHistory({ name, versions: releases })
      const own = (await ownPackages).find(row => row.name === name)?.versions
      if (controller.signal.aborted || !own?.length) return
      const listing = new Map(own.map(entry => [entry.version, entry.market_state]))
      setHistory({ name, versions: releases.map(release => ({ ...release, market_state: listing.get(release.version) ?? null })) })
    }).catch(() => { if (!controller.signal.aborted) setFailedFor(name) })
    return () => controller.abort()
  }, [workspaceId, name, revision])

  const send = async () => {
    if (!project || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await publish(project)
      openView('chat', 'qingclaw-release')
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      setError(code === 'changed' || code === 'creator_required' ? code : 'sendFailed')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const versions = history?.name === name ? history?.versions : undefined
  return <section className={css.page} aria-label={t('release')}>
    <div className={css.content}>
      <header className={css.heading}>
        <div><h1>{project?.title ?? t('release')}</h1>{project?.description && <p>{project.description}</p>}</div>
        <Button variant="primary" disabled={!project || busy} onClick={() => { void send() }}>{t(busy ? 'sending' : 'publish')}</Button>
      </header>
      {error && <p role="alert">{t(error)}</p>}
      {projects.length > 1 && <label className={css.selector}>{t('select')}
        <select value={chosen} disabled={busy} onChange={(event) => { setChosen(event.target.value); setError(null) }}>
          <option value="">{t('select')}</option>
          {projects.map(item => <option key={item.directory} value={item.directory}>{item.name} · {item.directory}</option>)}
        </select>
      </label>}
      {project && <>
        <section className={css.details}><h2>{t('project')}</h2><dl>
          <div><dt>{t('packageName')}</dt><dd><code>{project.name}</code></dd></div>
          <div><dt>{t('version')}</dt><dd>{project.version}</dd></div>
          <div><dt>{t('kind')}</dt><dd>{t(project.kind)}</dd></div>
          {workspace && <div><dt>{t('workspace')}</dt><dd>{workspace.title}</dd></div>}
          <div><dt>{t('path')}</dt><dd><code>{workspace ? workspace.path.replace(/[\\/]$/, '') + (project.directory === '.' ? '' : '/' + project.directory) : project.directory}</code></dd></div>
          {workspace?.createdAt && <div><dt>{t('created')}</dt><dd><time dateTime={workspace.createdAt}>{new Date(workspace.createdAt).toLocaleDateString()}</time></dd></div>}
          {project.author && <div><dt>{t('author')}</dt><dd>{project.author}</dd></div>}
          {project.panelId && <div><dt>{t('panel')}</dt><dd>{project.panelId}</dd></div>}
        </dl></section>
        <section className={css.history}><header><h2>{t('history')}</h2>
          <Button size="sm" variant="ghost" onClick={() => refresh(i => i + 1)}>{t('refresh')}</Button></header>
        {failedFor === name ? <p role="alert">{t('loadFailed')}</p>
          : versions === undefined ? <p role="status">{t('loading')}</p>
            : versions.length === 0 ? <p>{t('noHistory')}</p>
              : <ul>{versions.map((version) => {
                const state = marketLabel(version.market_state)
                return <li key={version.version}>
                  <strong>{version.version}</strong>{state && <span>{t(state)}</span>}
                  {version.published_at && <time dateTime={version.published_at}>
                    {new Date(version.published_at).toLocaleDateString()}
                  </time>}
                </li>
              })}</ul>}
        </section>
      </>}
    </div>
  </section>
}
