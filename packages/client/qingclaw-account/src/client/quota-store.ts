/** Account facts the credit surfaces read, refreshed from the account service. */
import type { Context } from '@deepseek-ai/cordis'
import type { AccountProfile } from '@deepseek-ai/dsh-deepseek-account/types'

/** One read of the account facts a credit surface needs. */
export interface QuotaState {
  /** Whether an account grant is stored. */
  readonly signedIn: boolean
  /** Ready profile, absent while signed out or before the first read settles. */
  readonly profile: AccountProfile | undefined
  /** Platform page that tops up the account, empty when the account publishes none. */
  readonly topUpUrl: string
  /** Platform page that lists usage, empty when the account publishes none. */
  readonly usageUrl: string
}

/** Snapshot source shared by every credit surface of this plugin. */
export interface QuotaStore {
  /** @returns the current facts. */
  readonly getSnapshot: () => QuotaState
  /** @param listener - called after every published change. @returns the unsubscribe callback. */
  readonly subscribe: (listener: () => void) => () => void
  /** Read the account again; a failed read keeps the previous facts. @returns fulfillment after the read settles. */
  readonly refresh: () => Promise<void>
}

const EMPTY: QuotaState = { signedIn: false, profile: undefined, topUpUrl: '', usageUrl: '' }

/**
 * Track the signed-in account's credits from the account service.
 * @param ctx - client plugin context owning the account service and its stream.
 * @returns the shared quota snapshot source.
 */
export function createQuotaStore(ctx: Context): QuotaStore {
  let state: QuotaState = EMPTY
  let reading: Promise<void> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: QuotaState): void => {
    state = next
    for (const listener of listeners) listener()
  }
  const read = async (): Promise<void> => {
    const snapshot = ctx.accountUi.getSnapshot()
    if (snapshot.view?.status !== 'credential-stored') {
      publish(EMPTY)
      return
    }
    const result = await ctx.remote.account.getProfile(ctx.accountUi.clientMetadata(ctx.locale.getSnapshot().active))
    if (!result.ok) return
    const details = result.value
    publish({
      signedIn: true,
      profile: details?.status === 'ready' ? details.value : undefined,
      topUpUrl: snapshot.view.links.topUpUrl,
      usageUrl: snapshot.view.links.usageUrl,
    })
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: () => {
      reading ??= read().catch((_readFailed: unknown) => {
        // A failed read keeps the previous facts; the next account frame retries.
      }).finally(() => { reading = undefined })
      return reading
    },
  }
}
