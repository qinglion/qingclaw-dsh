/** Persisted remote-pairing credential that keeps a scanned phone's link across desktop restarts. */
import { readFile, rm } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { z } from 'zod'
import type { RemoteRoom } from './mobile-relay.ts'

/** Whole-document protection supplied by the shell; a key-store rotation yields an unreadable record. */
export interface PairingCipher {
  /**
   * @param plaintext - record JSON to protect at rest.
   * @returns sealed value written to the pairing file.
   */
  seal(plaintext: string): string
  /**
   * @param sealed - value read from the pairing file.
   * @returns record JSON, or undefined when this machine cannot unseal it.
   */
  unseal(sealed: string): string | undefined
}

/** Storage location and the Platform identity the record belongs to. */
export interface PairingStoreOptions extends PairingCipher {
  path: string
  origin: string
  accountId: string | null
}

/** Persistence seam the bridge uses; a missing implementation disables resumption only. */
export interface PairingVault {
  /** @returns the stored room, or undefined when none is readable for this account. */
  load(): Promise<RemoteRoom | undefined>
  /** @param room - room just issued by the Platform; replaces any previous record. */
  save(room: RemoteRoom): Promise<void>
  /** Removes the record after an explicit disconnect or a server revocation. */
  clear(): Promise<void>
}

const credential = z.string().regex(/^[A-Za-z0-9_-]{16,512}$/)
const roomSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  desktopToken: credential,
  pairingSecret: credential,
  pairingExpiresAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
})
const recordSchema = z.object({
  version: z.literal(1),
  origin: z.string(),
  accountId: z.string().nullable(),
  room: roomSchema,
})

/**
 * Stores the room credential beside the other shell state, sealed by the OS key store when the
 * platform supplies one.
 *
 * The record grants remote access to this desktop's sessions, so it is written owner-only and
 * never used before its account identity matches. A record this process cannot read is ignored
 * rather than reported: the next pairing replaces it.
 */
export class PairingStore implements PairingVault {
  constructor(private readonly options: PairingStoreOptions) {}

  async load(): Promise<RemoteRoom | undefined> {
    let sealed: string
    try {
      sealed = (await readFile(this.options.path, 'utf8')).trim()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    const plaintext = this.options.unseal(sealed)
    if (plaintext === undefined) return undefined
    let document: unknown
    try {
      document = JSON.parse(plaintext)
    } catch {
      // A partially written or hand-edited file carries no usable room.
      return undefined
    }
    const parsed = recordSchema.safeParse(document)
    if (!parsed.success) return undefined
    const record = parsed.data
    if (record.origin !== this.options.origin) return undefined
    if (record.accountId !== null && record.accountId !== this.options.accountId) return undefined
    return record.room
  }

  async save(room: RemoteRoom): Promise<void> {
    const document = { version: 1 as const, origin: this.options.origin, accountId: this.options.accountId, room }
    await writeFileAtomic(this.options.path, this.options.seal(JSON.stringify(document)),
      { mode: 0o600, dirMode: 0o700, durable: true })
  }

  async clear(): Promise<void> {
    await rm(this.options.path, { force: true })
  }
}
