// @vitest-environment jsdom
/** Built-in feedback row opens the questionnaire and dismisses the menu. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { FeedbackMenuItem } from '../src/client/FeedbackMenuItem.tsx'
import { en, zh, type AccountKey } from '../src/client/locales.ts'

afterEach(cleanup)
it.each([en, zh])('opens the questionnaire and dismisses the menu', (copy) => {
  const contactUs = vi.fn()
  const onDismiss = vi.fn()
  render(<FeedbackMenuItem {...({} as GlobalStandardProps)} contactUs={contactUs} onDismiss={onDismiss} restoreFocus={vi.fn()}
    t={key => copy[key as AccountKey]} />)
  fireEvent.click(screen.getByRole('menuitem', { name: copy.contactUs }))
  expect(onDismiss).toHaveBeenCalledOnce()
  expect(contactUs).toHaveBeenCalledOnce()
})
