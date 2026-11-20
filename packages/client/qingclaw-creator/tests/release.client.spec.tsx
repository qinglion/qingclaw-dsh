// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { getProjectVersions } from '../src/client/project-api.ts'
import { getMyPackages } from '../src/client/api.ts'
import { ReleaseView } from '../src/client/ReleaseView.tsx'
import { en } from '../src/client/release-locales.ts'
import { releasePrompt } from '../src/client/release-tab.tsx'
import type { PluginProject } from '../src/project-types.ts'

vi.mock('../src/client/project-api.ts', () => ({ getProjectVersions: vi.fn() }))
vi.mock('../src/client/api.ts', () => ({ getMyPackages: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const first: PluginProject = { directory: 'packages/desk', name: '@qinglion/desk', title: 'Desk', version: '1.1.0', kind: 'workbench' }
const second: PluginProject = { ...first, name: '@qinglion/editor', directory: 'packages/editor' }
const t = ((key: keyof typeof en) => en[key]) as ComponentProps<typeof ReleaseView>['t']

it('requires selecting a package, shows its private npm history, and returns to the conversation after the publish action', async () => {
  vi.mocked(getProjectVersions).mockResolvedValue([{ version: '1.0.0', published_at: '2026-11-20T01:00:00Z' }, { version: '0.9.0' }])
  vi.mocked(getMyPackages).mockResolvedValue([{ name: first.name, description: '', latest_version: '1.0.0', versions: [{ version: '1.0.0', market_state: 'published' }, { version: '0.9.0', market_state: 'superseded' }] }])
  const publish = vi.fn(async () => {}), openView = vi.fn()
  render(<ReleaseView workspaceId="w" projects={[first, second]} t={t} publish={publish} openView={openView} />)
  const button = screen.getByRole('button', { name: en.publish }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText(en.select), { target: { value: first.directory } })
  await screen.findByText(en.published)
  expect(screen.getByText('1.0.0')).toBeTruthy()
  expect(screen.getByText(en.superseded)).toBeTruthy()
  fireEvent.click(button)
  await waitFor(() => expect(openView).toHaveBeenCalledWith('chat', 'qingclaw-release'))
  expect(publish).toHaveBeenCalledOnce()
  expect(publish).toHaveBeenCalledWith(first)
  const prompt = releasePrompt(first)
  for (const field of ['qingclaw-plugin-publish', first.name, first.version, first.directory]) expect(prompt).toContain(field)
})

it('shows a readable previously published package even when it belongs to no creator; missing market status stays absent', async () => {
  vi.mocked(getMyPackages).mockResolvedValue([])
  vi.mocked(getProjectVersions).mockResolvedValue([{ version: '2.7.2', published_at: '2026-11-19T12:34:00Z' }])
  const { container } = render(<ReleaseView workspaceId="w" projects={[first]} publish={vi.fn()} openView={vi.fn()} t={t} />)
  await screen.findByText('2.7.2')
  expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-19T12:34:00Z')
  expect(screen.queryByText(en.noHistory)).toBeNull()
  expect(screen.queryByText(en.unlisted)).toBeNull()
})

it('keeps the release page available for retry when the QingClaw account loses creator access', async () => {
  vi.mocked(getMyPackages).mockResolvedValue([])
  vi.mocked(getProjectVersions).mockResolvedValue([])
  const publish = vi.fn().mockRejectedValueOnce(new Error('creator_required')).mockResolvedValueOnce(undefined)
  const openView = vi.fn()
  render(<ReleaseView workspaceId="w" projects={[first]} publish={publish} openView={openView} t={t} />)
  const button = screen.getByRole('button', { name: en.publish })
  fireEvent.click(button)
  expect((await screen.findByRole('alert')).textContent).toBe(en.creator_required)
  expect(openView).not.toHaveBeenCalled()
  fireEvent.click(button)
  await waitFor(() => expect(openView).toHaveBeenCalledWith('chat', 'qingclaw-release'))
})
