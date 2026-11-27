/** Sealing for the persisted phone pairing, which carries a remote-access credential. */
import { safeStorage } from 'electron'

/** Seals and unseals the pairing record with the platform key store when it is available. */
export type PairingCipher = {
  /** @param plaintext - record to protect. @returns the stored representation. */
  seal(plaintext: string): string
  /** @param value - stored representation. @returns the record, or undefined when the key is gone. */
  unseal(value: string): string | undefined
}

/**
 * Choose the strongest sealing the platform offers.
 *
 * The platform key store seals the credential when available; otherwise the
 * owner-only file mode is the only protection, and the next launch after a
 * key-store change starts a fresh pairing.
 * @returns sealing helpers for the pairing store.
 */
export function pairingCipher(): PairingCipher {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      seal: plaintext => 'encrypted:' + safeStorage.encryptString(plaintext).toString('base64'),
      unseal: (value) => {
        if (!value.startsWith('encrypted:')) return undefined
        try {
          return safeStorage.decryptString(Buffer.from(value.slice('encrypted:'.length), 'base64'))
        } catch {
          // A rotated or unavailable key-store entry is expected; the phone scans again.
          return undefined
        }
      },
    }
  }
  return {
    seal: plaintext => 'plain:' + Buffer.from(plaintext, 'utf8').toString('base64'),
    unseal: value => value.startsWith('plain:')
      ? Buffer.from(value.slice('plain:'.length), 'base64').toString('utf8')
      : undefined,
  }
}
