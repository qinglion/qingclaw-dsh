// @vitest-environment jsdom
/** The overlay projects the shared dialog and closes it through the store command. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { FeedbackDialogEntry, type FeedbackDialogEntryProps } from '../src/client/FeedbackDialogEntry.tsx'
import { en, zh, type FeedbackKey } from '../src/client/locales.ts'

afterEach(cleanup)
function mount(open: boolean, copy: Record<FeedbackKey, string> = zh) {
  const close = vi.fn()
  const props: FeedbackDialogEntryProps = {
    ...({} as GlobalStandardProps),
    useDialog: selector => selector({ open }),
    close,
    t: key => copy[key as FeedbackKey],
  }
  render(<FeedbackDialogEntry {...props} />)
  return close
}
it('renders nothing while the dialog is closed', () => {
  mount(false)
  expect(screen.queryByRole('dialog')).toBeNull()
})
it.each([en, zh])('shows the QR code under the localized title and hint', (copy) => {
  mount(true, copy)
  const dialog = screen.getByRole('dialog', { name: copy.entry })
  expect(dialog.textContent).toContain(copy.description)
  expect(screen.getByRole('img', { name: copy.qrAlt }).getAttribute('src')).toBeTruthy()
})
it.each(['close', 'escape'] as const)('closes through %s', (action) => {
  const close = mount(true)
  if (action === 'escape') fireEvent.keyDown(document, { key: 'Escape' })
  else fireEvent.click(screen.getByRole('button', { name: zh.close }))
  expect(close).toHaveBeenCalledOnce()
})
