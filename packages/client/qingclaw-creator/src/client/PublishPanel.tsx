import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { submitListing } from './api.ts'
import { CreatorNotice } from './Notice.tsx'
import { getSessionPlugin, getSessionProjectAt } from './project-api.ts'
import type { PluginProject, PublishCandidate } from '../project-types.ts'
import type { NS } from './locales.ts'
import css from './PublishPanel.module.css'

/** What the publish page calls into: the Session's directory and the publish action. */
export interface PublishInputs {
  /** The directory the Session works in, when the client knows it. */
  directoryOf(sessionId: SessionId): string | undefined
  /** Write the publish request into the Session that owns the page. */
  publish(sessionId: SessionId, candidate: PublishCandidate): void
}

/** The request one publish action writes into the conversation. */
export function publishPrompt(candidate: PublishCandidate): string {
  const target = JSON.stringify({
    directory: candidate.directory, packageName: candidate.project.name, version: candidate.project.version,
  })
  return '请使用 qingclaw-plugin-publish 技能，将当前工作区中指定目录的包版本发布到青狮 npm 私服。目标包信息：' + target
}

/** Where the page stands for one Session. */
type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'choose' }
  | { readonly kind: 'project'; readonly directory: string; readonly project: PluginProject }

const BINDING_PREFIX = 'qingclaw.creator.publish.v1.'

/**
 * Read this Session's associated package directory, relative to its own
 * directory, so a Session moved to a branch worktree follows it.
 * @param sessionId - the Session that owns the page.
 * @returns the relative directory, when the user associated one.
 */
function readBinding(sessionId: string): string | undefined {
  try {
    return window.localStorage.getItem(BINDING_PREFIX + sessionId) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Record or withdraw this Session's associated package directory.
 * @param sessionId - the Session that owns the page.
 * @param directory - the relative directory, or undefined to withdraw it.
 */
function writeBinding(sessionId: string, directory: string | undefined): void {
  try {
    if (directory === undefined) window.localStorage.removeItem(BINDING_PREFIX + sessionId)
    else window.localStorage.setItem(BINDING_PREFIX + sessionId, directory)
  } catch {
    // A read-only store keeps the page usable; only the association is lost.
  }
}

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<PublishInputs>

/**
 * Publish page: the plugin this Session's own directory holds, published by
 * writing a request into that conversation. A collection workspace has no
 * plugin at its root, so the page asks once for the one directory to publish
 * and remembers it for this Session.
 */
export function PublishPanel({ sessionId, directoryOf, publish, t }: Pick<Props, 'sessionId' | 'directoryOf' | 'publish' | 't'>) {
  const cwd = directoryOf(sessionId)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [entry, setEntry] = useState('')
  const [missing, setMissing] = useState(false)
  const [revision, refresh] = useState(0)
  const [listing, setListing] = useState<{ readonly kind: 'idle' | 'pending' | 'done' | 'failed'; readonly message?: string }>({ kind: 'idle' })
  const key = String(sessionId)
  useEffect(() => {
    const controller = new AbortController()
    setView({ kind: 'loading' })
    setMissing(false)
    void (async () => {
      try {
        const bound = readBinding(key)
        if (bound !== undefined) {
          const associated = await getSessionProjectAt(sessionId, bound, cwd, controller.signal)
          if (controller.signal.aborted) return
          if (associated !== undefined) {
            setView({ kind: 'project', directory: bound, project: associated })
            return
          }
          // The associated directory no longer holds a package; ask again.
          writeBinding(key, undefined)
        }
        const root = await getSessionPlugin(sessionId, cwd, controller.signal)
        if (controller.signal.aborted) return
        setView(root === undefined ? { kind: 'choose' } : { kind: 'project', directory: '.', project: root })
      } catch (error) {
        if (!controller.signal.aborted) {
          setView({ kind: 'failed', reason: error instanceof Error ? error.message : 'unknown' })
        }
      }
    })()
    return () => { controller.abort() }
  }, [key, sessionId, cwd, revision])
  const associate = async (): Promise<void> => {
    const relative = entry.trim()
    if (!relative) return
    setMissing(false)
    try {
      const found = await getSessionProjectAt(sessionId, relative, cwd, new AbortController().signal)
      if (found === undefined) { setMissing(true); return }
      writeBinding(key, relative)
      setEntry('')
      setView({ kind: 'project', directory: relative, project: found })
    } catch (error) {
      setView({ kind: 'failed', reason: error instanceof Error ? error.message : 'unknown' })
    }
  }
  const requestListing = async (chosen: PublishCandidate): Promise<void> => {
    setListing({ kind: 'pending' })
    try {
      await submitListing(chosen.project.name, chosen.project.version, new AbortController().signal)
      setListing({ kind: 'done', message: t('submitted') })
    } catch (error) {
      // The website owns the listing requirements; show its own refusal verbatim.
      setListing({ kind: 'failed', message: error instanceof Error && error.message ? error.message : t('loadFailure') })
    }
  }
  const candidate: PublishCandidate | undefined = view.kind === 'project'
    ? { directory: view.directory, project: view.project } : undefined
  return <section className={css.page}>
    <div className={css.head}>
      <div className={css.headings}>
        <h2 className={css.title}>{t('publishTitle')}</h2>
        {cwd !== undefined && <p className={css.source} title={cwd}>{t('publishSource')} {cwd}</p>}
      </div>
      <Button variant="ghost" disabled={view.kind === 'loading'} onClick={() => { refresh(n => n + 1) }}>{t('reload')}</Button>
    </div>
    {view.kind === 'loading' && <p className={css.hint}>{t('loading')}</p>}
    {view.kind === 'failed' && <CreatorNotice tone="error" title={t('noticeReadFailed')}>
      {t('publishReadFailed')}（{view.reason}）
    </CreatorNotice>}
    {view.kind === 'project' && candidate !== undefined && <div className={css.card}>
      <div className={css.cardHead}>
        <p className={css.name}>{candidate.project.title}</p>
        <code className={css.version}>{candidate.project.version}</code>
      </div>
      <p className={css.meta}>{candidate.project.name} · {candidate.directory === '.' ? './' : candidate.directory}</p>
      <div className={css.actions}>
        <Button variant="outline" onClick={() => { publish(sessionId, candidate) }}>{t('publish')}</Button>
        <Button variant="ghost" disabled={listing.kind === 'pending'} onClick={() => { void requestListing(candidate) }}>
          {t('publishList')}</Button>
        {candidate.directory === '.' ? null : <Button variant="ghost" onClick={() => { writeBinding(key, undefined); refresh(n => n + 1) }}>
          {t('publishChange')}</Button>}
      </div>
    </div>}
    {view.kind === 'choose' && <div className={css.card}>
      <p className={css.name}>{t('unrecognizedRoot')}</p>
      <p className={css.hint}>{t('publishDirectoryHint')}</p>
      <div className={css.chooseRow}>
        <Input value={entry} placeholder={t('publishDirectory')} aria-label={t('publishDirectory')}
          onChange={(event) => { setEntry(event.target.value); setMissing(false) }} />
        <Button variant="outline" disabled={!entry.trim()} onClick={() => { void associate() }}>{t('publishUse')}</Button>
      </div>
      {missing && <CreatorNotice tone="error" title={t('publishMissing')} />}
    </div>}
    {listing.kind === 'done' && <CreatorNotice tone="success" title={t('submitted')} />}
    {listing.kind === 'failed' && <CreatorNotice tone="error" title={t('noticeListingRefused')}>{listing.message}</CreatorNotice>}
  </section>
}
