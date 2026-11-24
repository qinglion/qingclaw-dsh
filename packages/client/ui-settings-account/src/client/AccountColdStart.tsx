/** Branded desktop cold start that owns only account authorization. */
import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignInDialog } from './SignInDialog.tsx'

/** Render browser/WeChat authorization without exposing an API-key provider. */
export function AccountColdStart({ complete, useAccount, useTheme, setOnboarding, showLogin, start, cancel, t }:
  PropsRuntime<'settings.onboarding'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>) {
  const account = useAccount(value => value)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  useEffect(() => { setOnboarding(true); return () => { setOnboarding(false) } }, [setOnboarding])
  useEffect(() => { if (account.view?.status === 'credential-stored') complete() }, [account.view?.status, complete])
  if (!account.view || account.view.status === 'credential-stored') return null
  return <SignInDialog account={account} colorScheme={colorScheme} start={start} cancel={cancel} t={t}
    allowApiKey={false} close={() => { showLogin(false); complete() }} useApiKey={() => {}} />
}
