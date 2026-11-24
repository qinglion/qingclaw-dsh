// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { getMyPackages } from '../src/client/api.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function respond(packages: unknown[], publications: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const action = new URL(url).searchParams.get('action')
    return new Response(JSON.stringify(action === 'packages' ? { packages } : { publications }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }))
}

it('titles a package by its listed application, then its newest one, then its package name', async () => {
  respond([
    { package_name: '@qinglion/desk', description: '', latest_version: '2.0.0', versions: [] },
    { package_name: '@qinglion/blender', description: '', latest_version: '3.1.0', versions: [] },
    { package_name: '@qinglion/plain', description: '', latest_version: '1.0.0', versions: [] },
  ], [
    { id: 1, package_name: '@qinglion/desk', version: '1.0.0', title: '自媒体工作台', state: 'published', current: true },
    { id: 5, package_name: '@qinglion/desk', version: '2.0.0', title: '自媒体工作台 2', state: 'pending' },
    { id: 2, package_name: '@qinglion/blender', version: '3.0.0', title: 'Blender 助手', state: 'delisted' },
    { id: 7, package_name: '@qinglion/blender', version: '3.1.0', title: 'Blender 助手新版', state: 'pending' },
    { id: 8, package_name: '@qinglion/plain', version: '1.0.0', title: '   ', state: 'pending' },
  ])
  const rows = await getMyPackages(new AbortController().signal)
  expect(rows.map(row => row.title)).toEqual(['自媒体工作台', 'Blender 助手新版', '@qinglion/plain'])
})
