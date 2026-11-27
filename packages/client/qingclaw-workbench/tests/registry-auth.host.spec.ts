import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { WorkbenchRegistryAccess } from '../src/registry-auth.ts'

const registry = 'https://npm.qingclaw.com/'

/** The platform's read grant for one signed-in account. */
const grant = (expiresIn = 600_000) => ({
  username: 'qc-7', password: 'qcn_' + 'b'.repeat(43), registry,
  expires_at: new Date(Date.now() + expiresIn).toISOString(),
})

function fixture(session: { origin: string; token: string } | null = { origin: 'https://qingclaw.com', token: 'platform-token' }) {
  const ctx = new Context()
  ctx.provide('deepseekAccount', { getPlatformSession: async () => session })
  const lifetime = new AbortController()
  return { ctx, lifetime, access: new WorkbenchRegistryAccess(ctx, lifetime.signal) }
}

const answered = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status,
  headers: { 'content-type': 'application/json' } })

it('exchanges the account grant for a registry token once and reuses it until it expires', async () => {
  const { access } = fixture()
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(answered(grant()))
    .mockResolvedValueOnce(answered({ token: 'registry-bearer' }))
  vi.stubGlobal('fetch', fetchMock)
  try {
    expect(await access.authorization(registry)).toMatchObject({ token: 'registry-bearer' })
    // A second read within the token's lifetime asks the platform nothing.
    expect(await access.authorization(registry)).toMatchObject({ token: 'registry-bearer' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(new URL('https://qingclaw.com/auth-api/v0/dsh/registry/read-grant'))
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', redirect: 'error',
      headers: expect.objectContaining({ 'X-DSH-Auth-Token': 'platform-token', accept: 'application/json' }) as unknown })
    const login = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(new URL('-/user/org.couchdb.user:qc-7', registry))
    expect(login.method).toBe('PUT')
    expect(JSON.parse(String(login.body))).toEqual({ name: 'qc-7', password: grant().password, type: 'user', roles: [] })
  } finally { vi.unstubAllGlobals() }
})

it('exchanges again when the token is about to expire, when the account session changes, and once for concurrent reads', async () => {
  let session = { origin: 'https://qingclaw.com', token: 'platform-token' }
  const ctx = new Context()
  ctx.provide('deepseekAccount', { getPlatformSession: async () => session })
  const access = new WorkbenchRegistryAccess(ctx, new AbortController().signal)
  const fetchMock = vi.fn<typeof fetch>(async url => String(url).includes('read-grant')
    ? answered(grant(30_000)) : answered({ token: 'registry-bearer' }))
  vi.stubGlobal('fetch', fetchMock)
  try {
    // Inside the refresh margin every read exchanges again.
    await access.authorization(registry)
    await access.authorization(registry)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // Concurrent reads share one exchange.
    fetchMock.mockClear()
    const [first, second] = await Promise.all([access.authorization(registry), access.authorization(registry)])
    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Another sign-in never reuses the previous account's read access.
    session = { origin: 'https://qingclaw.com', token: 'rotated-token' }
    await access.authorization(registry)
    expect(fetchMock.mock.calls.at(-2)?.[1]).toMatchObject({ headers: expect.objectContaining({ 'X-DSH-Auth-Token': 'rotated-token' }) as unknown })
  } finally { vi.unstubAllGlobals() }
})

it('refuses to read the registry without a signed-in account or an accepted grant', async () => {
  const signedOut = fixture(null)
  await expect(signedOut.access.authorization(registry)).rejects.toMatchObject({ code: 'qingclaw-workbench/sign-in-required' })
  // A Host without the account service has no account session either.
  const noAccount = new WorkbenchRegistryAccess(new Context(), new AbortController().signal)
  await expect(noAccount.authorization(registry)).rejects.toMatchObject({ code: 'qingclaw-workbench/sign-in-required' })
  const { access } = fixture()
  const fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
  try {
    fetchMock.mockResolvedValueOnce(answered({ error: 'unauthorized' }, 401))
    await expect(access.authorization(registry)).rejects.toMatchObject({ code: 'qingclaw-workbench/sign-in-required' })
    fetchMock.mockResolvedValueOnce(answered({ error: 'pro_required' }, 402))
    await expect(access.authorization(registry)).rejects.toMatchObject({ code: 'qingclaw-workbench/pro-required' })
    fetchMock.mockResolvedValueOnce(answered({ error: 'unavailable' }, 500))
    await expect(access.authorization(registry)).rejects.toThrow('无法获取青狮 npm 读取授权')
    for (const invalid of [
      { ...grant(), registry: 'https://registry.npmjs.org/' },
      { ...grant(), registry: 7 },
      { ...grant(), username: 'someone' },
      { ...grant(), username: null },
      { ...grant(), password: 'qcn_short' },
      { ...grant(), password: 7 },
      { ...grant(), expires_at: new Date(Date.now() - 1000).toISOString() },
      { ...grant(), expires_at: 'not-a-date' },
      { ...grant(), expires_at: 7 },
    ]) {
      fetchMock.mockResolvedValueOnce(answered(invalid))
      await expect(access.authorization(registry)).rejects.toThrow('读取授权无效或已到期')
    }
    fetchMock.mockResolvedValueOnce(answered(grant()))
    fetchMock.mockResolvedValueOnce(answered({ error: 'forbidden' }, 403))
    await expect(access.authorization(registry)).rejects.toThrow('暂未接受本次读取授权')
    fetchMock.mockResolvedValueOnce(answered(grant()))
    fetchMock.mockResolvedValueOnce(answered({ token: 'two words' }))
    await expect(access.authorization(registry)).rejects.toThrow('令牌无效')
    fetchMock.mockResolvedValueOnce(answered(grant()))
    fetchMock.mockResolvedValueOnce(answered({ token: '' }))
    await expect(access.authorization(registry)).rejects.toThrow('令牌无效')
  } finally { vi.unstubAllGlobals() }
})

it('abandons a read its owner ended', async () => {
  const { access, lifetime } = fixture()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => answered(grant())))
  try {
    lifetime.abort()
    await expect(access.authorization(registry)).rejects.toThrow()
  } finally { vi.unstubAllGlobals() }
})
