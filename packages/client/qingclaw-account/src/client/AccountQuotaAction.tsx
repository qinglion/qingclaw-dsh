/** Sidebar footer control showing the credits left as a share of the total granted. */
import { useState } from 'react'
import { Menu, MenuItemButton, QINGCLAW_MARK_INK, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formatCredits } from './formatCredits.ts'
import type { QuotaState } from './quota-store.ts'
import css from './AccountQuotaAction.module.css'

/** Account facts and operations the footer control reads. */
export interface AccountQuotaActionInjected {
  /** Shared quota facts. */
  readonly hooks: { readonly account: HostObservable<QuotaState> }
  /** Read the account again when the menu opens. */
  readonly refresh: () => Promise<void>
}

type AccountQuotaActionProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<'qingclaw.account'>
  & InjectFace<AccountQuotaActionInjected>

/**
 * Show the credits left as a share of the total granted since the last recharge.
 * @param props - sidebar width, quota hook, refresh operation and localized copy.
 * @returns the quota control, or null for a signed-out or unreadable account.
 */
export function AccountQuotaAction({ wide, t, useAccount, refresh }: AccountQuotaActionProps) {
  const state = useAccount(value => value)
  const profile = state.profile
  if (!state.signedIn || profile === undefined) return null
  if (profile.quotaRemaining == null && profile.quotaTotal == null) return null
  return <QuotaMenu key={profile.id} profile={profile} usageUrl={state.usageUrl} wide={wide} t={t} refresh={refresh} />
}

/** Credit share of the recharge total; a recharge resets the denominator and refills the numerator. */
function quotaPercent(remaining: number | null | undefined, total: number | null | undefined): number | undefined {
  if (remaining == null || remaining < 0 || total == null || total < 0) return undefined
  if (total === 0) return remaining === 0 ? 0 : undefined
  return Math.min(100, Math.round(remaining / total * 100))
}

function QuotaMenu({ profile, usageUrl, wide, t, refresh }:
  Pick<AccountQuotaActionProps, 'wide' | 't'> & { profile: QuotaState['profile']; usageUrl: string; refresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const percent = quotaPercent(profile?.quotaRemaining, profile?.quotaTotal)
  const unknown = t('quotaUnknown')
  const label = `${t('quotaRemaining')} · ${percent === undefined ? unknown : `${percent}%`}`
  // A licence grants no credits: the balance is the trial grant plus top-ups.
  const sources: string[] = []
  if (profile?.trialTokens && profile.trialTokens > 0) sources.push(t('quotaTrial'))
  if (profile?.topupTokens && profile.topupTokens > 0) sources.push(t('quotaPurchased'))
  return <Menu open={open} side="top" align="end" portal autoFocus listClassName={css.popover}
    onClose={() => { setOpen(false) }}
    anchor={<Tooltip label={label} side={wide ? 'top' : 'right'} portal disabled={open}>
      <button type="button" className={css.trigger} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => {
          setOpen(!open)
          if (!open) void refresh().catch(() => undefined)
        }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.3">
          <circle className={css.coinRim} cx="12" cy="12" r="8.6" />
          {percent !== undefined && percent > 0 && <circle cx="12" cy="12" r="8.6" pathLength="100"
            strokeDasharray={`${percent} 100`} strokeLinecap="round" transform="rotate(-90 12 12)" />}
          <path fill={QINGCLAW_MARK_INK.teal} stroke="none" d="M12 8.8 15.2 12 12 15.2 8.8 12Z" />
        </svg>
      </button>
    </Tooltip>}
  >
    <div className={css.summary}>
      <p className={css.source}>{t('quotaSourceValue', { source: sources.join(' + ') || unknown })}</p>
      <dl className={css.metrics}>
        <div><dt>{t('quotaTotal')}</dt><dd>{profile?.quotaTotal == null ? unknown : formatCredits(profile.quotaTotal)}</dd></div>
        <div><dt>{t('quotaRemaining')}</dt><dd>{profile?.quotaRemaining == null ? unknown : formatCredits(profile.quotaRemaining)}</dd></div>
      </dl>
    </div>
    <MenuItemButton separatorBefore disabled={usageUrl === ''} onSelect={() => {
      setOpen(false)
      if (usageUrl !== '') window.open(usageUrl, '_blank', 'noopener,noreferrer')
    }}>{t('quotaManage')}</MenuItemButton>
  </Menu>
}
