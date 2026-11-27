import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { UpgradeRequired } from '../events.ts'

/** The one upgrade prompt the overlay entry reads. */
export interface UpgradeSource {
  /** Current prompt, or undefined while none shows. */
  readonly request: HostObservable<UpgradeRequired | undefined>
  /** @param request - the workbench a lapsed user tried to enable. */
  show(request: UpgradeRequired): void
  /** Clear the shown prompt. */
  dismiss(): void
}

/**
 * Create the prompt store the overlay entry reads.
 * @returns the observable request with its show and dismiss actions.
 */
export function createUpgradeSource(): UpgradeSource {
  const store = createSnapshotStore<UpgradeRequired | undefined>(undefined)
  return {
    request: store,
    show: (request) => { store.set(request) },
    dismiss: () => { store.set(undefined) },
  }
}
