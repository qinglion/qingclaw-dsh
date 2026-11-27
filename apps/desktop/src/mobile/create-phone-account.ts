/** Phone pairing for this distribution, built from the shell's own state. */
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account/types'
import { DesktopMobileAccount, registerMobileRoom } from '../mobile-account.ts'
import { MobilePairingWindow } from '../mobile-pairing-window.ts'
import { PairingStore } from './pairing-store.ts'
import { RemoteMobileBridge } from './remote-mobile-bridge.ts'
import { pairingCipher } from './pairing-cipher.ts'

/** Shell facts the pairing feature reads; every one is a live lookup. */
export interface PhoneAccountDeps {
  /** Public platform origin sealed into this build, or its environment override. */
  readonly platformOrigin: () => string
  /** Pairing record path under the Desktop user data directory. */
  readonly pairingPath: string
  /** Platform stylesheet the pairing page renders with. */
  readonly designCss: () => string
  /** Host origin while the backend is ready, so the phone can reach this desktop. */
  readonly harnessUrl: () => string | undefined
  /** Host authentication cookie while the backend is ready. */
  readonly harnessCookie: () => string | undefined
  /** Active shell language, narrowed to the pairing page's two languages. */
  readonly locale: () => 'zh' | 'en'
}

/**
 * Create the phone pairing owner and its window factory.
 * @param deps - the shell facts each pairing session reads.
 * @returns the account owner the shell drives with sessions and lifecycle calls.
 */
export function createPhoneAccount(deps: PhoneAccountDeps): DesktopMobileAccount {
  return new DesktopMobileAccount((account: PlatformSession) => {
    const origin = deps.platformOrigin()
    const bridge = new RemoteMobileBridge({
      platformOrigin: origin,
      desktopTheme: deps.designCss(),
      createRoom: signal => registerMobileRoom(origin, account, signal),
      harnessUrl: deps.harnessUrl,
      harnessCookie: deps.harnessCookie,
      locale: deps.locale,
      pairing: new PairingStore({
        path: deps.pairingPath,
        origin,
        accountId: account.userId,
        ...pairingCipher(),
      }),
    })
    const window = new MobilePairingWindow(bridge)
    return {
      restore: () => bridge.restore(),
      open: (parent, title) => window.open(parent, title),
      dispose: options => window.dispose(options),
    }
  })
}
