// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminSection } from '../src/client/AdminSection.tsx'
import { en } from '../src/client/locales.ts'
import type { ComponentProps } from 'react'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const t = ((key: keyof typeof en) => en[key]) as ComponentProps<typeof AdminSection>['t']
const publication = { id: 1, title: 'Blender', package_name: '@qinglion/blender', version: '1.0.0', state: 'pending', resource_type: 'plugin' }
const user = { id: 7, name: 'Creator', email: 'creator@example.test', role: 'user' }

const registry = { packages: [
  { package_name: '@qinglion/tools', owner_id: 7, description: 'Editor tools', latest_version: '1.2.0',
    versions: [{ version: '1.2.0', published_at: null }] },
] }
function transport() {
  const fetch = vi.fn(async (url: URL, _init: RequestInit) => {
    const action = url.searchParams.get('action')
    const listed = { ...publication, id: 2, title: 'Media Desk', state: 'published', package_name: '@qinglion/media-desk' }
    const body = action === 'packages' ? registry : action === 'users' ? { users: [user] } : action === 'publications' ? { publications: [publication, listed] } : {}
    return Response.json(body)
  })
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  return fetch
}

it('allows admins to publish, return, and grant creator roles through the Host', async () => {
  const fetch = transport()
  render(<AdminSection role="admin" userId="1" t={t}/>)
  await screen.findByText('Blender')
  expect(await screen.findByText('Media Desk')).toBeTruthy()
  expect(await screen.findByText(en.unsubmitted)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Request listing' })).toBeNull()
  expect(screen.queryByLabelText('Private package name')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Listed 1' }))
  await screen.findByText('Media Desk')
  expect(screen.queryByText('Blender')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Approve and list' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Needs review 1' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Approve and list' }))
  await screen.findByText(en.queued)
  fireEvent.click(await screen.findByRole('button', { name: 'Return' }))
  expect(screen.getByRole('button', { name: 'Confirm return' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(await screen.findByLabelText('Reason for returning'), { target: { value: 'Missing README' } })
  fireEvent.submit(screen.getByText('Confirm return').closest('form')!)
  await screen.findByRole('status', { name: '' })
  await waitFor(() => { expect(fetch.mock.calls.some(([url]) => url.searchParams.get('reason') === 'Missing README')).toBe(true) })
  fireEvent.click(screen.getByRole('tab', { name: 'User roles' }))
  fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'creator' } })
  fireEvent.submit(screen.getByText('Save role').closest('form')!)
  await screen.findByText('Role saved')
  expect(fetch.mock.calls.find(([url]) => url.searchParams.get('action') === 'role')?.[0].searchParams.get('role')).toBe('creator')
})

it('shows review failures and keeps the submission retryable', async () => {
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch: async (url: URL) =>
    url.searchParams.get('action') === 'packages' ? Response.json(registry) : url.searchParams.get('action') === 'list'
      ? Response.json({ error: 'publication_queue_unavailable' }, { status: 503 })
      : Response.json({ publications: [{ ...publication, state: 'failed', error: 'Registry unavailable' }] }) })
  render(<AdminSection role="admin" userId="1" t={t}/>)
  await screen.findByText('Registry unavailable')
  fireEvent.click(await screen.findByRole('button', { name: 'Retry listing' }))
  expect((await screen.findByRole('alert')).textContent).toBe(en.unavailable)
  expect(screen.queryByText(en.queued)).toBeNull()
  expect(screen.getByRole('button', { name: 'Retry listing' }).hasAttribute('disabled')).toBe(false)
})

it('moves the version out of review and into Listed once the website publishes it', async () => {
  let state = 'pending'
  const fetch = vi.fn(async (url: URL) => {
    if (url.searchParams.get('action') === 'packages') return Response.json(registry)
    if (url.searchParams.get('action') === 'list') {
      state = 'publishing'
      return Response.json({ ...publication, state }, { status: 202 })
    }
    return Response.json({ publications: [{ ...publication, state }] })
  })
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  render(<AdminSection role="admin" userId="1" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: 'Approve and list' }))
  await screen.findByRole('button', { name: 'Needs review 0' })
  await screen.findByText(en.publishing)
  state = 'published'
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Listed 1' }))
  expect(screen.getByText('Blender')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Approve and list' })).toBeNull()
})

it('shows the unavailable listing action on older websites without invoking their publish endpoint', async () => {
  const fetch = vi.fn(async (url: URL) => url.searchParams.get('action') === 'packages' ? Response.json(registry) : url.searchParams.get('action') === 'list'
    ? Response.json({ error: 'unexpected_website_response' }, { status: 404 })
    : Response.json({ publications: [publication] }))
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  render(<AdminSection role="admin" userId="7" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: en.publish }))
  expect((await screen.findByRole('alert')).textContent).toBe(en.listingUnavailable)
  expect(fetch.mock.calls.map(([url]) => url.searchParams.get('action'))).toEqual(['publications', 'packages', 'list'])
})

it('requires confirmation to delist an existing version without changing the registry', async () => {
  const fetch = transport()
  render(<AdminSection role="admin" userId="1" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: en.delist }))
  expect(fetch.mock.calls.some(([url]) => url.searchParams.get('action') === 'delist')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: en.confirmDelist }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', en.delisted)
  expect(fetch.mock.calls.find(([url]) => url.searchParams.get('action') === 'delist')?.[0].searchParams.get('id')).toBe('2')
})

it('lets the admin assign a legacy package to a creator', async () => {
  const fetch = vi.fn(async (url: URL) => {
    const action = url.searchParams.get('action')
    if (action === 'packages') return Response.json({ packages: [{ ...registry.packages[0], owner_id: null }] })
    if (action === 'users') return Response.json({ users: [{ ...user, role: 'creator' }] })
    return Response.json({ publications: [] })
  })
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  render(<AdminSection role="admin" userId="1" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: en.assignOwner }))
  await screen.findByRole('option', { name: 'Creator creator@example.test' })
  fireEvent.change(screen.getByLabelText(en.owner), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: en.assignOwner }))
  await screen.findByText(en.ownerSaved)
  expect(fetch.mock.calls.find(([url]) => url.searchParams.get('action') === 'owner')?.[0].searchParams.get('package_name')).toBe('@qinglion/tools')
})

it('shows one current listing and prevents approving an older version even when npm latest points to it', async () => {
  const current = '3.1.0-alpha.2'
  const older = '3.1.0-alpha.1'
  const pkg = { package_name: publication.package_name, current_market_version: current, highest_market_version: current,
    latest_version: older, owner_id: 7, versions: [{ version: current }, { version: older, listing_blocked_by_version: true }] }
  const rows = [
    { ...publication, version: current, state: 'published', current: true },
    { ...publication, version: older, state: 'pending' },
    { ...publication, version: '3.0.0', state: 'superseded' },
  ]
  const fetch = vi.fn(async (url: URL) => Response.json(url.searchParams.get('action') === 'packages'
    ? { packages: [pkg] } : { publications: rows }))
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  render(<AdminSection role="admin" userId="7" t={t}/>)
  await screen.findByText(en.versionBlocked)
  expect(screen.getAllByRole('button', { name: en.delist })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: en.publish })).toBeNull()
  expect(screen.getByText(en.superseded)).toBeTruthy()
})

it('refreshes a stale review after the server refuses a listing on version precedence', async () => {
  let blocked = false
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch: async (url: URL) => {
    switch (url.searchParams.get('action')) {
      case 'list':
        blocked = true
        return Response.json({ error: 'version_not_newer', message: 'A higher version is listed.' }, { status: 409 })
      case 'packages': return Response.json({ packages: [] })
      default: return Response.json({ publications: [{ ...publication, listing_blocked_by_version: blocked }] })
    }
  } })
  render(<AdminSection role="admin" userId="7" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: en.publish }))
  expect(await screen.findByText(en.versionBlocked)).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('A higher version is listed.')
  expect(screen.queryByRole('button', { name: en.publish })).toBeNull()
})
