/** QingClaw account settings page: identity, plan and credits for the signed-in website account. */
import { useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatCredits } from './formatCredits.ts'
import type { QuotaState } from './quota-store.ts'
import css from './AccountSettingsSection.module.css'

/** Plan tier a profile displays; an inactive paid plan reads as the free tier. */
type PlanTier = 'free' | 'pro' | 'team'

/** Operations and facts the account page reads. */
export interface AccountSettingsInjected {
  /** Shared quota facts. */
  readonly hooks: { readonly account: HostObservable<QuotaState> }
  /** Start the website sign-in flow. */
  readonly signIn: () => Promise<void>
  /** Sign the stored grant out. */
  readonly signOut: () => Promise<void>
  /** Read the account again. */
  readonly refresh: () => Promise<void>
  /** Show the deployment's top-up page. */
  readonly openTopUp: () => void
  /** Show the deployment's usage page. */
  readonly openUsage: () => void
  /** Whether signing out would interrupt running account tasks. */
  readonly hasRunningTasks: () => Promise<boolean>
}

type AccountSettingsProps = PropsRuntime<'settings.section'>
  & PropsLocale<'qingclaw.account'>
  & InjectFace<AccountSettingsInjected>

/**
 * Resolve the tier a profile displays.
 * @param plan - plan the deployment reported, when any.
 * @param active - whether a paid subscription is still active.
 * @returns the tier to display, or undefined when the deployment supplies no plan.
 */
export function planTier(plan: string | null | undefined, active: boolean | null | undefined): PlanTier | undefined {
  if (plan !== 'free' && plan !== 'pro' && plan !== 'team') return undefined
  if (plan !== 'free' && active === false) return 'free'
  return plan
}

/**
 * @param props - quota facts, account operations and localized copy.
 * @returns the QingClaw account page.
 */
export function AccountSettingsSection({
  useAccount, signIn, signOut, refresh, openTopUp, openUsage, hasRunningTasks, t,
}: AccountSettingsProps) {
  const [confirming, setConfirming] = useState(false)
  const state = useAccount(value => value)
  const profile = state.profile
  if (!state.signedIn || profile === undefined) {
    return <section className={css.page}>
      <h2 className={css.heading}>{t('signedOutTitle')}</h2>
      <p className={css.hint}>{t('signedOutHint')}</p>
      <div className={css.actions}>
        <Button variant="primary" onClick={() => { void signIn().catch(() => undefined) }}>{t('signIn')}</Button>
      </div>
    </section>
  }
  const tier = planTier(profile.plan, profile.subscriptionActive)
  const sources: string[] = []
  if (profile.trialTokens && profile.trialTokens > 0) sources.push(t('quotaTrial'))
  if (profile.topupTokens && profile.topupTokens > 0) sources.push(t('quotaPurchased'))
  const unknown = t('quotaUnknown')
  const requestSignOut = (): void => {
    void hasRunningTasks().then((running) => {
      if (!running) return signOut()
      setConfirming(true)
    }).catch(() => { setConfirming(true) })
  }
  return <section className={css.page}>
    <header className={css.identity}>
      {profile.avatarUrl ? <img className={css.avatar} src={profile.avatarUrl} alt="" /> : null}
      <div className={css.names}>
        <span className={css.name}>{profile.name ?? profile.contact ?? t('nav')}</span>
        {tier === undefined ? null
          : <span className={css.plan} data-tier={tier}>{t(tier === 'pro' ? 'planPro' : tier === 'team' ? 'planTeam' : 'planFree')}</span>}
      </div>
    </header>
    <dl className={css.metrics}>
      <div><dt>{t('quotaRemaining')}</dt><dd>{profile.quotaRemaining == null ? unknown : formatCredits(profile.quotaRemaining)}</dd></div>
      <div><dt>{t('quotaTotal')}</dt><dd>{profile.quotaTotal == null ? unknown : formatCredits(profile.quotaTotal)}</dd></div>
    </dl>
    <p className={css.source}>{t('quotaSourceValue', { source: sources.join(' + ') || unknown })}</p>
    <div className={css.actions}>
      <Button variant="primary" onClick={() => { openTopUp() }}>{t('topUp')}</Button>
      <Button variant="outline" onClick={() => { openUsage() }}>{t('quotaManage')}</Button>
      <Button variant="outline" onClick={() => { void refresh().catch(() => undefined) }}>{t('refresh')}</Button>
      {confirming
        ? <>
          <span className={css.confirm}>{t('signOutConfirm')}</span>
          <Button variant="outline" onClick={() => { setConfirming(false); void signOut().catch(() => undefined) }}>{t('signOutConfirmAction')}</Button>
          <Button variant="outline" onClick={() => { setConfirming(false) }}>{t('cancel')}</Button>
        </>
        : <Button variant="outline" onClick={requestSignOut}>{t('signOut')}</Button>}
    </div>
  </section>
}
