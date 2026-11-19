// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AdminSection } from '../src/client/AdminSection.tsx'
import { en } from '../src/client/locales.ts'
import type { ComponentProps } from 'react'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const t = ((key: keyof typeof en) => en[key]) as ComponentProps<typeof AdminSection>['t']
const publication = { id: 1, title: 'Blender', package_name: '@qingclaw/blender', version: '1.0.0', state: 'pending', resource_type: 'plugin' }
const user = { id: 7, name: 'Creator', email: 'creator@example.test', role: 'user' }

function transport() {
  const fetch = vi.fn(async (url: URL, _init: RequestInit) => {
    const action = url.searchParams.get('action')
    const body = action === 'users' ? { users: [user] } : action === 'publications' ? { publications: [publication] } : {}
    return Response.json(body)
  })
  vi.stubGlobal('__DSH_TRANSPORT__', { fetch })
  return fetch
}

it('sends the packed artifact from Creator center and lists its submissions', async () => {
  const fetch = transport()
  render(<AdminSection role="creator" userId="7" t={t}/>)
  await screen.findByText('Blender')
  expect(screen.queryByText('User roles')).toBeNull()
  expect(screen.queryByText('Publish')).toBeNull()
  const file = new File([new Uint8Array([31, 139, 8])], 'plugin.tgz')
  fireEvent.change(screen.getByLabelText('npm package (.tgz)'), { target: { files: [file] } })
  fireEvent.change(screen.getByLabelText('Marketplace display name (optional)'), { target: { value: 'Blender' } })
  fireEvent.submit(screen.getByText('Submit for review').closest('form')!)
  await screen.findByText('Submitted for review')
  const call = fetch.mock.calls.find(([url]) => url.searchParams.get('action') === 'submit')
  expect(call?.[0].searchParams.get('title')).toBe('Blender')
  expect(call?.[1]).toMatchObject({ method: 'POST', body: file })
})

it('allows admins to publish, return, and grant creator roles through the Host', async () => {
  const fetch = transport()
  render(<AdminSection role="admin" userId="1" t={t}/>)
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
  await screen.findByText('Publication queued')
  fireEvent.change(await screen.findByLabelText('Reason for returning'), { target: { value: 'Missing README' } })
  fireEvent.submit(screen.getByText('Return').closest('form')!)
  await screen.findByRole('status', { name: '' })
  await waitFor(() => { expect(fetch.mock.calls.some(([url]) => url.searchParams.get('reason') === 'Missing README')).toBe(true) })
  fireEvent.click(screen.getByRole('button', { name: 'User roles' }))
  fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'creator' } })
  fireEvent.submit(screen.getByText('Save role').closest('form')!)
  await screen.findByText('Role saved')
  expect(fetch.mock.calls.find(([url]) => url.searchParams.get('action') === 'role')?.[0].searchParams.get('role')).toBe('creator')
})
