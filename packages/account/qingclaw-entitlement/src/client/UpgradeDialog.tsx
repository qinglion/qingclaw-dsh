/** Full-frame prompt shown when a lapsed user tries to enable a workbench. */
import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpgradeRequired } from '../events.ts'
import { NS } from './locales.ts'
import css from './UpgradeDialog.module.css'

/** Business face the overlay entry injects. */
export interface UpgradeDialogInjected {
  /** The prompt to show, or undefined while none shows. */
  readonly hooks: { readonly request: HostObservable<UpgradeRequired | undefined> }
  /** Close without upgrading. */
  readonly dismiss: () => void
  /** Open the platform subscription page. */
  readonly openUpgrade: () => void
}

/** Props of the `shell.overlay` entry. */
export type UpgradeDialogProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & InjectFace<UpgradeDialogInjected>

/**
 * Render the upgrade prompt, or nothing while the gate raised none.
 * @param props - the prompt hook, its actions, and the locale seat.
 * @returns the dialog, or null.
 */
export function UpgradeDialog({ useRequest, dismiss, openUpgrade, t }: UpgradeDialogProps): ReactNode {
  const request = useRequest(current => current)
  if (request === undefined) return null
  return (
    <div
      className={css.backdrop}
      onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss() }}
      onKeyDown={(event) => { if (event.key === 'Escape') dismiss() }}
    >
      <div className={css.dialog} role="dialog" aria-modal="true" aria-labelledby="qingclaw-entitlement-title">
        <h2 id="qingclaw-entitlement-title" className={css.title}>{t('title')}</h2>
        <p className={css.body}>{t('body', { name: request.title })}</p>
        <div className={css.actions}>
          <button type="button" className={css.secondary} onClick={dismiss}>{t('later')}</button>
          <button type="button" className={css.primary} onClick={openUpgrade} autoFocus>{t('upgrade')}</button>
        </div>
      </div>
    </div>
  )
}
