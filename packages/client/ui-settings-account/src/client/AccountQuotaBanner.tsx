/** Persistent account quota banner beside the composer. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PlatformPageClaim, PlatformPages } from './platform-pages.ts'
import type { AccountSnapshot } from './AccountSection.tsx'
import { formatCredits } from './formatBalance.ts'
import css from './AccountQuotaBanner.module.css'

/** Injected account data and the top-up page channel. */
export interface AccountQuotaBannerInjected {
  readonly openPlatformPage?: PlatformPages['open']
  hooks: {
    account: HostObservable<AccountSnapshot>
    platformPage: HostObservable<PlatformPageClaim | null>
  }
}

type AccountQuotaBannerProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'settings.account'>
  & InjectFace<AccountQuotaBannerInjected>

/** Show a red-ish banner only when the wallet is empty, the subscription lapsed, or quota is low. */
export function AccountQuotaBanner({ useAccount, usePlatformPage, openPlatformPage, t }: AccountQuotaBannerProps) {
  const profile = useAccount(snapshot => snapshot.details?.profile)
  const topUpUrl = useAccount(snapshot => snapshot.view?.links.topUpUrl)
  const page = usePlatformPage(current => current)
  if (profile?.status !== 'ready' || page !== null) return null
  const { quotaRemaining: remaining, quotaTotal: total, subscriptionActive, plan } = profile.value
  if (remaining == null) return null
  const expired = subscriptionActive === false && plan != null && plan !== 'free'
  const low = total != null && total > 0 && remaining <= total * 0.05
  if (remaining > 0 && !expired && !low) return null

  const text = remaining <= 0
    ? t('quotaBannerEmpty')
    : expired
      ? `${t('quotaBannerExpired')} ${formatCredits(remaining)}`
      : `${t('quotaBannerLow')} ${formatCredits(remaining)}`
  const openTopUp = () => {
    if (openPlatformPage !== undefined) {
      openPlatformPage('top-up', () => undefined)
    } else if (topUpUrl !== undefined) {
      window.open(topUpUrl, '_blank', 'noopener,noreferrer')
    }
  }
  return <div className={css.banner} role="status">
    <span className={css.text}>{text}</span>
    {(openPlatformPage !== undefined || topUpUrl !== undefined) && <button type="button" className={css.action} onClick={openTopUp}>
      {t('quotaBannerAction')}
    </button>}
  </div>
}
