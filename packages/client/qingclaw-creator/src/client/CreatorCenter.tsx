import { useEffect, useRef, useState } from 'react'
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { getMyPackages, submitListing } from './api.ts'
import type { CreatorPackage } from '../types.ts'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { LocalProjects } from './LocalProjects.tsx'
import type { CreatorKey, NS } from './locales.ts'
import css from './CreatorCenter.module.css'

type Translate = TranslateNS<typeof NS>
export type ProjectAction = 'plugin' | 'workbench' | 'open'
export interface CenterInputs {
  userId: string
  openProject(kind: ProjectAction, folder?: string): Promise<void>
  resume(workspace: WorkspaceId, directory: string): void
  hooks: { workspaces: HostObservable<WorkspaceSnapshot> }
}
type Props = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<CenterInputs>

const labels: Record<string, CreatorKey> = { pending: 'pending', publishing: 'publishing', published: 'published', failed: 'failed', rejected: 'rejected', delisted: 'delisted', superseded: 'superseded' }

function errorMessage(error: unknown, t: Translate): string {
  return error instanceof Error && error.message ? error.message : t('loadFailure')
}

function PackageList({ t }: { t: Translate }) {
  const [packages, setPackages] = useState<CreatorPackage[]>([])
  const [active, select] = useState<string>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [revision, reload] = useState(0)
  const lifecycle = useRef<AbortController>()
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    setStatus('loading')
    void getMyPackages(controller.signal).then((rows) => {
      if (!controller.signal.aborted) { setPackages(rows); setStatus('ready') }
    }).catch((error) => { if (!controller.signal.aborted) { setStatus('error'); setNotice(errorMessage(error, t)) } })
    return () => controller.abort()
  }, [revision, t])
  const selected = packages.find(row => row.name === active)
  const apply = async (pkg: string, version: string) => {
    const signal = lifecycle.current?.signal
    if (!signal || signal.aborted || pending) return
    setPending(true); setNotice('')
    try {
      await submitListing(pkg, version, signal)
      if (!signal.aborted) { setNotice(t('submitted')); reload(n => n + 1) }
    } catch (error) {
      if (!signal.aborted) {
        setNotice(errorMessage(error, t))
        if (error instanceof Error && error.cause === 409) reload(n => n + 1)
      }
    }
    finally { if (!signal.aborted) setPending(false) }
  }
  return <section className={css.body}>
    <div className={css.sectionHead}>
      <h2>{selected?.name ?? t('packages')}</h2>
      <div className={css.actions}>{selected && <Button variant="ghost" onClick={() => { select(undefined); setNotice('') }}>{t('back')}</Button>}
        <Button variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} disabled={pending || status === 'loading'}
          onClick={() => { setNotice(''); reload(n => n + 1) }}>{t('reload')}</Button></div>
    </div>
    {notice && <p role={status === 'error' ? 'alert' : 'status'}>{notice}</p>}
    {status === 'loading' ? <p>{t('loading')}</p> : status === 'ready' && (selected ? <>
      {selected.description && <p className={css.muted}>{selected.description}</p>}
      {selected.current_market_version
        ? <p className={css.muted}>{t('marketVersion')} {selected.current_market_version}</p>
        : selected.highest_market_version && <p className={css.muted}>{t('highestListed')} {selected.highest_market_version}</p>}
      <h2>{t('history')}</h2>
      <ul className={css.list}>{selected.versions.map(item => <li key={item.version} className={css.row}>
        <div><code>{item.version}</code>{item.published_at && <p className={css.date}>{item.published_at.slice(0, 10)}</p>}</div>
        <div className={css.actions}><span>{t(labels[item.market_state ?? ''] ?? 'unlisted')}</span>
          {item.listing_blocked_by_version && item.market_state !== 'superseded' && <span>{t('versionBlocked')}</span>}
          {!item.listing_blocked_by_version && (!item.market_state || item.market_state === 'rejected' || item.market_state === 'delisted') &&
            <Button disabled={pending} onClick={() => void apply(selected.name, item.version)}>{t('request')}</Button>}</div>
        {item.review_note && <p className={css.muted}>{item.review_note}</p>}
      </li>)}</ul>
    </> : packages.length ? <ul className={css.list}>{packages.map(row => <li key={row.name} className={css.row}>
      <div><button className={css.package} onClick={() => { select(row.name); setNotice('') }}>{row.name}</button>
        {row.description && <p className={css.muted}>{row.description}</p>}</div><code>{row.latest_version}</code>
    </li>)}</ul> : <p className={css.muted}>{t('packageListEmpty')}</p>)}
  </section>
}

function Center({ t, openProject, useWorkspaces, resume }: Pick<Props, 't' | 'openProject' | 'useWorkspaces' | 'resume'>) {
  const [tab, setTab] = useState<'packages' | 'local'>('packages')
  const [kind, setKind] = useState<'plugin' | 'workbench'>()
  const [folder, setFolder] = useState('')
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const start = async (kind: ProjectAction) => {
    if (picking) return
    setPicking(true); setError('')
    try { await openProject(kind, folder.trim()); setKind(undefined) } catch (reason) { setError(reason instanceof Error ? reason.message : t('setupFailed')) }
    finally { setPicking(false) }
  }
  return <main className={css.page}><div className={css.content}>
    <header className={css.header}><h1>{t('center')}</h1>
      <div className={css.actions}>
        <Button disabled={picking} onClick={() => void start('open')}>{t('openProject')}</Button>
        <Button disabled={picking} onClick={() => { setKind('workbench'); setFolder(''); setError('') }}>{t('newWorkbench')}</Button>
        <Button variant="primary" disabled={picking} onClick={() => { setKind('plugin'); setFolder(''); setError('') }}>{t('newPlugin')}</Button>
      </div></header>
    {kind && <form className={css.projectForm} onSubmit={(event) => { event.preventDefault(); void start(kind) }}>
      <h2>{t(kind === 'plugin' ? 'newProjectTitle' : 'newWorkbenchTitle')}</h2>
      <label>{t('folder')} <input value={folder} autoFocus required maxLength={100}
        onChange={event => setFolder(event.target.value)} /></label>
      <div className={css.actions}>
        <Button type="submit" variant="primary" disabled={!folder.trim() || picking}>{t('chooseParent')}</Button>
        <Button type="button" variant="ghost" onClick={() => setKind(undefined)}>{t('cancel')}</Button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
    <nav className={css.tabs}>{(['packages', 'local'] as const).map(id =>
      <Button key={id} variant={tab === id ? 'outline' : 'ghost'} aria-pressed={tab === id} onClick={() => setTab(id)}>{t(id)}</Button>)}
    </nav>{tab === 'local'
      ? <LocalProjects workspaces={workspaces} resume={resume} t={t} /> : <PackageList t={t} />}
  </div></main>
}

/** Remount all account-scoped state on identity changes. */
export function CreatorCenter({ userId, t, openProject, useWorkspaces, resume }: Props) {
  return <Center key={userId} t={t} openProject={openProject} useWorkspaces={useWorkspaces} resume={resume} />
}
