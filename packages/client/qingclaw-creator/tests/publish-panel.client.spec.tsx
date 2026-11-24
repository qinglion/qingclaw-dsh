// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { PublishPanel, publishPrompt } from '../src/client/PublishPanel.tsx'
import { getWorkspacePublishCandidates } from '../src/client/project-api.ts'
import { zh } from '../src/client/locales.ts'
import type { PublishCandidate } from '../src/project-types.ts'

vi.mock('../src/client/project-api.ts', () => ({ getWorkspacePublishCandidates: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function view(workspaceId: string, title: string): WorkspaceView {
  return { workspaceId: workspaceId as WorkspaceView['workspaceId'], title, path: '/tmp/' + workspaceId,
    sessionIds: [], createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z' }
}

function workspaces(items: readonly WorkspaceView[] = []): ComponentProps<typeof PublishPanel>['useWorkspaces'] {
  const snapshot: WorkspaceSnapshot = {
    items, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
  return selector => selector(snapshot)
}

function mount(items: readonly WorkspaceView[] = [view('w1', 'Collection')]) {
  const props = {
    useWorkspaces: workspaces(items), publish: vi.fn(), startWorkspace: vi.fn(),
    t: (key: keyof typeof zh) => zh[key],
  }
  render(<PublishPanel {...props as ComponentProps<typeof PublishPanel>} />)
  return props
}

const candidate: PublishCandidate = {
  directory: 'dsh-codex',
  project: { name: '@qinglion/dsh-codex', title: 'Codex', version: '0.3.2', kind: 'plugin' },
}

it('offers the packages a collection workspace holds and asks the session to publish the chosen one', async () => {
  vi.mocked(getWorkspacePublishCandidates).mockResolvedValue([candidate])
  const props = mount()
  expect(await screen.findByText(candidate.project.name + ' · ' + candidate.directory)).toBeTruthy()
  expect(screen.getByText(candidate.project.version)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.publish }))
  expect(props.publish).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', title: 'Collection' }), candidate)
  const prompt = publishPrompt(candidate)
  for (const field of ['qingclaw-plugin-publish', candidate.project.name, candidate.project.version, candidate.directory]) {
    expect(prompt).toContain(field)
  }
})

it('opens the workspace from a candidate title', async () => {
  vi.mocked(getWorkspacePublishCandidates).mockResolvedValue([candidate])
  const props = mount()
  fireEvent.click(await screen.findByRole('button', { name: candidate.project.title }))
  expect(props.startWorkspace).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w1', title: 'Collection' }))
})

it('says so when no registered workspace holds a package', async () => {
  vi.mocked(getWorkspacePublishCandidates).mockResolvedValue([])
  mount()
  expect(await screen.findByText(zh.publishEmpty)).toBeTruthy()
})
