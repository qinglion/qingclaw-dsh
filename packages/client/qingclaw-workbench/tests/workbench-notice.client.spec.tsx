// @vitest-environment jsdom
/** Workbench operation failures, rendered outside the market panel. */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { WorkbenchNoticeToast, type WorkbenchNoticeProps } from '../src/client/WorkbenchNoticeToast.tsx'
import { NS, zh } from '../src/client/locales.ts'
import type { WorkbenchNotice } from '../src/client/workbench-plugin-store.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const t: TranslateNS<typeof NS> = (key, values) => {
  const message = (zh as Record<string, string>)[key] ?? key
  return message.replace(/\{(\w+)\}/g, (token, name: string) => values?.[name]?.toString() ?? token)
}

function mount(notice: WorkbenchNotice | undefined) {
  const dismissNotice = vi.fn()
  render(<WorkbenchNoticeToast {...({
    useNotice: (select: (value: WorkbenchNotice | undefined) => unknown) => select(notice),
    dismissNotice,
    t,
  } as unknown as WorkbenchNoticeProps)} />)
  return { dismissNotice }
}

it('shows nothing while the market reports no failure', () => {
  mount(undefined)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('shows the localized failure and dismisses it after the reader had time to read it', () => {
  vi.useFakeTimers()
  const { dismissNotice } = mount({ key: 'installError', seq: 1 })
  expect(screen.getByRole('alert').textContent).toBe(zh.installError)
  act(() => { vi.runAllTimers() })
  expect(dismissNotice).toHaveBeenCalledOnce()
})
