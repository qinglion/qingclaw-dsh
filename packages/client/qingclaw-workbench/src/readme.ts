import { Buffer } from 'node:buffer'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { Parser } from 'tar'
import { readBoundedBody } from './feed.ts'
import type { WorkbenchCatalogEntry } from './types.ts'

const DOCUMENT_LIMIT = 512 * 1024
const UNPACKED_LIMIT = 128 * 1024 * 1024
// A version's README is inside its npm tarball, which may be up to 25 MiB.
const ARCHIVE_DOWNLOAD_TIMEOUT_MS = 120_000
const unpackGzip = promisify(gunzip)

/** Read the locale files and Markdown documents from the reviewed npm archive.
 * Nothing in the archive is executed or written to the filesystem. */
async function documentationFiles(tarball: Uint8Array, entry: WorkbenchCatalogEntry): Promise<Map<string, Buffer | null>> {
  const tar = await unpackGzip(tarball, { maxOutputLength: UNPACKED_LIMIT })
  // A published npm tar starts in package/. Do not let the tar parser decompress a nested archive.
  if (tar.subarray(0, 8).toString() !== 'package/') throw new Error('Invalid workbench archive')
  const files = new Map<string, Buffer | null>()
  await new Promise<void>((resolve, reject) => {
    const parser = new Parser({ strict: true, maxMetaEntrySize: 64 * 1024,
      filter: (path, item) => 'type' in item && item.type === 'File' && path.startsWith('package/')
        && /(?:\.md|\.markdown|\/readme|\/package\.json|\/locale\/[\w-]+\.json)$/iu.test(path),
      onReadEntry(file) {
        const path = file.path.slice(8)
        if (files.has(path) || files.size >= 20_000) { parser.abort(new Error('Invalid workbench document entries')); return }
        files.set(path, null)
        if (file.size > DOCUMENT_LIMIT) { file.resume(); return }
        const chunks: Buffer[] = []
        file.on('data', (chunk: Buffer) => chunks.push(chunk))
        file.on('end', () => { files.set(path, Buffer.concat(chunks)) })
      },
    })
    parser.once('error', reject)
    parser.once('end', resolve)
    parser.end(tar)
  })
  const manifest = JSON.parse(files.get('package.json')?.toString('utf8') ?? 'null') as { name?: unknown; version?: unknown } | null
  if (manifest?.name !== entry.packageName || manifest.version !== entry.version) throw new Error('Workbench archive identity mismatch')
  return files
}

function selectDocument(files: ReadonlyMap<string, Buffer | null>, language: string): string | null {
  const read = (name: string) => {
    const file = files.get(name)
    if (file === null) throw new Error('Workbench document too large')
    return file?.toString('utf8')
  }
  const parts = language.toLowerCase().split('-')
  const locales = new Set([...parts.map((_part, index) => parts.slice(0, parts.length - index).join('-')), 'en'])
  let markdown: string | undefined
  for (const locale of locales) {
    const config = read('locale/' + locale + '.json')
    if (config === undefined) continue
    const detail: unknown = JSON.parse(config).meta?.detail
    if (detail === undefined) continue
    if (typeof detail !== 'string' || !/\.(?:md|markdown)$/iu.test(detail) ||
      detail.includes('\\') || detail.split('/').some(part => ['', '.', '..'].includes(part))) throw new Error('Invalid workbench document path')
    markdown = read(detail)
    if (markdown === undefined) throw new Error('Missing declared workbench document')
    break
  }
  if (markdown === undefined) {
    const names = [...files.keys()].filter(name => /^readme(?:\.md|\.markdown)?$/iu.test(name)).sort()
    const preferred = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README']
    const path = preferred.find(name => files.has(name)) ?? names[0]
    if (!path) return null
    markdown = read(path)
  }
  return markdown?.replace(/^\uFEFF/u, '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/u, '') ?? null
}

/**
 * Read the exact reviewed version from the catalog's validated private registry.
 * @param entry - the catalog entry whose archive is read.
 * @param language - the requested locale, or a more specific one it falls back from.
 * @param lifetime - ends the download with its owner.
 * @param token - the account's bearer token for that registry.
 * @returns the localized document, or the package README when the archive declares neither.
 */
export async function readRegistryReadme(
  entry: WorkbenchCatalogEntry, language: string, lifetime: AbortSignal, token: string,
): Promise<string | null> {
  if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu.test(language) || language.length > 64) throw new Error('Invalid workbench locale')
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(ARCHIVE_DOWNLOAD_TIMEOUT_MS)])
  const leaf = entry.packageName.split('/')[1]
  const url = new URL(`${entry.packageName}/-/${leaf}-${entry.version}.tgz`, entry.registry)
  const response = await fetch(url, {
    signal, redirect: 'error', credentials: 'omit', headers: { authorization: 'Bearer ' + token },
  })
  if (!response.ok) throw new Error('Workbench archive HTTP ' + response.status)
  const source = await documentationFiles(await readBoundedBody(response, 25 * 1024 * 1024), entry)
  signal.throwIfAborted()
  return selectDocument(source, language)
}
