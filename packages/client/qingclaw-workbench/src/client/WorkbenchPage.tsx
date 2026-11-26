/** The built-in QingClaw workbench directory. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconDownloadOutlineRegular,
  IconRightUpOutlineRegular, IconTrashOutlineRegular,
  Modal, PluginArtworkDefault, Switch, Tag, IconRefreshOutlineRegular, IconSearchOutlineRegular, Input, SegmentedControl,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { NS, WorkbenchLocaleKey } from './locales.ts'
import type { WorkbenchPendingOperation } from '../types.ts'
import { needsPro, needsSignIn, type WorkbenchPluginItem, type WorkbenchPluginStore } from './workbench-plugin-store.ts'
import css from './WorkbenchPage.module.css'

export interface WorkbenchPageInjected {
  readonly pluginStore: WorkbenchPluginStore
  readonly hooks: { readonly locale: HostObservable<LocaleSnapshot> }
  /** Show the page where the professional licence is bought, for a listing this account cannot install yet. */
  readonly openSubscriptionPage: (onReturned?: () => void) => void
}

export type WorkbenchPageProps = PropsRuntime<'main'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchPageInjected>

const tabs = ['market', 'favorites', 'installed'] as const
type Tab = (typeof tabs)[number]

interface ItemActions {
  item: WorkbenchPluginItem
  t: TranslateNS<typeof NS>
  pending?: WorkbenchPendingOperation | undefined
  busy: boolean
  /** The product page hides the installed label; its actions already say what the state is. */
  detail?: boolean
  onInstall(): void
  onUpgrade(): void
  onUpdate(): void
  onUninstall(): void
  onSetEnabled(enabled: boolean): void
  onOpen(): void
  onFavorite(): void
}

/** Two-stage fetch/link progress for a running installation or update. */
function WorkbenchProgress({ pending, t, name }: {
  pending: WorkbenchPendingOperation
  t: TranslateNS<typeof NS>
  name: string
}): ReactNode {
  const starting = pending.phase === 'starting'
  const stages = [
    { id: 'download', label: t('stageDownload'), value: pending.download,
      active: starting || pending.phase === 'download', indeterminate: starting },
    { id: 'install', label: t('stageInstall'), value: pending.install,
      active: pending.phase === 'install', indeterminate: false },
  ]
  return <div className={css.progress} role="status" aria-label={t('installProgress', { name })}>
    {stages.map(stage => <div key={stage.id} className={css.progressStage} data-active={stage.active || undefined}>
      <span className={css.progressLabel}>{stage.label}</span>
      <span className={css.progressTrack}>
        <span className={css.progressFill} data-indeterminate={stage.indeterminate || undefined}
          style={stage.indeterminate ? undefined : { width: `${stage.value}%` }} />
      </span>
      <span className={css.progressValue}>{t('progressValue', { value: stage.value })}</span>
    </div>)}
  </div>
}

/** The one action a listing offers while this account holds no professional licence. */
function UpgradeAction({ t, onUpgrade }: Pick<ItemActions, 't' | 'onUpgrade'>): ReactNode {
  return <Button variant="primary" size="sm" onClick={onUpgrade} icon={<IconRightUpOutlineRegular size={14} />}>
    {t('upgrade')}
  </Button>
}

function WorkbenchActions({ item, t, pending, busy, detail, onInstall, onUpgrade, onUpdate, onOpen, onFavorite }: ItemActions): ReactNode {
  const favoriteLabel = t(item.favorite ? 'unfavorite' : 'favorite')
  const pendingInstall = pending !== undefined && (pending.kind === 'install' || pending.kind === 'update')
  return <div className={css.actions}>
    <button type="button" className={css.favorite} aria-label={favoriteLabel}
      aria-pressed={item.favorite} title={favoriteLabel} onClick={onFavorite}>
      <span className={css.star} aria-hidden="true">{item.favorite ? '★' : '☆'}</span>
      {t(item.favorite ? 'saved' : 'favorite')}
    </button>
    {item.installed
      ? <>
        {item.updateAvailable && (item.upgradeRequired && !pendingInstall
          // The registry refuses an update without the licence too, so its action
          // leads to the purchase instead of a failure notice.
          ? <UpgradeAction t={t} onUpgrade={onUpgrade} />
          : <Button variant="primary" size="sm" disabled={busy} onClick={onUpdate}
            icon={<IconDownloadOutlineRegular size={14} />}>
            {t(pending?.kind === 'update' ? 'updating' : 'update', { version: item.version })}
          </Button>)}
        {item.enabled
          ? item.openable
            ? <Button variant="outline" size="sm" onClick={onOpen}>{t('open')}</Button>
            // The product page states its actions instead of a status, and an update replaces the label.
            : !detail && !item.updateAvailable && <span className={css.installed}>
              <IconCheckOutlineRegular size={14} />{t(item.restartRequired ? 'restartRequired' : 'installed')}
            </span>
          : <Tag tone="neutral">{t('disabled')}</Tag>}
      </>
      : item.upgradeRequired
        // A licence is bought on the Platform, so the action leads there instead of
        // promising an installation the registry will refuse.
        ? <UpgradeAction t={t} onUpgrade={onUpgrade} />
        : <Button variant="primary" size="sm" disabled={busy || !item.installable} onClick={onInstall}
          title={busy && !pendingInstall ? t('anotherInstall') : undefined} icon={<IconDownloadOutlineRegular size={14} />}>
          {t(pending === undefined ? (item.installable ? 'install' : 'offlineInstall')
            : pending.kind === 'update' ? 'updating'
              : pending.phase === 'download' ? 'downloading'
                : pending.phase === 'apply' ? 'applying' : 'installing')}
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
  const cover = item.previewUrl ?? item.previews?.[0]
  return <article className={css.card} aria-label={item.title}>
    {cover && <WorkbenchPreview url={cover} label={t('preview', { name: item.title })} className={css.preview} />}
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
      {actions.pending && (actions.pending.kind === 'install' || actions.pending.kind === 'update') &&
        <WorkbenchProgress pending={actions.pending} t={t} name={item.title} />}
      <WorkbenchActions {...actions} />
    </div>
  </article>
}

/** Horizontal, snap-scrolling screenshots; a click opens the image full size. */
function WorkbenchPreviews({ item, t }: { item: WorkbenchPluginItem; t: TranslateNS<typeof NS> }): ReactNode {
  const urls = item.previews?.length ? item.previews : item.previewUrl ? [item.previewUrl] : []
  const [expanded, setExpanded] = useState<string>()
  useEffect(() => {
    if (expanded === undefined) return
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') setExpanded(undefined) }
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('keydown', close) }
  }, [expanded])
  if (!urls.length) return null
  return <>
    <div className={css.previewCarousel} aria-label={t('previews', { name: item.title })}>
      {urls.map(url => <button key={url} type="button" className={css.previewSlide}
        onClick={() => setExpanded(url)} aria-label={t('enlarge', { name: item.title })}>
        <img src={url} alt={t('preview', { name: item.title })} loading="lazy" referrerPolicy="no-referrer" />
      </button>)}
    </div>
    {expanded !== undefined && <div className={css.lightbox} role="dialog" aria-modal="true"
      aria-label={t('preview', { name: item.title })} onClick={() => setExpanded(undefined)}>
      <img className={css.lightboxImage} src={expanded} alt="" referrerPolicy="no-referrer"
        onClick={(event) => { event.stopPropagation() }} />
      <button type="button" className={css.lightboxClose} aria-label={t('close')}
        onClick={() => setExpanded(undefined)}>×</button>
    </div>}
  </>
}

function WorkbenchDetail({ item, t, actions, onBack }: {
  item: WorkbenchPluginItem
  t: TranslateNS<typeof NS>
  actions: ItemActions
  onBack(): void
}): ReactNode {
  const heading = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  // Uninstalling removes the workbench from the profile, so it asks for a second click first.
  const [confirming, setConfirming] = useState(false)
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }) }, [item.id])
  return <section className={css.detail} aria-labelledby={titleId}>
    <button type="button" className={css.back} onClick={onBack}>
      <IconChevronDownOutlineRegular size={14} aria-hidden="true" />{t('backToWorkbench')}
    </button>
    <header className={css.detailHeader}>
      <span className={css.detailIcon} aria-hidden="true">
        {item.iconUrl
          ? <img className={css.detailLogo} src={item.iconUrl} alt="" referrerPolicy="no-referrer" />
          : <PluginArtworkDefault size={42} />}
      </span>
      <div className={css.identity}>
        <div className={css.titleLine}><h1 id={titleId} ref={heading} tabIndex={-1}>{item.title}</h1><Tag tone="neutral">{item.version}</Tag></div>
        <span className={css.packageName}>{item.packageName}</span>
      </div>
      <WorkbenchActions {...actions} detail />
      {item.installed && <Button variant="outline" size="sm" className={css.danger}
        icon={<IconTrashOutlineRegular size={13} />} disabled={actions.busy}
        aria-label={t('uninstallLabel', { name: item.title })} onClick={() => setConfirming(true)}>
        {t('uninstall')}
      </Button>}
      {item.installed && <Switch checked={item.enabled} label={t('enableToggle', { name: item.title })}
        disabled={actions.busy} onChange={(next) => { actions.onSetEnabled(next) }} />}
    </header>
    {actions.pending && (actions.pending.kind === 'install' || actions.pending.kind === 'update') &&
      <WorkbenchProgress pending={actions.pending} t={t} name={item.title} />}
    {item.description && <p className={css.summary}>{item.description}</p>}
    <WorkbenchPreviews item={item} t={t} />
    {item.links?.length ? <section className={css.linksSection}>
      <h2>{t('relatedLinks')}</h2>
      <div className={css.links}>
        {item.links.map(link => <a key={link.url} className={css.linkCard} href={link.url}
          target="_blank" rel="noopener noreferrer">
          {link.image && <img className={css.linkImage} src={link.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <span className={css.linkTitle}>{link.title}</span>
        </a>)}
      </div>
    </section> : null}
    {confirming && <Modal open onClose={() => setConfirming(false)}
      title={t('confirmUninstallTitle', { name: item.title })} closeLabel={t('close')}
      description={t('confirmUninstallDescription')}
      footer={<>
        <Button variant="outline" onClick={() => setConfirming(false)}>{t('cancel')}</Button>
        <Button variant="primary" className={css.dangerButton} disabled={actions.busy}
          onClick={() => { setConfirming(false); actions.onUninstall() }}>{t('uninstall')}</Button>
      </>} />}
  </section>
}

/** Keep the current catalog visible during refresh and discard out-of-order responses. */
export function WorkbenchPage({ pluginStore, openSubscriptionPage, t }: WorkbenchPageProps): ReactNode {
  const [items, setItems] = useState<readonly WorkbenchPluginItem[] | undefined>()
  const [loading, setLoading] = useState(true)
  /** The directory read failed; the market keeps its rows and offers a retry. */
  const [loadFailed, setLoadFailed] = useState(false)
  const [tab, setTab] = useState<Tab>('market')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [detailId, setDetailId] = useState<string>()
  const page = useRef<HTMLElement>(null)
  const listHeading = useRef<HTMLHeadingElement>(null)
  const returnTo = useRef<{ button: HTMLButtonElement; scroll: number }>()
  const generation = useRef(0)
  const tabsId = useId()
  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current
    setLoading(true)
    try {
      const result = await pluginStore.load(refresh)
      if (request === generation.current) {
        setItems(result)
        setLoadFailed(false)
      }
    } catch {
      if (request === generation.current) setLoadFailed(true)
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [pluginStore])

  useEffect(() => {
    // Progress and settlement notifications re-project the store without another Host read.
    const unsubscribe = pluginStore.subscribe(() => { setItems(pluginStore.snapshot()) })
    void load()
    return () => { generation.current++; unsubscribe() }
  }, [pluginStore, load])

  // An operation the registry refused reports through the floating notice, so the
  // cards keep their layout instead of pushing a banner into the grid.
  const act = async (action: () => void | Promise<void>, failure: WorkbenchLocaleKey) => {
    try {
      await action()
    } catch (error) {
      pluginStore.notifyNotice(needsSignIn(error) ? 'signInRequired' : needsPro(error) ? 'proRequired' : failure)
    }
  }

  const all = items ?? []
  const busy = all.some(item => item.pending !== undefined)
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
    return { item, t, pending: item.pending, busy,
      onInstall: () => { void act(() => pluginStore.install(item.id), 'installError') },
      // The licence lands on the account, so coming back from its page re-reads it
      // and lets the same card offer the installation.
      onUpgrade: () => { openSubscriptionPage(() => { void pluginStore.refreshEntitlement() }) },
      onUpdate: () => { void act(() => pluginStore.update(item.id), 'updateError') },
      onUninstall: () => { void act(() => pluginStore.uninstall(item.id), 'uninstallError') },
      onSetEnabled: (enabled) => { void act(() => pluginStore.setEnabled(item.id, enabled), 'toggleError') },
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
      onBack={() => { setDetailId(undefined) }} /></div>}
    <div className={css.content} hidden={Boolean(detail)}>
      <header className={css.header}>
        <h1 ref={listHeading} tabIndex={-1}>{t('title')}</h1>
        <div className={css.headerActions}>
          <Input type="search" className={css.search as string} icon={<IconSearchOutlineRegular size={16} />}
            value={query} onChange={event => setQuery(event.target.value)} aria-label={t('search')} placeholder={t('search')} />
        </div>
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
            disabled={loading} onClick={() => { setLoadFailed(false); void load(true) }}
            icon={<IconRefreshOutlineRegular size={15} />} />
        </div>
      </div>
      {loadFailed && <p className={css.error} role="alert">{t('loadError')}</p>}
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
            setDetailId(item.id)
          }} />)}
        </div>
      </section>
    </div>
  </main>
}
