import { useEffect, useState, type ReactNode } from 'react'
import {
  DetailDocument, useDetailDocumentLabels, type DetailDocumentState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { needsSignIn, type WorkbenchPluginItem, type WorkbenchPluginStore, type WorkbenchReadmeDocument } from './workbench-plugin-store.ts'

/** Render the selected workbench version using the plugin detail page's Markdown surface. */
export function WorkbenchReadme({ item, pluginStore, language, t }: {
  readonly item: WorkbenchPluginItem
  readonly pluginStore: WorkbenchPluginStore
  readonly language: string
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const [retry, setRetry] = useState(0)
  const [read, setRead] = useState<{ key: string; value: WorkbenchReadmeDocument | null | 'error' | 'sign-in' }>()
  const key = JSON.stringify([item.id, item.version, item.installed, language, retry])
  useEffect(() => {
    let current = true
    void pluginStore.readReadme(item.id, item.version, language).then(
      (value) => { if (current) setRead({ key, value }) },
      (error: unknown) => { if (current) setRead({ key, value: needsSignIn(error) ? 'sign-in' : 'error' }) },
    )
    return () => { current = false }
  }, [pluginStore, key, item.id, item.version, language])
  const value = read?.key === key ? read.value : undefined
  let state: DetailDocumentState
  if (value === undefined) state = { status: 'loading' }
  else if (value === 'error') state = { status: 'error', message: t('readmeError') }
  else if (value === 'sign-in') state = { status: 'error', message: t('signInRequired') }
  else if (value === null) state = { status: 'none' }
  else state = { status: 'found', markdown: value.markdown }
  const labels = useDetailDocumentLabels({
    title: t('readmeTitle'), loading: t('readmeLoading'), retry: t('retry'), copy: t('copy'),
    copied: t('copied'), codeBlock: t('codeBlock'), wrap: t('wrap'), unwrap: t('unwrap'), footnotes: t('footnotes'),
  })
  return <DetailDocument state={state} labels={labels}
    images={value && typeof value === 'object' && value.resolveImage ? { resolve: value.resolveImage } : undefined}
    onRetry={() => setRetry(attempt => attempt + 1)} />
}
