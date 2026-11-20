import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings-account/client'
import css from './MobilePairingAction.module.css'

type Props = PropsRuntime<'settings.launcher.tools'> & PropsLocale<'qingclaw.admin'> & InjectFace<{ openPairing(): Promise<void> }>

/** Owner-only Desktop bridge; browsers without a native pairing window have no entry. */
export function MobilePairingAction({ openPairing, t }: Props) {
  const [state, setState] = useState<'ready' | 'opening' | 'failed'>('ready')
  return <div className={css.control}>
    <button type="button" className={css.button} disabled={state === 'opening'}
      aria-label={t('connectPhone')} title={t('connectPhone')} onClick={() => {
        setState('opening')
        void openPairing().then(() => setState('ready'), () => setState('failed'))
      }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" />
      </svg>
    </button>
    {state === 'failed' && <span className={css.failure} role="alert">{t('pairingFailed')}</span>}
  </div>
}
