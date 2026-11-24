/** Account state and presentation extension points shared with client plugins. */
import type { AccountClientMetadata, AccountView } from '@deepseek-ai/dsh-deepseek-account/types'

/** Latest account-stream availability, without notification state. */
export interface AccountUiState {
  readonly view: AccountView | undefined
  readonly failed: boolean
}

/** Read the account stream already owned by the account settings plugin. */
export interface AccountUi {
  /** Read the current state from the existing account snapshot.
   * @returns the latest account state.
   */
  getSnapshot(): AccountUiState
  /** Build metadata for one account request.
   * @param locale - requested language.
   * @returns this client's version, language, and timezone.
   */
  clientMetadata(locale: string): AccountClientMetadata
}

/** Account-menu facts supplied to its feedback row. */
export interface AccountFeedbackOwnerProps {
  /** Close the account menu before the row's action leaves it. */
  onDismiss: () => void
  /** Return focus to the account launcher after the row's surface closes. */
  restoreFocus: () => void
}

/** Account-menu presentation facts supplied to its notification extension. */
export interface AccountNotificationsOwnerProps {
  /** Whether the account menu can display notifications outside onboarding. */
  active: boolean
  /** Open the account section in the existing settings shell. */
  openAccount: () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context { accountUi: AccountUi }
  interface Events {
    /** Account stream update or loss of access. @mode parallel
     * @param state - latest account state.
     * @param reset - whether account availability, credentials, or the connection lifetime changed.
     */
    'account-ui/change'(state: AccountUiState, reset: boolean): void
    /** Explicit account refresh from Settings or a returned Platform page. @mode parallel */
    'account-ui/refresh'(): Promise<void>
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Compact controls beside the account menu, stacked in the collapsed rail. */
    'settings.launcher.tools': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
    /** Additional actions inside the signed-in account menu. */
    'settings.launcher.actions': { kind: 'list'; scope: 'root'; owner: { onDismiss: () => void } }
    /** Notifications anchored at the account menu; the contribution owns its markup and lifecycle. */
    'settings.launcher.notifications': { kind: 'single'; scope: 'root'; owner: AccountNotificationsOwnerProps }
    /**
     * The account menu's feedback row. One cell, lowest priority renders: the
     * built-in questionnaire row registers at 0, so a distribution replaces it
     * with its own feedback surface at a negative priority.
     */
    'settings.launcher.feedback': { kind: 'single'; scope: 'root'; owner: AccountFeedbackOwnerProps }
  }
}
