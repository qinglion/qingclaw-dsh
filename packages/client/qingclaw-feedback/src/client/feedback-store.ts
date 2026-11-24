/** Shared visibility of the feedback dialog between its menu row and the shell overlay. */
export interface FeedbackDialogSnapshot {
  /** Whether the dialog is showing. */
  open: boolean
}

/** Dialog visibility owned by the plugin's apply closure. */
export interface FeedbackStore {
  /** @returns the current visibility. */
  getSnapshot(): FeedbackDialogSnapshot
  /** @param listener - called after every visibility change. @returns listener cleanup. */
  subscribe(listener: () => void): () => void
  /** Show the dialog and remember the launcher focus its row supplies.
   * @param restoreFocus - returns focus to the account launcher after the dialog closes.
   */
  show(restoreFocus: () => void): void
  /** Hide the dialog and restore the launcher focus the last open supplied. */
  hide(): void
}

/** @returns a store whose visibility outlives the menu row that opens it. */
export function createFeedbackStore(): FeedbackStore {
  let snapshot: FeedbackDialogSnapshot = { open: false }
  let restoreFocus: (() => void) | undefined
  const listeners = new Set<() => void>()
  const publish = (value: FeedbackDialogSnapshot): void => {
    snapshot = value
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    show(restore) {
      restoreFocus = restore
      if (!snapshot.open) publish({ open: true })
    },
    hide() {
      if (!snapshot.open) return
      publish({ open: false })
      const focus = restoreFocus
      restoreFocus = undefined
      // The modal unmounts on the same commit; restoring focus afterwards keeps it on the launcher.
      if (focus !== undefined) setTimeout(focus, 0)
    },
  }
}
