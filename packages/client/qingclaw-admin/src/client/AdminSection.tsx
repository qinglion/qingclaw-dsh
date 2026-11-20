import { useEffect, useId, useRef, useState } from 'react'
import { Button, IconRefreshOutlineRegular, Input, Pill, SegmentedControl, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginPublication, RegistryPackage, QingClawUser, QingClawUserRole } from '../types.ts'
import { marketRequest } from './api.ts'
import type { QingClawAdminLocaleKey } from './locales.ts'
import css from './AdminSection.module.css'

interface AdminSectionInjected { readonly role: 'admin'; readonly userId: string | null }
type AdminSectionProps = PropsLocale<'qingclaw.admin'> & InjectFace<AdminSectionInjected>
type T = AdminSectionProps['t']

function formValue(form: HTMLFormElement, field: string): string {
  const value = new FormData(form).get(field)
  return typeof value === 'string' ? value : ''
}

type Lists = { packages: RegistryPackage[]; publications: PluginPublication[]; users: QingClawUser[] }
function useList<K extends keyof Lists>(action: K, query: string, revision: number) {
  const [rows, setRows] = useState<Lists[K]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setError(''); setLoading(true)
    marketRequest<Partial<Lists>>(action, controller.signal, { params: query ? { q: query } : {} })
      .then((payload) => {
        const entries = payload[action]
        if (!entries || !Array.isArray(entries)) throw new Error('Invalid response')
        if (!controller.signal.aborted) setRows(entries)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setRows([]); setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort() }
  }, [action, query, revision])
  return { rows, error, loading }
}

export function AdminSection(props: AdminSectionProps) {
  return <Management key={JSON.stringify([props.userId, props.role])} {...props}/>
}

type ListingFilter = 'toReview' | 'onShelf' | 'all'
const reviewable = (item: PluginPublication) => item.state === 'pending' || item.state === 'failed'
const stateTone = { superseded: 'neutral', delisted: 'neutral', pending: 'warning', publishing: 'info', published: 'success', failed: 'danger', rejected: 'neutral' } as const

function errorText(message: string, t: T) {
  switch (message) {
    case 'signed_out': case 'unauthorized': return t('signInAgain')
    case 'creator_role_required': case 'admin_role_required': return t('roleDenied')
    case 'artifact_required': return t('listingUpdateRequired')
    case 'listing_api_unavailable': return t('listingUnavailable')
    case 'registry_reference_required': return t('missingReference')
    case 'registry_unavailable': return t('registryUnavailable')
    case 'publication_conflict': return t('existingListing')
    case 'package_owned_by_another_creator': return t('otherOwner')
    case 'invalid_publication_state': return t('stateChanged')
    case 'publication_queue_unavailable': case 'website_unreachable': return t('unavailable')
    default: return message
  }
}

function Management({ t }: AdminSectionProps) {
  const id = useId()
  const [filter, setFilter] = useState<ListingFilter>('all')
  const [section, setSection] = useState<'publications' | 'users'>('publications')
  const [revision, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  const list = useList('publications', '', revision)
  const registry = useList('packages', '', revision)
  const refreshList = () => { refresh(value => value + 1) }
  const publishing = list.rows.some(row => row.state === 'publishing')
  useEffect(() => {
    if (!publishing || list.loading || section !== 'publications') return
    const timer = globalThis.setTimeout(refreshList, 3000)
    return () => { globalThis.clearTimeout(timer) }
  }, [publishing, list.loading, section, revision])
  useEffect(() => () => active.current?.abort(), [])
  const mutate = async (action: string, params: Record<string, string>, done: QingClawAdminLocaleKey) => {
    if (active.current) return false
    const controller = new AbortController()
    active.current = controller
    setBusy(true); setMessage(''); setError('')
    try {
      await marketRequest(action, controller.signal, { post: true, params })
      if (controller.signal.aborted) return false
      setMessage(t(done)); refreshList()
      return true
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
        if (err instanceof Error && err.cause === 409) refreshList()
      }
      return false
    } finally {
      active.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  const packages = groupPackages(registry.rows, list.rows)
  const filtered = (choice: ListingFilter) => packages.filter(pkg => choice === 'all' || pkg.versions.some(
    item => item.submission && (choice === 'toReview' ? reviewable(item.submission) : item.submission.state === 'published')))
  const loading = list.loading || registry.loading
  const errors = list.error || registry.error
  const navigate = (next: 'publications' | 'users') => {
    setSection(next); setMessage(''); setError('')
  }
  const refreshButton = <Button size="sm" variant="ghost" disabled={busy || loading}
    aria-label={t('refresh')} title={t('refresh')} icon={<IconRefreshOutlineRegular size={16}/>} onClick={refreshList}/>

  return <main className={css.section} aria-busy={busy}>
    <div className={css.content}>
      <header className={css.header}><h1>{t('admin')}</h1></header>
      <SegmentedControl id={id} value={section} disabled={busy} onChange={navigate} label={t('admin')}
        options={[{ value: 'publications', label: t('publications') }, { value: 'users', label: t('users') }]}/>
      {error && <p role="alert" className={css.notice}>{errorText(error, t)}</p>}
      {message && <p role="status" className={css.notice}>{message}</p>}
      <section className={css.panel} role="tabpanel" id={id + '-' + section + '-panel'} aria-labelledby={id + '-' + section}>
        {section === 'publications' && <>
          <div className={css.toolbar}>
            <div className={css.filters} role="group" aria-label={t('review')}>
              {(['all', 'toReview', 'onShelf'] as const).map(key => <Pill key={key} active={filter === key} aria-pressed={filter === key}
                onClick={() => { setFilter(key) }}>{t(key)} <span className={css.count}>{filtered(key).length}</span></Pill>)}
            </div>
            {refreshButton}
          </div>
          {errors ? <p role="alert" className={css.empty}>{errorText(errors, t)}</p>
            : !filtered(filter).length && <p className={css.empty}>{t(loading ? 'loading' : filter === 'all' ? 'empty' : filter === 'toReview' ? 'noReview' : 'noPublished')}</p>}
          {!errors && filtered(filter).map(pkg => <section className={css.package} key={pkg.package_name}>
            <h2>{pkg.title}</h2>
            <p className={css.metadata}><code>{pkg.package_name}</code>{pkg.latest_version && <span>{t('latest')} {pkg.latest_version}</span>}
              {pkg.currentVersion ? <span>{t('marketVersion')} {pkg.currentVersion}</span>
                : pkg.highestVersion && <span>{t('highestListed')} {pkg.highestVersion}</span>}
              <span>{pkg.owner_id ? t('owner') + ' #' + pkg.owner_id : t('unowned')}</span></p>
            {pkg.description && <p className={css.metadata}>{pkg.description}</p>}
            {pkg.canAssign && <AssignOwner t={t} revision={revision} busy={busy}
              save={owner => mutate('owner', { package_name: pkg.package_name, owner_id: owner }, 'ownerSaved')}/>}
            {pkg.versions.map(({ version, submission, blocked }) => submission
              ? <PublicationRow key={version} item={submission} t={t} busy={busy || loading}
                blocked={blocked} canReview={reviewable(submission)} publish={() => mutate('list', { id: String(submission.id) }, 'queued')}
                delist={() => mutate('delist', { id: String(submission.id) }, 'delisted')}
                reject={reason => mutate('reject', { id: String(submission.id), reason }, 'returned')}/>
              : <p key={version} className={css.metadata}><code>{version}</code><Tag tone="neutral">{t(blocked ? 'versionBlocked' : 'unsubmitted')}</Tag></p>)}
          </section>)}
        </>}
        {section === 'users' && <Users t={t} busy={busy} revision={revision} refresh={refreshList}
          save={(userId, next) => mutate('role', { id: String(userId), role: next }, 'saved')}/>}
      </section>
    </div>
  </main>
}

/** Join immutable registry versions to their newest market application. Keep legacy market records visible. */
function groupPackages(packages: RegistryPackage[], publications: PluginPublication[]) {
  const registry = new Map(packages.map(pkg => [pkg.package_name, pkg]))
  const groups = new Map<string, Map<string, PluginPublication>>()
  for (const row of publications) {
    const versions = groups.get(row.package_name) ?? new Map<string, PluginPublication>()
    if ((versions.get(row.version)?.id ?? 0) < row.id) {
      versions.set(row.version, row.state === 'published' && row.current === false ? { ...row, state: 'superseded' } : row)
    }
    groups.set(row.package_name, versions)
  }
  return [...new Set([...registry.keys(), ...groups.keys()])].sort().map((package_name) => {
    const pkg = registry.get(package_name)
    const applications = groups.get(package_name)
    const current = [...(applications?.values() ?? [])].find(row => row.current)
    const inventory = new Map(pkg?.versions.map(row => [row.version, row]))
    const versions = new Set([...inventory.keys(), ...(applications?.keys() ?? [])])
    return { package_name, latest_version: pkg?.latest_version, owner_id: pkg?.owner_id, canAssign: pkg?.owner_id === null,
      description: pkg?.description,
      currentVersion: pkg?.current_market_version === undefined ? current?.version : pkg.current_market_version,
      highestVersion: pkg?.highest_market_version, title: current?.title ?? applications?.values().next().value?.title ?? package_name,
      versions: [...versions].map((version) => {
        const submission = applications?.get(version)
        const blocked = !!(submission?.listing_blocked_by_version || inventory.get(version)?.listing_blocked_by_version)
        return { version, submission, blocked }
      }) }
  })
}

function AssignOwner({ t, revision, busy, save }: {
  t: T
  revision: number
  busy: boolean
  save: (id: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  return open ? <OwnerSearch t={t} busy={busy} revision={revision} save={save} cancel={() => setOpen(false)}/>
    : <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(true)}>{t('assignOwner')}</Button>
}

function OwnerSearch({ t, revision, busy, save, cancel }: {
  t: T
  revision: number
  busy: boolean
  save: (id: string) => Promise<boolean>
  cancel: () => void
}) {
  const [query, setQuery] = useState('')
  const users = useList('users', query, revision)
  const eligible = users.rows.filter(user => user.role !== 'user')
  return <form className={css.row} onSubmit={(event) => {
    event.preventDefault()
    const id = formValue(event.currentTarget, 'owner')
    if (id) void save(id)
  }}>
    <Input aria-label={t('query')} placeholder={t('query')} value={query} onChange={e => setQuery(e.target.value)}/>
    <select aria-label={t('owner')} name="owner" required disabled={users.loading || busy}>
      <option value="">{t('owner')}</option>{eligible.map(user => <option key={user.id} value={user.id}>{user.name} {user.email}</option>)}
    </select>
    {users.error && <span role="alert">{errorText(users.error, t)}</span>}
    <Button size="sm" type="submit" disabled={busy || users.loading || !eligible.length}>{t('assignOwner')}</Button>
    <Button size="sm" variant="outline" onClick={cancel}>{t('cancel')}</Button>
  </form>
}

function PublicationRow({ t, item, busy, canReview, blocked, publish, delist, reject }: {
  t: T
  item: PluginPublication
  busy: boolean
  canReview: boolean
  blocked: boolean
  publish: () => Promise<boolean>
  delist: () => Promise<boolean>
  reject: (reason: string) => Promise<boolean>
}) {
  const [confirmDelist, setConfirmDelist] = useState(false)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')
  return <article className={css.publication}>
    <div className={css.rowHeader}>
      <div className={css.identity}><h3>{item.version}</h3><Tag tone={stateTone[item.state]}>{t(item.state)}</Tag></div>
      {item.state === 'published' && (confirmDelist
        ? <div className={css.actions}>
          <Button size="sm" disabled={busy} onClick={() => { void delist().then((ok) => { if (ok) setConfirmDelist(false) }) }}>{t('confirmDelist')}</Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelist(false)}>{t('cancel')}</Button>
        </div>
        : <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDelist(true)}>{t('delist')}</Button>)}
      {canReview && !returning && <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReturning(true) }}>{t('reject')}</Button>
        {!blocked && <Button size="sm" variant="primary" disabled={busy} onClick={() => void publish()}>{t(item.state === 'failed' ? 'retryPublish' : 'publish')}</Button>}
      </div>}
    </div>
    <p className={css.metadata}><span>{t(item.resource_type)}</span>
      {item.submitted_by?.name && <span>{item.submitted_by.name}</span>}</p>
    {blocked && item.state !== 'superseded' && <p className={css.feedback}>{t('versionBlocked')}</p>}
    {item.error && <p className={css.feedback}>{item.error}</p>}
    {canReview && returning && <form className={css.returnForm} onSubmit={(event) => {
      event.preventDefault()
      if (reason.trim()) void reject(reason.trim()).then((ok) => { if (ok) { setReason(''); setReturning(false) } })
    }}>
      <label>{t('reason')}<Input autoFocus value={reason} maxLength={1000} required onChange={(event) => { setReason(event.target.value) }}/></label>
      <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setReturning(false) }}>{t('cancel')}</Button>
        <Button size="sm" type="submit" variant="primary" disabled={busy || !reason.trim()}>{t('confirmReturn')}</Button>
      </div>
    </form>}
  </article>
}

function Users({ t, busy, revision, refresh, save }: {
  t: T
  busy: boolean
  revision: number
  refresh: () => void
  save: (id: number, next: QingClawUserRole) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const list = useList('users', query, revision)
  return <section className={css.users}>
    <form className={css.row} onSubmit={(event) => {
      event.preventDefault()
      const value = formValue(event.currentTarget, 'q').trim()
      if (value === query) refresh()
      else setQuery(value)
    }}><Input aria-label={t('query')} name="q" placeholder={t('query')}/><Button type="submit" variant="outline">{t('search')}</Button></form>
    {list.error && <p role="alert">{errorText(list.error, t)}</p>}
    {list.loading ? <p>{t('loading')}</p> : !list.error && !list.rows.length && <p>{t('noUsers')}</p>}
    {!list.loading && list.rows.map(user => <form key={`${user.id}:${user.role}`} className={css.row} onSubmit={(event) => {
      event.preventDefault()
      const next = new FormData(event.currentTarget).get('role') as QingClawUserRole
      if (next !== user.role) void save(user.id, next)
    }}><span>{user.name} {user.email}</span><select aria-label={t('role')} name="role" defaultValue={user.role}>
        <option value="user">{t('userRole')}</option><option value="creator">{t('creatorRole')}</option><option value="admin">{t('adminRole')}</option>
      </select><Button type="submit" size="sm" variant="outline" disabled={busy}>{t('save')}</Button></form>)}
  </section>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.admin': QingClawAdminLocaleKey }
}
