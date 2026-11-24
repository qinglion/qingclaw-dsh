// @vitest-environment jsdom
/** The QingClaw feedback row hands the dialog to the shell overlay. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { FeedbackEntry, type FeedbackEntryProps } from '../src/client/FeedbackEntry.tsx'
import { en, zh, type FeedbackKey } from '../src/client/locales.ts'

afterEach(cleanup)
function mount(copy: Record<FeedbackKey, string> = zh) {
  const onDismiss = vi.fn()
  const restoreFocus = vi.fn()
  const showDialog = vi.fn()
  const props: FeedbackEntryProps = {
    ...({} as GlobalStandardProps), onDismiss, restoreFocus, showDialog, t: key => copy[key as FeedbackKey],
  }
  render(<FeedbackEntry {...props} />)
  return { onDismiss, restoreFocus, showDialog }
}
it.each([en, zh])('opens the dialog and dismisses the menu', (copy) => {
  const props = mount(copy)
  fireEvent.click(screen.getByRole('menuitem', { name: copy.entry }))
  expect(props.showDialog).toHaveBeenCalledExactlyOnceWith(props.restoreFocus)
  expect(props.onDismiss).toHaveBeenCalledOnce()
})
