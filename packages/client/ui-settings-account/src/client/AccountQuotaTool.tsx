import { useState } from 'react'
import type { AccountProfile } from '@deepseek-ai/dsh-deepseek-account/types'
import { Menu, MenuItemButton, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { PlatformPages } from './platform-pages.ts'
import { formatCredits } from './formatBalance.ts'
import css from './AccountQuotaTool.module.css'

interface QuotaToolFace {
  hooks: { account: HostObservable<AccountSnapshot> }
  refreshAccount: () => Promise<void>
  openPlatformPage?: PlatformPages['open']
}

type QuotaToolProps = PropsRuntime<'settings.launcher.tools'> & PropsLocale<'settings.account'> & InjectFace<QuotaToolFace>

/** Show the credits left as a share of the total granted since the last recharge. */
export function AccountQuotaTool({ wide, t, useAccount, refreshAccount, openPlatformPage }: QuotaToolProps) {
  const account = useAccount(value => value)
  const profile = account.details?.profile
  if (account.failed || account.view?.status !== 'credential-stored' || profile?.status !== 'ready') return null
  if (profile.value.quotaRemaining == null && profile.value.quotaTotal == null) return null
  return <QuotaMenu key={profile.value.id} wallet={profile.value} usageUrl={account.view.links.usageUrl}
    wide={wide} t={t} refreshAccount={refreshAccount} openPlatformPage={openPlatformPage} />
}

/** Credit share of the recharge total; a recharge resets the denominator and refills the numerator. */
function quotaPercent(remaining: number | null | undefined, total: number | null | undefined): number | undefined {
  if (remaining == null || remaining < 0 || total == null || total < 0) return undefined
  if (total === 0) return remaining === 0 ? 0 : undefined
  return Math.min(100, Math.round(remaining / total * 100))
}

function QuotaMenu({ wallet, usageUrl, wide, t, refreshAccount, openPlatformPage }:
  Pick<QuotaToolProps, 'wide' | 't' | 'refreshAccount'> & {
    wallet: AccountProfile
    usageUrl: string
    openPlatformPage: PlatformPages['open'] | undefined
  }) {
  const [open, setOpen] = useState(false)
  const percent = quotaPercent(wallet.quotaRemaining, wallet.quotaTotal)
  const unknown = t('quotaUnknown')
  const label = `${t('quotaRemaining')} · ${percent === undefined ? unknown : `${percent}%`}`
  const sources: string[] = []
  if (wallet.plan) {
    sources.push(t('quotaPlan', { plan: wallet.plan.charAt(0).toUpperCase() + wallet.plan.slice(1) }))
  }
  if (wallet.trialTokens && wallet.trialTokens > 0) sources.push(t('quotaTrial'))
  if (wallet.topupTokens && wallet.topupTokens > 0) sources.push(t('quotaPurchased'))
  return <Menu open={open} side="top" align="end" portal autoFocus listClassName={css.popover}
    onClose={() => { setOpen(false) }}
    anchor={<Tooltip label={label} side={wide ? 'top' : 'right'} portal disabled={open}>
      <button type="button" className={css.trigger} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => {
          setOpen(!open)
          if (!open) void refreshAccount().catch(() => undefined)
        }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle className={css.track} cx="12" cy="12" r="8.5" strokeWidth="2.6" />
          {percent !== undefined && percent > 0 && <circle className={css.value} cx="12" cy="12" r="8.5" strokeWidth="2.6"
            pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 12 12)" />}
        </svg>
      </button>
    </Tooltip>}
  >
    <div className={css.content}>
      <div className={css.source}>{t('quotaSource')} {sources.join(' + ') || unknown}</div>
      <dl className={css.rows}>
        <div><dt>{t('quotaTotal')}</dt><dd>{wallet.quotaTotal == null ? unknown : formatCredits(wallet.quotaTotal)}</dd></div>
        <div><dt>{t('quotaRemaining')}</dt><dd>{wallet.quotaRemaining == null ? unknown : formatCredits(wallet.quotaRemaining)}</dd></div>
      </dl>
    </div>
    <MenuItemButton disabled={!openPlatformPage && !usageUrl} onSelect={() => {
      setOpen(false)
      if (openPlatformPage) openPlatformPage('usage', () => undefined)
      else if (usageUrl) window.open(usageUrl, '_blank', 'noopener,noreferrer')
    }}>{t('quotaManage')}</MenuItemButton>
  </Menu>
}
