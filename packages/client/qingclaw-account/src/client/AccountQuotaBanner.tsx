/** Credit banner beside the composer, mounted from the conversation input dock. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formatCredits } from './formatCredits.ts'
import type { QuotaState } from './quota-store.ts'
import css from './AccountQuotaBanner.module.css'

/** Account facts the banner reads; every value arrives through the injected hook. */
export interface AccountQuotaBannerInjected {
  /** Shared quota facts. */
  readonly hooks: { readonly account: HostObservable<QuotaState> }
}

type AccountQuotaBannerProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'qingclaw.account'>
  & InjectFace<AccountQuotaBannerInjected>

/**
 * Show a credit warning beside the composer when the balance is empty or has
 * reached 5% of the credits granted since the last recharge.
 * @param props - composer geometry, quota hook and localized copy.
 * @returns the banner, or null when the account has no low balance.
 */
export function AccountQuotaBanner({ useAccount, t }: AccountQuotaBannerProps) {
  const profile = useAccount(state => state.profile)
  const topUpUrl = useAccount(state => state.topUpUrl)
  if (profile === undefined) return null
  const { quotaRemaining: remaining, quotaTotal: total } = profile
  if (remaining == null) return null
  const low = total != null && total > 0 && remaining <= total * 0.05
  const text = remaining <= 0
    ? t('quotaBannerEmpty')
    : low ? `${t('quotaBannerLow')} ${formatCredits(remaining)}` : null
  if (text === null) return null
  return <div className={css.banner} role="status">
    <span className={css.text}>{text}</span>
    {topUpUrl !== '' && <button type="button" className={css.action} onClick={() => {
      window.open(topUpUrl, '_blank', 'noopener,noreferrer')
    }}>
      {t('quotaBannerAction')}
    </button>}
  </div>
}
