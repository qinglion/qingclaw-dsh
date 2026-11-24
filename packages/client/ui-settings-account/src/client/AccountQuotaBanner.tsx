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

/**
 * Show a credit warning beside the composer when the balance is empty or has
 * reached 5% of the credits granted since the last recharge. A licence grants no
 * credits, so every account, free or paid, is pointed at a top-up.
 */
export function AccountQuotaBanner({ useAccount, usePlatformPage, openPlatformPage, t }: AccountQuotaBannerProps) {
  const profile = useAccount(snapshot => snapshot.details?.profile)
  const topUpUrl = useAccount(snapshot => snapshot.view?.links.topUpUrl)
  const page = usePlatformPage(current => current)
  if (profile?.status !== 'ready' || page !== null) return null
  const { quotaRemaining: remaining, quotaTotal: total } = profile.value
  if (remaining == null) return null
  const low = total != null && total > 0 && remaining <= total * 0.05
  const text = remaining <= 0
    ? t('quotaBannerEmpty')
    : low ? `${t('quotaBannerLow')} ${formatCredits(remaining)}` : null
  if (text === null) return null
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
