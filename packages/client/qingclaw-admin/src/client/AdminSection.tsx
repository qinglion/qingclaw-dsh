import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { MAX_PACKAGE_BYTES, type PluginPublication, type QingClawUser, type QingClawUserRole } from '../types.ts'
import { marketRequest } from './api.ts'
import type { QingClawAdminLocaleKey } from './locales.ts'
import css from './AdminSection.module.css'

interface AdminSectionInjected { readonly role: 'admin' | 'creator'; readonly userId: string | null }
type AdminSectionProps = PropsLocale<'qingclaw.admin'> & InjectFace<AdminSectionInjected>
type T = AdminSectionProps['t']

function formValue(form: HTMLFormElement, field: string): string {
  const value = new FormData(form).get(field)
  return typeof value === 'string' ? value : ''
}

type Lists = { publications: PluginPublication[]; users: QingClawUser[] }
function useList<K extends keyof Lists>(action: K, query: string, revision: number) {
  const [rows, setRows] = useState<Lists[K]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    setRows([]); setError(''); setLoading(true)
    marketRequest<Partial<Lists>>(action, controller.signal, { params: query ? { q: query } : {} })
      .then((payload) => {
        const entries = payload[action]
        if (!entries || !Array.isArray(entries)) throw new Error('Invalid response')
        if (!controller.signal.aborted) setRows(entries)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort() }
  }, [action, query, revision])
  return { rows, error, loading }
}

export function AdminSection(props: AdminSectionProps) {
  return <Management key={JSON.stringify([props.userId, props.role])} {...props}/>
}

function Management({ t, role }: AdminSectionProps) {
  const [section, setSection] = useState<'publications' | 'users'>('publications')
  const [revision, refresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  const list = useList('publications', '', revision)
  const refreshList = () => { refresh(value => value + 1) }
  const publishing = list.rows.some(row => row.state === 'publishing')
  useEffect(() => {
    if (!publishing) return
    const timer = globalThis.setTimeout(refreshList, 3000)
    return () => { globalThis.clearTimeout(timer) }
  }, [publishing, revision])
  useEffect(() => () => active.current?.abort(), [])
  const mutate = async (action: string, params: Record<string, string>, done: QingClawAdminLocaleKey, file?: File) => {
    if (active.current) return false
    const controller = new AbortController()
    active.current = controller
    setBusy(true); setMessage(''); setError('')
    try {
      await marketRequest(action, controller.signal, { post: true, params, ...(file && { file }) })
      if (controller.signal.aborted) return false
      setMessage(t(done)); refreshList()
      return true
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      active.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return <main className={css.section} aria-busy={busy}>
    <h1>{t(role === 'admin' ? 'admin' : 'creator')}</h1>
    {role === 'admin' && <nav aria-label={t('admin')} className={css.navigation}>
      {(['publications', 'users'] as const).map(key => <button key={key} type="button"
        aria-current={section === key ? 'page' : undefined}
        onClick={() => { setSection(key); setMessage(''); setError('') }}>{t(key)}</button>)}
    </nav>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {section === 'publications' && <>
      <form className={css.group} onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const file = (form.elements.namedItem('artifact') as HTMLInputElement).files?.[0]
        if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.tgz') || !file.size || file.size > MAX_PACKAGE_BYTES) {
          setError(t('invalidFile'))
          return
        }
        void mutate('submit', { title: formValue(form, 'title').trim() }, 'submitted', file).then((ok) => {
          if (ok) form.reset()
        })
      }}>
        <h3>{t('submitTitle')}</h3><p>{t('packageHint')}</p>
        <label>{t('packageLabel')}<input type="file" name="artifact" accept=".tgz" required/></label>
        <label>{t('name')}<input name="title" maxLength={200}/></label>
        <button disabled={busy}>{t('submit')}</button>
      </form>
      <div className={css.group}>
        <header><h3>{t(role === 'admin' ? 'review' : 'mine')}</h3><button disabled={busy} onClick={refreshList}>{t('refresh')}</button></header>
        {list.error && <p role="alert">{list.error}</p>}
        {list.loading ? <p>{t('loading')}</p> : !list.error && !list.rows.length && <p>{t('empty')}</p>}
        {list.rows.map(item => <article key={item.id}>
          <strong>{item.title || item.package_name}</strong> <span>{t(item.resource_type)} · {t(item.state)}</span>
          <p><code>{item.package_name}@{item.version}</code>{item.submitted_by?.name && ' · ' + item.submitted_by.name}</p>
          {item.error && <p>{item.error}</p>}
          {role === 'admin' && (item.state === 'pending' || item.state === 'failed') &&
          <div className={css.row}><button disabled={busy} onClick={() => void mutate('publish', { id: String(item.id) }, 'queued')}>{t('publish')}</button>
            <form onSubmit={(event) => {
              event.preventDefault()
              void mutate('reject', { id: String(item.id), reason: formValue(event.currentTarget, 'reason') }, 'returned')
            }}><input name="reason" aria-label={t('reason')} placeholder={t('reason')} maxLength={1000} required/><button disabled={busy}>{t('reject')}</button></form>
          </div>}
        </article>)}
      </div>
    </>}
    {role === 'admin' && section === 'users' && <Users t={t} busy={busy} revision={revision} refresh={refreshList}
      save={(id, next) => mutate('role', { id: String(id), role: next }, 'saved')}/>}
  </main>
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
  return <section className={css.group}><h3>{t('users')}</h3>
    <form className={css.row} onSubmit={(event) => {
      event.preventDefault()
      const value = formValue(event.currentTarget, 'q').trim()
      if (value === query) refresh()
      else setQuery(value)
    }}><input aria-label={t('query')} name="q" placeholder={t('query')}/><button>{t('search')}</button></form>
    {list.error && <p role="alert">{list.error}</p>}
    {list.loading ? <p>{t('loading')}</p> : !list.error && !list.rows.length && <p>{t('noUsers')}</p>}
    {list.rows.map(user => <form key={`${user.id}:${user.role}`} className={css.row} onSubmit={(event) => {
      event.preventDefault()
      const next = new FormData(event.currentTarget).get('role') as QingClawUserRole
      if (next !== user.role) void save(user.id, next)
    }}><span>{user.name} {user.email}</span><select aria-label={t('role')} name="role" defaultValue={user.role}>
        <option value="user">{t('userRole')}</option><option value="creator">{t('creatorRole')}</option><option value="admin">{t('adminRole')}</option>
      </select><button disabled={busy}>{t('save')}</button></form>)}
  </section>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'qingclaw.admin': QingClawAdminLocaleKey }
}
