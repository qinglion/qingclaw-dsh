/** First-run prompt that asks for a QingClaw account instead of the upstream introduction. */
import { useEffect } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuotaState } from './quota-store.ts'
import css from './AccountOnboardingPrompt.module.css'

/** Facts and commands the first-run prompt reads. */
export interface AccountOnboardingPromptInjected {
  /** Shared quota facts. */
  readonly hooks: { readonly account: HostObservable<QuotaState> }
  /** Start the website sign-in flow. */
  readonly signIn: () => Promise<void>
}

type AccountOnboardingPromptProps = PropsRuntime<'settings.onboarding'>
  & PropsLocale<'qingclaw.account'>
  & InjectFace<AccountOnboardingPromptInjected>

/**
 * Ask for the deployment account during first run and hand the shell back once it is signed in.
 * @param props - onboarding completion, quota facts, the sign-in command and localized copy.
 * @returns the first-run prompt.
 */
export function AccountOnboardingPrompt({ useAccount, signIn, complete, t }: AccountOnboardingPromptProps) {
  const signedIn = useAccount(state => state.signedIn)
  useEffect(() => { if (signedIn) complete() }, [signedIn, complete])
  return <section className={css.prompt}>
    <h2 className={css.heading}>{t('signedOutTitle')}</h2>
    <p className={css.hint}>{t('signedOutHint')}</p>
    <Button variant="primary" onClick={() => { void signIn().catch(() => undefined) }}>{t('signIn')}</Button>
  </section>
}
