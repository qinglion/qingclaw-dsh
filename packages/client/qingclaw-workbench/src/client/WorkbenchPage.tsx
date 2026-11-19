/** The built-in QingClaw workbench directory. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconDownloadOutlineRegular, PluginArtworkDefault, Tag,
  IconRefreshOutlineRegular, IconSearchOutlineRegular, Input, SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { NS, WorkbenchLocaleKey } from './locales.ts'
import type { WorkbenchPluginItem, WorkbenchPluginStore } from './workbench-plugin-store.ts'
import { WorkbenchReadme } from './WorkbenchReadme.tsx'
import css from './WorkbenchPage.module.css'

export interface WorkbenchPageInjected {
  readonly pluginStore: WorkbenchPluginStore
  readonly hooks: { readonly locale: HostObservable<LocaleSnapshot> }
}

export type WorkbenchPageProps = PropsRuntime<'main'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchPageInjected>

const tabs = ['market', 'favorites', 'installed'] as const
type Tab = (typeof tabs)[number]

interface ItemActions {
  item: WorkbenchPluginItem
  t: TranslateNS<typeof NS>
  installing: boolean
  busy: boolean
  onInstall(): void
  onOpen(): void
  onFavorite(): void
}

function WorkbenchActions({ item, t, installing, busy, onInstall, onOpen, onFavorite }: ItemActions): ReactNode {
  const favoriteLabel = t(item.favorite ? 'unfavorite' : 'favorite')
  return <div className={css.actions}>
    <button type="button" className={css.favorite} aria-label={favoriteLabel}
      aria-pressed={item.favorite} title={favoriteLabel} onClick={onFavorite}>
      <span className={css.star} aria-hidden="true">{item.favorite ? '★' : '☆'}</span>
      {t(item.favorite ? 'saved' : 'favorite')}
    </button>
    {item.installed
      ? item.openable
        ? <Button variant="outline" size="sm" onClick={onOpen}>{t('open')}</Button>
        : <span className={css.installed}><IconCheckOutlineRegular size={14} />{t(item.restartRequired ? 'restartRequired' : 'installed')}</span>
      : <Button variant="primary" size="sm" disabled={busy || !item.installable} onClick={onInstall}
        title={busy && !installing ? t('anotherInstall') : undefined} icon={<IconDownloadOutlineRegular size={14} />}>
        {t(installing ? 'installing' : item.installable ? 'install' : 'offlineInstall')}
      </Button>}
  </div>
}

function WorkbenchPreview({ url, label, className }: { url: string; label: string; className: string | undefined }): ReactNode {
  const [failed, setFailed] = useState<string>()
  if (failed === url) return null
  return <div className={className}>
    <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(url)} />
  </div>
}

function WorkbenchCard({ onDetails, ...actions }: ItemActions & {
  onDetails(button: HTMLButtonElement): void
}): ReactNode {
  const { item, t } = actions
  const [failedIcon, setFailedIcon] = useState<string>()
  return <article className={css.card} aria-label={item.title}>
    {item.previewUrl && <WorkbenchPreview url={item.previewUrl} label={t('preview', { name: item.title })} className={css.preview} />}
    <div className={css.cardBody}>
      <div className={css.cardHeading}>
        {item.iconUrl && failedIcon !== item.iconUrl && <img className={css.icon} src={item.iconUrl} alt="" loading="lazy"
          referrerPolicy="no-referrer" onError={() => setFailedIcon(item.iconUrl)} />}
        <h2><button type="button" className={css.cardLink} aria-label={t('viewDetails', { name: item.title })}
          onClick={event => onDetails(event.currentTarget)}>{item.title}</button></h2>
        {item.version && <span className={css.version}>{item.version}</span>}
      </div>
      {item.author && <span className={css.author}>{item.author}</span>}
      {item.description && <p className={css.description}>{item.description}</p>}
      {item.category && <span className={css.category}>{item.category}</span>}
      <WorkbenchActions {...actions} />
    </div>
  </article>
}

function WorkbenchDetail({ item, t, actions, store, language, onBack, error }: {
  item: WorkbenchPluginItem
  t: TranslateNS<typeof NS>
  actions: ItemActions
  store: WorkbenchPluginStore
  language: string
  onBack(): void
  error?: WorkbenchLocaleKey
}): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }) }, [item.id])
  return <section className={css.detail} aria-labelledby={titleId}>
    <button type="button" className={css.back} onClick={onBack}>
      <IconChevronDownOutlineRegular size={14} aria-hidden="true" />{t('backToWorkbench')}
    </button>
    <header className={css.detailHeader}>
      <span className={css.detailIcon} aria-hidden="true"><PluginArtworkDefault size={42} /></span>
      <div className={css.identity}>
        <div className={css.titleLine}><h1 id={titleId} ref={heading} tabIndex={-1}>{item.title}</h1><Tag tone="neutral">{item.version}</Tag></div>
        <span className={css.packageName}>{item.packageName}</span>
      </div>
      <WorkbenchActions {...actions} />
    </header>
    {item.description && <p className={css.summary}>{item.description}</p>}
    {error && <p className={css.error} role="alert">{t(error)}</p>}
    {item.previewUrl && <WorkbenchPreview url={item.previewUrl} label={t('preview', { name: item.title })} className={css.detailPreview} />}
    <WorkbenchReadme item={item} pluginStore={store} language={language} t={t} />
    <section className={css.detailSection}>
      <h2>{t('versionsTitle')}</h2>
      <div className={css.release}><strong>{item.version}</strong><span>{t('catalogVersion')}</span></div>
    </section>
    <section className={css.detailSection}>
      <h2>{t('sourceTitle')}</h2>
      <dl className={css.facts}>
        {item.author && <div><dt>{t('author')}</dt><dd>{item.author}</dd></div>}
        {item.repositoryUrl && <div><dt>{t('homepage')}</dt><dd>
          <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer">{item.repositoryUrl}</a>
        </dd></div>}
        <div><dt>{t('packageName')}</dt><dd><code>{item.packageName}</code></dd></div>
        <div><dt>{t('registry')}</dt><dd><code>{item.registry}</code></dd></div>
        {item.category && <div><dt>{t('category')}</dt><dd>{item.category}</dd></div>}
      </dl>
    </section>
  </section>
}

/** Keep the current catalog visible during refresh and discard out-of-order responses. */
export function WorkbenchPage({ pluginStore, t, useLocale }: WorkbenchPageProps): ReactNode {
  const [items, setItems] = useState<readonly WorkbenchPluginItem[] | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<WorkbenchLocaleKey>()
  const [installing, setInstalling] = useState<string>()
  const [tab, setTab] = useState<Tab>('market')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [detailId, setDetailId] = useState<string>()
  const page = useRef<HTMLElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const returnTo = useRef<{ button: HTMLButtonElement; scroll: number }>()
  const language = useLocale(snapshot => snapshot.active)
  const generation = useRef(0)
  const tabsId = useId()
  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current
    setLoading(true)
    try {
      const result = await pluginStore.load(refresh)
      if (request === generation.current) {
        setItems(result)
        setError(current => current === 'loadError' ? undefined : current)
      }
    } catch {
      if (request === generation.current) setError('loadError')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [pluginStore])

  useEffect(() => {
    const unsubscribe = pluginStore.subscribe(() => { void load() })
    void load()
    return () => { generation.current++; unsubscribe() }
  }, [pluginStore, load])

  const act = async (action: () => void | Promise<void>, failure: WorkbenchLocaleKey, installId?: string) => {
    setError(undefined)
    if (installId) setInstalling(installId)
    try {
      await action()
      await load()
    } catch {
      setError(failure)
    } finally {
      if (installId) setInstalling(undefined)
    }
  }

  const all = items ?? []
  const detail = detailId ? all.find(item => item.id === detailId) : undefined
  useLayoutEffect(() => {
    if (detail) {
      if (page.current) page.current.scrollTop = 0
    } else if (returnTo.current) {
      const { button, scroll } = returnTo.current
      if (page.current) page.current.scrollTop = scroll
      const target = button.isConnected ? button : listHeading.current
      target?.focus({ preventScroll: true })
      returnTo.current = undefined
      setDetailId(undefined)
    }
  }, [detail?.id])

  function actions(item: WorkbenchPluginItem): ItemActions {
    return { item, t, installing: installing === item.id, busy: installing !== undefined,
      onInstall: () => { void act(() => pluginStore.install(item.id), 'installError', item.id) },
      onOpen: () => { void act(() => pluginStore.open(item.id), 'openError') },
      onFavorite: () => { void act(() => pluginStore.setFavorite(item.id, !item.favorite), 'preferenceError') },
    }
  }
  const categories = [...new Set(all.map(item => item.category).filter(Boolean))].sort()
  const selectedCategory = categories.includes(category) ? category : ''
  const needle = query.trim().toLocaleLowerCase()
  const visible = all.filter(item =>
    (tab !== 'favorites' || item.favorite) && (tab !== 'installed' || item.installed)
    && (!selectedCategory || item.category === selectedCategory)
    && (!needle || [item.title, item.author, item.category, item.packageName].some(value => value?.toLocaleLowerCase().includes(needle))),
  )
  const filtered = Boolean(needle || selectedCategory)
  const emptyKey = filtered ? 'noMatches'
    : tab === 'favorites' ? 'emptyFavorites' : tab === 'installed' ? 'emptyInstalled' : 'emptyMarket'
  return <main className={css.page} ref={page}>
    {detail && <div className={css.content}><WorkbenchDetail item={detail} t={t} actions={actions(detail)}
      store={pluginStore} language={language} onBack={() => { setError(undefined); setDetailId(undefined) }}
      {...(error && { error })} /></div>}
    <div className={css.content} hidden={Boolean(detail)}>
      <header className={css.header}>
        <h1 ref={listHeading} tabIndex={-1}>{t('title')}</h1>
        <Input type="search" className={css.search as string} icon={<IconSearchOutlineRegular size={16} />}
          value={query} onChange={event => setQuery(event.target.value)} aria-label={t('search')} placeholder={t('search')} />
      </header>
      <div className={css.toolbar}>
        <SegmentedControl id={tabsId} value={tab} onChange={setTab} label={t('title')}
          options={tabs.map(value => ({ value, label: t(value) }))} />
        <div className={css.filters}>
          {categories.length > 0 && <select value={selectedCategory} aria-label={t('category')}
            onChange={event => setCategory(event.target.value)}>
            <option value="">{t('allCategories')}</option>
            {categories.map(name => <option key={name}>{name}</option>)}
          </select>}
          <Button variant="ghost" size="sm" aria-label={t('refresh')} title={t('refresh')}
            disabled={loading} onClick={() => { setError(undefined); void load(true) }}
            icon={<IconRefreshOutlineRegular size={15} />} />
        </div>
      </div>
      {error && <p className={css.error} role="alert">{t(error)}</p>}
      <section className={css.results} id={`${tabsId}-${tab}-panel`} role="tabpanel"
        aria-labelledby={`${tabsId}-${tab}`} aria-busy={loading}>
        {loading && items === undefined && <p className={css.empty} role="status">{t('loading')}</p>}
        {items !== undefined && !visible.length && <div className={css.empty}>
          <p>{t(emptyKey)}</p>
          {filtered && <Button size="sm" variant="outline" onClick={() => { setQuery(''); setCategory('') }}>{t('resetFilters')}</Button>}
        </div>}
        <div className={css.grid}>
          {visible.map(item => <WorkbenchCard key={item.id} {...actions(item)} onDetails={(button) => {
            returnTo.current = { button, scroll: page.current?.scrollTop ?? 0 }
            setError(undefined)
            setDetailId(item.id)
          }} />)}
        </div>
      </section>
    </div>
  </main>
}
