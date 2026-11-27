import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseWorkbenchCatalog, WorkbenchDirectory } from '../src/catalog.ts'

const url = new URL('https://beta.qingclaw.com/workbenches/index.json')
const entry = { packageName: '@qinglion/dsh-media-desk', version: '2.7.2', panelId: 'media-desk',
  title: '自媒体工作台', description: '创作', category: '工具', author: 'QingClaw', registry: 'https://npm.qingclaw.com/' }
const parse = (row: object) => parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [row] }, url)

it('accepts scoped, pinned workbench packages and resolves only same-origin previews', () => {
  expect(parse({ ...entry, previewUrl: '/workbenches/desk.webp' })[0]?.previewUrl).toBe('https://beta.qingclaw.com/workbenches/desk.webp')
  expect(parse({ ...entry, previewUrl: 'https://example.com/file.webp' })[0]?.previewUrl).toBeUndefined()
  for (const extra of [{ version: 'latest' }, { packageName: 'dsh-media-desk' },
    { registry: 'https://registry.npmjs.org/' }, { panelId: 'plugins' }]) {
    expect(() => parse({ ...entry, ...extra })).toThrow()
  }
  expect(() => parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [entry, entry] }, url)).toThrow()
})

it('resolves the manifest logo and every declared preview from the catalog origin', () => {
  const row = parse({ ...entry, iconUrl: '/workbenches/desk-logo.webp',
    previews: ['/workbenches/one.webp', 'https://example.com/off-origin.webp', 7] })[0]
  expect(row?.iconUrl).toBe('https://beta.qingclaw.com/workbenches/desk-logo.webp')
  expect(row?.previews).toEqual(['https://beta.qingclaw.com/workbenches/one.webp'])
  expect(parse({ ...entry, iconUrl: 'https://example.com/logo.webp', previews: 'one.webp' })[0])
    .not.toHaveProperty('iconUrl')
  expect(parse({ ...entry, previews: [7] })[0]).not.toHaveProperty('previews')
})

it('keeps scalable artwork the catalog serves, so an icon may be an SVG', () => {
  const row = parse({ ...entry, iconUrl: '/workbenches/desk-logo.svg',
    previewUrl: '/workbenches/desk.svg', previews: ['/workbenches/one.svg', '/workbenches/two.webp'] })[0]
  expect(row?.iconUrl).toBe('https://beta.qingclaw.com/workbenches/desk-logo.svg')
  expect(row?.previewUrl).toBe('https://beta.qingclaw.com/workbenches/desk.svg')
  expect(row?.previews).toEqual([
    'https://beta.qingclaw.com/workbenches/one.svg',
    'https://beta.qingclaw.com/workbenches/two.webp',
  ])
})

it('keeps the related-resource cards the catalog resolved', () => {
  const row = parse({ ...entry, links: [
    { url: 'https://weixin.qq.com/sph/AHfxwU7MP7', title: '视频号', image: 'https://cdn.example.com/cover.webp' },
    { url: 'http://insecure.example.com', title: 'insecure' },
    { url: 'https://ok.example.com', title: '  ' },
  ] })[0]
  expect(row?.links).toEqual([
    { url: 'https://weixin.qq.com/sph/AHfxwU7MP7', title: '视频号', image: 'https://cdn.example.com/cover.webp' },
  ])
})

it('accepts only the registry this deployment configures, with or without its trailing slash', () => {
  const local = { ...entry, registry: 'http://127.0.0.1:4873/' }
  expect(parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [local] }, url, 'http://127.0.0.1:4873/')[0]?.registry)
    .toBe('http://127.0.0.1:4873/')
  expect(parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [local] }, url, 'http://127.0.0.1:4873')[0]?.packageName)
    .toBe('@qinglion/dsh-media-desk')
  expect(() => parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [local] }, url)).toThrow()
  expect(() => parseWorkbenchCatalog({ schemaVersion: 1, workbenches: [entry] }, url, 'http://127.0.0.1:4873/')).toThrow()
})

it('reopens verified catalog entries after an offline restart, rejects another source or a corrupted cache', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qingclaw-directory-'))
  const options = { cacheFile: join(dir, 'feed.json'), cacheTtlMs: 0, maxResponseBytes: 64_000, fetchTimeoutMs: 2000 }
  const create = (source = url) => new WorkbenchDirectory(source, options, new AbortController().signal)
  const fetch = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, workbenches: [entry] })))
  vi.stubGlobal('fetch', fetch)
  try {
    expect(await create().get(false)).toEqual({ entries: [entry], stale: false })
    const file = join(dir, 'workbench-catalog-v1.json')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    fetch.mockRejectedValue(new Error('offline'))
    expect(await create().get(false)).toEqual({ entries: [entry], stale: true })
    await expect(create(new URL('https://qingclaw.com/workbenches/index.json')).get(false)).rejects.toThrow('offline')
    const data = JSON.parse(await readFile(file, 'utf8'))
    data.workbenches[0].registry = 'https://registry.npmjs.org/'
    await writeFile(file, JSON.stringify(data))
    await expect(create().get(false)).rejects.toThrow('offline')
  } finally {
    vi.unstubAllGlobals()
    await rm(dir, { recursive: true, force: true })
  }
})
