// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { CreatorCenter } from '../src/client/CreatorCenter.tsx'
import { getMyPackages, submitListing } from '../src/client/api.ts'
import { getWorkspacePluginState } from '../src/client/project-api.ts'
import { zh } from '../src/client/locales.ts'
import type { PluginProject } from '../src/project-types.ts'

vi.mock('../src/client/api.ts', () => ({
  getMyPackages: vi.fn(), submitListing: vi.fn(),
}))
vi.mock('../src/client/project-api.ts', () => ({
  getWorkspacePluginState: vi.fn(),
}))
afterEach(() => { cleanup(); vi.resetAllMocks() })

/** A registered workspace row as the sidebar list reports it. */
function view(workspaceId: string, title: string): WorkspaceView {
  return { workspaceId: workspaceId as WorkspaceView['workspaceId'], title, path: '/tmp/' + workspaceId,
    sessionIds: [], createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z' }
}

/** The workspaces hook the center receives from the sidebar list. */
function workspaces(items: readonly WorkspaceView[] = []): ComponentProps<typeof CreatorCenter>['useWorkspaces'] {
  const snapshot: WorkspaceSnapshot = {
    items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
  return selector => selector(snapshot)
}

function mount(useWorkspaces = workspaces()) {
  const props = {
    userId: '9', t: (key: keyof typeof zh) => zh[key], resume: vi.fn(), useWorkspaces,
  }
  return render(<CreatorCenter {...props as ComponentProps<typeof CreatorCenter>} />)
}

it('offers listing only for an existing personal registry version and refreshes its state', async () => {
  const row = { name: '@qinglion/review', title: 'Review', description: 'Review', latest_version: '1.0.0' }
  vi.mocked(getMyPackages).mockResolvedValueOnce([{ ...row, versions: [{ version: '1.0.0' }] }])
    .mockResolvedValue([{ ...row, versions: [{ version: '1.0.0', market_state: 'pending' }] }])
  vi.mocked(submitListing).mockResolvedValue({})
  mount()
  fireEvent.click(await screen.findByRole('button', { name: row.title }))
  fireEvent.click(screen.getByRole('button', { name: zh.request }))
  expect(await screen.findByText(zh.pending)).toBeTruthy()
  expect(submitListing).toHaveBeenCalledWith(row.name, '1.0.0', expect.any(AbortSignal))
  expect(screen.queryByRole('button', { name: zh.request })).toBeNull()
})

it('shows the listing rejection that names the manifest fields still missing', async () => {
  const name = '@qinglion/dsh-media-desk'
  const title = '自媒体工作台'
  const message = '该版本缺少上架必填信息：侧边 logo、工作台预览图（至少 2 张）。请在 package.json 的 qingclaw 中补充后重新发版。'
  vi.mocked(getMyPackages).mockResolvedValue([{ name, title, description: '', latest_version: '2.7.3',
    versions: [{ version: '2.7.3' }] }])
  vi.mocked(submitListing).mockRejectedValue(new Error(message))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: title }))
  fireEvent.click(screen.getByRole('button', { name: zh.request }))
  expect(await screen.findByText(message)).toBeTruthy()
})

it('lists a package by its market title and keeps its package name visible', async () => {
  const row = { name: '@qinglion/dsh-blender-plugin', title: 'Blender 助手', description: '', latest_version: '3.1.0-alpha.3', versions: [] }
  vi.mocked(getMyPackages).mockResolvedValue([row])
  mount()
  fireEvent.click(await screen.findByRole('button', { name: row.title }))
  expect(screen.getByRole('heading', { name: row.title })).toBeTruthy()
  expect(screen.getByText(row.name)).toBeTruthy()
})

it('shows only the title, the tabs, and refresh above the package list', async () => {
  vi.mocked(getMyPackages).mockResolvedValue([])
  mount()
  const header = screen.getByRole('banner')
  expect(header.querySelectorAll('button')).toHaveLength(0)
  expect(header.textContent).toBe(zh.center)
  const nav = screen.getByRole('navigation')
  expect(Array.from(nav.querySelectorAll('button'), button => button.textContent)).toEqual([zh.packages, zh.local])
  fireEvent.click(screen.getByRole('button', { name: zh.local }))
  expect(await screen.findByText(zh.noWorkspaces)).toBeTruthy()
})

it('discovers the root plugin of each workspace and opens its session', async () => {
  const project: PluginProject = { name: '@qinglion/desk', title: 'Desk', version: '1.0.0', kind: 'workbench' }
  const resume = vi.fn()
  vi.mocked(getMyPackages).mockResolvedValue([])
  vi.mocked(getWorkspacePluginState).mockResolvedValue({ project })
  const props = {
    userId: '9', t: (key: keyof typeof zh) => zh[key], resume, useWorkspaces: workspaces([view('w1', 'Project')]),
  }
  render(<CreatorCenter {...props as ComponentProps<typeof CreatorCenter>} />)
  fireEvent.click(screen.getByRole('button', { name: zh.local }))
  expect(await screen.findByText(project.name + ' · Project')).toBeTruthy()
  expect(screen.getByText(project.version)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: project.title }))
  expect(resume).toHaveBeenCalledWith('w1')
})

it('keeps a collection workspace visible when its root manifest declares no plugin', async () => {
  vi.mocked(getMyPackages).mockResolvedValue([])
  vi.mocked(getWorkspacePluginState).mockResolvedValue({})
  mount(workspaces([view('w1', 'Collection')]))
  fireEvent.click(screen.getByRole('button', { name: zh.local }))
  expect(await screen.findByText(zh.unrecognizedRoot)).toBeTruthy()
})

it('allows relisting the highest delisted version and keeps superseded or lower npm versions read-only', async () => {
  const name = '@qinglion/blender'
  const title = 'Blender'
  const highest = '3.1.0-alpha.10'
  vi.mocked(getMyPackages).mockResolvedValue([{ name, title, description: '', latest_version: '3.1.0-alpha.1',
    current_market_version: null, highest_market_version: highest, versions: [
      { version: '3.1.0-alpha.1', listing_blocked_by_version: true },
      { version: '3.1.0-alpha.2', market_state: 'superseded', listing_blocked_by_version: true },
      { version: highest, market_state: 'delisted', listing_blocked_by_version: false },
    ] }])
  mount()
  fireEvent.click(await screen.findByRole('button', { name: title }))
  expect(screen.getByText(zh.versionBlocked)).toBeTruthy()
  expect(screen.getByText(zh.superseded)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: zh.request })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: zh.request }))
  await waitFor(() => { expect(submitListing).toHaveBeenCalledWith(name, highest, expect.any(AbortSignal)) })
})
