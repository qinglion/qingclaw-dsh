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

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & InjectFace<PublishInputs>

/**
 * Publish page: the plugin this Session's own directory holds, published by
 * writing a request into that conversation. A collection workspace usually has
 * no plugin at its root, so the page asks for the one directory to publish
 * instead of listing every package underneath it.
 */
export function PublishPanel({ sessionId, publish, t }: Pick<Props, 'sessionId' | 'publish' | 't'>) {
  const [project, setProject] = useState<PluginProject>()
  const [directory, setDirectory] = useState('.')
  const [entry, setEntry] = useState('')
  const [missing, setMissing] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setFailed(false); setMissing(false)
    void getSessionPlugin(sessionId, controller.signal).then((found) => {
      if (controller.signal.aborted) return
      setProject(found); setDirectory('.'); setEntry(''); setLoading(false)
    }).catch(() => { if (!controller.signal.aborted) { setLoading(false); setFailed(true) } })
    return () => { controller.abort() }
  }, [sessionId, revision])
  const useDirectory = async (): Promise<void> => {
    const relative = entry.trim()
    if (!relative) return
    setMissing(false); setFailed(false)
    try {
      const found = await getSessionProjectAt(sessionId, relative, new AbortController().signal)
      if (found === undefined) { setMissing(true); return }
      setProject(found); setDirectory(relative)
    } catch { setFailed(true) }
  }
  const candidate: PublishCandidate | undefined = project && { directory, project }
  return <section className={css.body}>
    <div className={css.sectionHead}><h2>{t('publish')}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => { refresh(n => n + 1) }}>{t('reload')}</Button></div>
    {loading ? <p>{t('loading')}</p> : failed ? <p role="alert">{t('scanFailed')}</p> : candidate
      ? <ul className={css.list}><li className={css.row}>
        <div>
          <p className={css.package}>{candidate.project.title}</p>
          <p className={css.muted}>{candidate.project.name} · {candidate.directory}</p>
        </div>
        <div className={css.actions}><code>{candidate.project.version}</code>
          <Button variant="outline" onClick={() => { publish(sessionId, candidate) }}>{t('publish')}</Button></div>
      </li></ul>
      : <>
        <p className={css.muted}>{t('unrecognizedRoot')}</p>
        <label className={css.sectionHead}>
          <input className={css.package} value={entry} placeholder={t('publishDirectory')}
            onChange={(event) => { setEntry(event.target.value); setMissing(false) }} />
          <Button variant="outline" disabled={!entry.trim()} onClick={() => { void useDirectory() }}>{t('publishUse')}</Button>
        </label>
        {missing && <p role="alert">{t('publishMissing')}</p>}
      </>}
  </section>
}
