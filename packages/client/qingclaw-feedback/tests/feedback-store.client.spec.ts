/** Dialog visibility survives the menu row and restores launcher focus on close. */
import { expect, it, vi } from 'vitest'
import { createFeedbackStore } from '../src/client/feedback-store.ts'

it('publishes visibility, restores focus after closing, and ignores a closed close', async () => {
  vi.useFakeTimers()
  try {
    const store = createFeedbackStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    const restore = vi.fn()
    expect(store.getSnapshot()).toEqual({ open: false })
    store.show(restore)
    expect(store.getSnapshot()).toEqual({ open: true })
    store.show(restore)
    expect(listener).toHaveBeenCalledOnce()
    store.hide()
    expect(store.getSnapshot()).toEqual({ open: false })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(restore).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(restore).toHaveBeenCalledOnce()
    store.hide()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    store.show(vi.fn())
    expect(listener).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
