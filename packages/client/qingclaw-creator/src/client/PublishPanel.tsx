import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { getSessionPlugin, getSessionProjectAt } from './project-api.ts'
import type { PluginProject, PublishCandidate } from '../project-types.ts'
import type { NS } from './locales.ts'
import css from './CreatorCenter.module.css'

/** What the publish page calls into: it writes the request into the Session that owns the page. */
export interface PublishInputs {
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
  | { readonly kind: 'failed' }
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
    const value = window.localStorage.getItem(BINDING_PREFIX + sessionId)
    return value ?? undefined
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
export function PublishPanel({ sessionId, publish, t }: Pick<Props, 'sessionId' | 'publish' | 't'>) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [entry, setEntry] = useState('')
  const [missing, setMissing] = useState(false)
  const [revision, refresh] = useState(0)
  const key = String(sessionId)
  useEffect(() => {
    const controller = new AbortController()
    setView({ kind: 'loading' })
    setMissing(false)
    void (async () => {
      try {
        const bound = readBinding(key)
        if (bound !== undefined) {
          const associated = await getSessionProjectAt(sessionId, bound, controller.signal)
          if (controller.signal.aborted) return
          if (associated !== undefined) {
            setView({ kind: 'project', directory: bound, project: associated })
            return
          }
          // The associated directory no longer holds a package; ask again.
          writeBinding(key, undefined)
        }
        const root = await getSessionPlugin(sessionId, controller.signal)
        if (controller.signal.aborted) return
        setView(root === undefined ? { kind: 'choose' } : { kind: 'project', directory: '.', project: root })
      } catch {
        if (!controller.signal.aborted) setView({ kind: 'failed' })
      }
    })()
    return () => { controller.abort() }
  }, [key, sessionId, revision])
  const associate = async (): Promise<void> => {
    const relative = entry.trim()
    if (!relative) return
    setMissing(false)
    try {
      const found = await getSessionProjectAt(sessionId, relative, new AbortController().signal)
      if (found === undefined) { setMissing(true); return }
      writeBinding(key, relative)
      setEntry('')
      setView({ kind: 'project', directory: relative, project: found })
    } catch {
      setView({ kind: 'failed' })
    }
  }
  const candidate: PublishCandidate | undefined = view.kind === 'project'
    ? { directory: view.directory, project: view.project } : undefined
  return <section className={css.body}>
    <div className={css.sectionHead}><h2>{t('publish')}</h2>
      <Button variant="ghost" disabled={view.kind === 'loading'} onClick={() => { refresh(n => n + 1) }}>{t('reload')}</Button></div>
    {view.kind === 'loading' && <p>{t('loading')}</p>}
    {view.kind === 'failed' && <p role="alert">{t('scanFailed')}</p>}
    {view.kind === 'project' && candidate !== undefined && <ul className={css.list}><li className={css.row}>
      <div>
        <p className={css.package}>{candidate.project.title}</p>
        <p className={css.muted}>{candidate.project.name} · {candidate.directory}</p>
      </div>
      <div className={css.actions}><code>{candidate.project.version}</code>
        {candidate.directory === '.' ? null : <Button variant="ghost" onClick={() => { writeBinding(key, undefined); refresh(n => n + 1) }}>
          {t('publishChange')}</Button>}
        <Button variant="outline" onClick={() => { publish(sessionId, candidate) }}>{t('publish')}</Button></div>
    </li></ul>}
    {view.kind === 'choose' && <>
      <p className={css.muted}>{t('unrecognizedRoot')}</p>
      <div className={css.sectionHead}>
        <input className={css.package} value={entry} placeholder={t('publishDirectory')}
          onChange={(event) => { setEntry(event.target.value); setMissing(false) }} />
        <Button variant="outline" disabled={!entry.trim()} onClick={() => { void associate() }}>{t('publishUse')}</Button>
      </div>
      {missing && <p role="alert">{t('publishMissing')}</p>}
    </>}
  </section>
}
