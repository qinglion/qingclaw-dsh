/** Sidebar account launcher and locally authoritative sign-out action. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Toast, Menu, MenuItemButton, IconEllipsisOutlineMedium, IconSettingsOutlineMedium, IconUserOutlineMedium,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountSectionInjected } from './AccountSection.tsx'
import { SignOutDialog } from './SignOutDialog.tsx'
import { SignInDialog } from './SignInDialog.tsx'
import { LogoutIcon } from './LogoutIcon.tsx'
import { AccountAvatar } from './AccountAvatar.tsx'
import type {} from './account-ui.ts'
import css from './AccountMenu.module.css'

/** Account launcher composed by the settings shell. */
export type AccountMenuProps = PropsRuntime<'settings.launcher'> & PropsRenderSlots<'settings.launcher.notifications' | 'settings.launcher.actions' | 'settings.launcher.tools' | 'settings.launcher.feedback'> & PropsLocale<'settings.account'> & InjectFace<AccountSectionInjected>

/** The signed-in label stays empty while the profile loads.
 * @param props - sidebar geometry, settings navigation and account operations.
 * @returns account menu launcher.
 */
export function AccountMenu({
  subscribeSessionExpired, subscribeModelSignInRequired, wide, settingsShortcut, openSettings, openOnboarding, settingsOpen,
  useAccount, useTheme, signOut, hasRunningAccountTasks, refreshAccount, renderSlot,
  showLogin, start, cancel, avatarFailed, t,
  allowApiKey,
}: AccountMenuProps) {
  // The launcher outlives the panel, so a false-to-true edge is one Settings entry:
  // re-renders, section switches and tab switches inside one open must not read again.
  const settingsWasOpen = useRef(false)
  useEffect(() => {
    if (settingsOpen && !settingsWasOpen.current) void refreshAccount()
    settingsWasOpen.current = settingsOpen
  }, [refreshAccount, settingsOpen])
  const account = useAccount(state => state)
  const colorScheme = useTheme(snapshot => snapshot.active.colorScheme)
  const signedIn = account.view?.status === 'credential-stored'
  const [signInNotice, setSignInNotice] = useState(0)
  useEffect(() => subscribeModelSignInRequired?.(() => { setSignInNotice(value => value + 1) }), [subscribeModelSignInRequired])
  const [expiryNotice, setExpiryNotice] = useState(false)
  useEffect(() => subscribeSessionExpired?.(() => { setExpiryNotice(true) }), [subscribeSessionExpired])
  const profile = account.details?.profile
  const signedInFallback = t(allowApiKey ? 'signedIn' : 'signedInGeneric')
  const label = profile === undefined ? null : profile.status === 'ready'
    ? profile.value.name || profile.value.contact || signedInFallback : signedInFallback
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [signOutImpact, setSignOutImpact] = useState<boolean | 'unknown'>()
  const requestSignOut = async () => {
    setBusy(true)
    try { setSignOutImpact(await hasRunningAccountTasks()); setOpen(false) }
    catch (_error) { setSignOutImpact('unknown'); setOpen(false) }
    finally { setBusy(false) }
  }
  // The plugin's start publishes `loginFailed` before it rejects, so the dialog owns the report.
  const beginSignIn = (): void => { setOpen(false); void start().catch(() => undefined) }
  const openAccount = useCallback(() => { openSettings('account') }, [openSettings])
  return <div className={css.root} data-inset={signedIn && wide} data-wide={wide}>
    {signInNotice > 0 && <Toast key={signInNotice} text={t('modelSignInRequired')} onDone={() => { setSignInNotice(0) }} />}
    {expiryNotice && <Toast text={t('sessionExpired')} onDone={() => { setExpiryNotice(false) }} />}
    <div className={css.notifications} hidden={!wide}>{renderSlot('settings.launcher.notifications', {
      active: signedIn && !account.desktopOnboardingVisible && !account.onboarding, openAccount,
    })}</div>
    <Menu open={open} side="top" portal autoFocus className={css.anchor} listClassName={signedIn ? undefined : css.signedOutMenu}
      anchor={<button ref={trigger} type="button" className={css.trigger} data-collapsed={!wide} data-signed-out={!signedIn} aria-label={t('menu')}
        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        {signedIn
          ? <span className={css.avatar} data-avatar-status={account.avatar?.status}>
            <AccountAvatar avatar={account.avatar} avatarFailed={avatarFailed} />
          </span>
          : <IconEllipsisOutlineMedium size={14} />}
        {wide && <span className={css.label}>{signedIn ? label : t('more')}</span>}
      </button>}
      items={[
        { id: 'settings', label: t('settings'), icon: <IconSettingsOutlineMedium size={16} />,
          ...(settingsShortcut === undefined ? {} : { shortcut: settingsShortcut }) },
      ]}
      onClose={() => { setOpen(false) }}
      onSelect={(id) => {
        if (id === 'settings') { setOpen(false); trigger.current?.focus(); openSettings() }

      }}>
      {open && signedIn && renderSlot('settings.launcher.actions', { onDismiss: () => { setOpen(false) } })}
      {renderSlot('settings.launcher.feedback', {
        onDismiss: () => { setOpen(false) },
        restoreFocus: () => { trigger.current?.focus() },
      })}
      {signedIn
        ? <MenuItemButton icon={<LogoutIcon />} disabled={busy} onSelect={() => { void requestSignOut() }}>
          {t('signOut')}
        </MenuItemButton>
        : <MenuItemButton icon={<IconUserOutlineMedium size={16} />} onSelect={beginSignIn}>
          {t('signIn')}
        </MenuItemButton>}
    </Menu>
    <div className={css.tools}>{renderSlot('settings.launcher.tools', { wide })}</div>
    {account.loginVisible && !account.onboarding && <SignInDialog account={account} colorScheme={colorScheme}
      start={start} cancel={cancel} t={t} allowApiKey={allowApiKey}
      close={() => { showLogin(false) }} useApiKey={() => { showLogin(false); openOnboarding('deepseek-official') }} />}
    {signedIn && signOutImpact !== undefined && <SignOutDialog running={signOutImpact} signOut={signOut}
      close={() => { setSignOutImpact(undefined) }} t={t} />}
  </div>
}
