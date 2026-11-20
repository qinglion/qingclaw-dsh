// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { CreatorCenter } from '../src/client/CreatorCenter.tsx'
import { getMyPackages, submitListing } from '../src/client/api.ts'
import { zh } from '../src/client/locales.ts'

vi.mock('../src/client/api.ts', () => ({
  getMyPackages: vi.fn(), submitListing: vi.fn(),
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function mount(openProject = vi.fn()) {
  const props = {
    userId: '9', t: (key: keyof typeof zh) => zh[key], openProject, resume: vi.fn(),
    useWorkspaces: () => [],
  }
  return render(<CreatorCenter {...props as ComponentProps<typeof CreatorCenter>} />)
}

it('offers listing only for an existing personal registry version and refreshes its state', async () => {
  const row = { name: '@qinglion/review', description: 'Review', latest_version: '1.0.0' }
  vi.mocked(getMyPackages).mockResolvedValueOnce([{ ...row, versions: [{ version: '1.0.0' }] }])
    .mockResolvedValue([{ ...row, versions: [{ version: '1.0.0', market_state: 'pending' }] }])
  vi.mocked(submitListing).mockResolvedValue({})
  mount()
  fireEvent.click(await screen.findByRole('button', { name: row.name }))
  fireEvent.click(screen.getByRole('button', { name: zh.request }))
  expect(await screen.findByText(zh.pending)).toBeTruthy()
  expect(submitListing).toHaveBeenCalledWith(row.name, '1.0.0', expect.any(AbortSignal))
  expect(screen.queryByRole('button', { name: zh.request })).toBeNull()
})

it('starts a named project in its own directory and goes directly between packages and local projects', async () => {
  vi.mocked(getMyPackages).mockResolvedValue([])
  const open = vi.fn().mockResolvedValue(undefined)
  mount(open)
  fireEvent.click(screen.getByRole('button', { name: zh.newWorkbench }))
  fireEvent.change(screen.getByRole('textbox', { name: zh.folder }), { target: { value: 'review-desk' } })
  fireEvent.click(screen.getByRole('button', { name: zh.chooseParent }))
  await waitFor(() => expect(open).toHaveBeenCalledWith('workbench', 'review-desk'))
  const nav = screen.getByRole('navigation')
  expect(Array.from(nav.querySelectorAll('button'), button => button.textContent)).toEqual([zh.packages, zh.local])
  fireEvent.click(screen.getByRole('button', { name: zh.local }))
  expect(await screen.findByText(zh.emptyLocal)).toBeTruthy()
})

it('allows relisting the highest delisted version and keeps superseded or lower npm versions read-only', async () => {
  const name = '@qinglion/blender'
  const highest = '3.1.0-alpha.10'
  vi.mocked(getMyPackages).mockResolvedValue([{ name, description: '', latest_version: '3.1.0-alpha.1',
    current_market_version: null, highest_market_version: highest, versions: [
      { version: '3.1.0-alpha.1', listing_blocked_by_version: true },
      { version: '3.1.0-alpha.2', market_state: 'superseded', listing_blocked_by_version: true },
      { version: highest, market_state: 'delisted', listing_blocked_by_version: false },
    ] }])
  mount()
  fireEvent.click(await screen.findByRole('button', { name }))
  expect(screen.getByText(zh.versionBlocked)).toBeTruthy()
  expect(screen.getByText(zh.superseded)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: zh.request })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: zh.request }))
  await waitFor(() => expect(submitListing).toHaveBeenCalledWith(name, highest, expect.any(AbortSignal)))
})
