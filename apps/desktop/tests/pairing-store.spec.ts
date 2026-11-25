import { readFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { PairingStore, type PairingStoreOptions } from '../src/mobile/pairing-store.ts'
import type { RemoteRoom } from '../src/mobile/mobile-relay.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const cipher: Pick<PairingStoreOptions, 'seal' | 'unseal'> = {
  seal: plaintext => 'sealed:' + Buffer.from(plaintext, 'utf8').toString('base64'),
  unseal: value => value.startsWith('sealed:')
    ? Buffer.from(value.slice('sealed:'.length), 'base64').toString('utf8')
    : undefined,
}
const room: RemoteRoom = {
  id: 'room-1',
  desktopToken: 'd'.repeat(32),
  pairingSecret: 's'.repeat(32),
  pairingExpiresAt: Date.now() + 300_000,
  expiresAt: Date.now() + 86_400_000,
}

async function fixture(options: Partial<PairingStoreOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'qingclaw-pairing-'))
  directories.push(directory)
  const path = join(directory, 'desktop', 'mobile-pairing.json')
  return {
    path,
    store: new PairingStore({ path, origin: 'https://beta.qingclaw.com', accountId: 'user-1', ...cipher, ...options }),
  }
}

it('stores the room owner-only and reads it back for the same account', async () => {
  const { path, store } = await fixture()
  await expect(store.load()).resolves.toBeUndefined()
  await store.save(room)
  await expect(store.load()).resolves.toEqual(room)
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  const document = await readFile(path, 'utf8')
  expect(document).not.toContain(room.desktopToken)
})

it('ignores a record written for another account or issuer', async () => {
  const { store } = await fixture()
  await store.save(room)
  const other = await fixture({ accountId: 'user-2' })
  await expect(other.store.load()).resolves.toBeUndefined()
  const foreign = await fixture({ origin: 'https://qingclaw.com' })
  await expect(foreign.store.load()).resolves.toBeUndefined()
})

it('ignores records this process cannot unseal or validate', async () => {
  const { path, store } = await fixture()
  await store.save(room)
  const sealed = await readFile(path, 'utf8')
  await writeFile(path, sealed.replace(/^sealed:/, 'foreign:'))
  await expect(store.load()).resolves.toBeUndefined()

  await writeFile(path, cipher.seal('not json'))
  await expect(store.load()).resolves.toBeUndefined()

  await writeFile(path, cipher.seal(JSON.stringify({ version: 2, origin: 'https://beta.qingclaw.com', accountId: 'user-1', room })))
  await expect(store.load()).resolves.toBeUndefined()
})

it('removes the record on clear', async () => {
  const { path, store } = await fixture()
  await store.save(room)
  await store.clear()
  await expect(store.load()).resolves.toBeUndefined()
  await expect(stat(path)).rejects.toThrow()
})
