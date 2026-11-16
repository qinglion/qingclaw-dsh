/** Persistent account quota banner beside the composer. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PlatformPageClaim, PlatformPages } from './platform-pages.ts'
import type { AccountSnapshot } from './AccountSection.tsx'
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

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return String(value)
}

/** Show a red-ish banner only when the wallet is empty, the subscription lapsed, or quota is low. */
export function AccountQuotaBanner({ useAccount, usePlatformPage, openPlatformPage, t }: AccountQuotaBannerProps) {
  const profile = useAccount(snapshot => snapshot.details?.profile)
  const topUpUrl = useAccount(snapshot => snapshot.view?.links.topUpUrl)
  const page = usePlatformPage(current => current)
  if (profile?.status !== 'ready' || page !== null) return null
  const value = profile.value
  const remaining = Reflect.get(value, 'quotaRemaining') as number | null | undefined
  if (remaining == null) return null
  const limit = (Reflect.get(value, 'quotaLimit') as number | null | undefined) ?? 0
  const expired = Reflect.get(value, 'subscriptionActive') === false
  const low = limit > 0 && remaining <= Math.max(5_000, Math.floor(limit * 0.05))
  if (remaining > 0 && !expired && !low) return null

  const text = remaining <= 0
    ? t('quotaBannerEmpty')
    : expired
      ? `${t('quotaBannerExpired')} ${compact(remaining)}`
      : `${t('quotaBannerLow')} ${compact(remaining)}`
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
