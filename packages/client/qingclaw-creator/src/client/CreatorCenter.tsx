import { useEffect, useRef, useState } from 'react'
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { getMyPackages, submitListing } from './api.ts'
import type { CreatorPackage } from '../types.ts'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { LocalProjects } from './LocalProjects.tsx'
import { CreatorNotice } from './Notice.tsx'
import type { CreatorKey, NS } from './locales.ts'
import css from './CreatorCenter.module.css'

type Translate = TranslateNS<typeof NS>
export interface CenterInputs {
  userId: string
  resume(workspace: WorkspaceId): void
  hooks: { workspaces: HostObservable<WorkspaceSnapshot> }
}
type Props = PropsRuntime<'main'> & PropsLocale<typeof NS> & InjectFace<CenterInputs>

const labels: Record<string, CreatorKey> = { pending: 'pending', publishing: 'publishing', published: 'published', failed: 'failed', rejected: 'rejected', delisted: 'delisted', superseded: 'superseded' }

/** One result the panel shows above the list. */
interface Notice {
  readonly tone: 'error' | 'success'
  readonly title: string
  readonly text?: string
}

function errorMessage(error: unknown, t: Translate): string {
  return error instanceof Error && error.message ? error.message : t('loadFailure')
}

function PackageList({ t }: { t: Translate }) {
  const [packages, setPackages] = useState<CreatorPackage[]>([])
  const [active, select] = useState<string>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notice, setNotice] = useState<Notice>()
  const [pending, setPending] = useState(false)
  const [revision, reload] = useState(0)
  const lifecycle = useRef<AbortController>()
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    setStatus('loading')
    void getMyPackages(controller.signal).then((rows) => {
      if (!controller.signal.aborted) { setPackages(rows); setStatus('ready') }
    }).catch((error) => { if (!controller.signal.aborted) {
      setStatus('error'); setNotice({ tone: 'error', title: t('noticeReadFailed'), text: errorMessage(error, t) })
    } })
    return () => controller.abort()
  }, [revision, t])
  const selected = packages.find(row => row.name === active)
  const apply = async (pkg: string, version: string) => {
    const signal = lifecycle.current?.signal
    if (!signal || signal.aborted || pending) return
    setPending(true); setNotice(undefined)
    try {
      await submitListing(pkg, version, signal)
      if (!signal.aborted) { setNotice({ tone: 'success', title: t('submitted') }); reload(n => n + 1) }
    } catch (error) {
      if (!signal.aborted) {
        setNotice({ tone: 'error', title: t('noticeListingRefused'), text: errorMessage(error, t) })
        if (error instanceof Error && error.cause === 409) reload(n => n + 1)
      }
    }
    finally { if (!signal.aborted) setPending(false) }
  }
  return <section className={css.body}>
    <div className={css.sectionHead}>
      <h2>{selected?.title ?? t('packages')}</h2>
      <div className={css.actions}>{selected && <Button variant="ghost" onClick={() => { select(undefined); setNotice(undefined) }}>{t('back')}</Button>}
        <Button variant="ghost" icon={<IconRefreshOutlineRegular size={16} />} disabled={pending || status === 'loading'}
          onClick={() => { setNotice(undefined); reload(n => n + 1) }}>{t('reload')}</Button></div>
    </div>
    {notice && <CreatorNotice tone={notice.tone} title={notice.title}>{notice.text}</CreatorNotice>}
    {status === 'loading' ? <p>{t('loading')}</p> : status === 'ready' && (selected ? <>
      {selected.title !== selected.name && <p className={css.muted}><code>{selected.name}</code></p>}
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
      <div><button className={css.package} onClick={() => { select(row.name); setNotice(undefined) }}>{row.title}</button>
        {row.title !== row.name && <p className={css.muted}><code>{row.name}</code></p>}
        {row.description && <p className={css.muted}>{row.description}</p>}</div><code>{row.latest_version}</code>
    </li>)}</ul> : <p className={css.muted}>{t('packageListEmpty')}</p>)}
  </section>
}

function Center({ t, useWorkspaces, resume }: Pick<Props, 't' | 'useWorkspaces' | 'resume'>) {
  const [tab, setTab] = useState<'packages' | 'local'>('packages')
  const workspaces = useWorkspaces(snapshot => snapshot.items)
  return <main className={css.page}><div className={css.content}>
    <header className={css.header}><h1>{t('center')}</h1></header>
    <nav className={css.tabs}>{(['packages', 'local'] as const).map(id =>
      <Button key={id} variant={tab === id ? 'outline' : 'ghost'} aria-pressed={tab === id} onClick={() => setTab(id)}>{t(id)}</Button>)}
    </nav>{tab === 'local'
      ? <LocalProjects workspaces={workspaces} resume={resume} t={t} /> : <PackageList t={t} />}
  </div></main>
}

/** Remount all account-scoped state on identity changes. */
export function CreatorCenter({ userId, t, useWorkspaces, resume }: Props) {
  return <Center key={userId} t={t} useWorkspaces={useWorkspaces} resume={resume} />
}
