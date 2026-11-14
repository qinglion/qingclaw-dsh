/** Alibaba Cloud OSS transport for resumable QingClaw Desktop publication. */
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import type OSS from 'ali-oss'
import { createDesktopOss, type DesktopOssCredentials, type DesktopOssDestination } from './desktop-oss.ts'
import type { DesktopUploadPlan } from './desktop-upload-types.ts'
import {
  prepareDesktopArtifactUpload,
  type DesktopPublishTransport,
  type DesktopVerifiedObjectWriter,
} from './desktop-publish.ts'
import { DesktopOssOperationError } from './desktop-publication-failure.ts'

/** Narrow client surface used by production and deterministic transport tests. */
export interface DesktopOssClient {
  getStream(name?: string, options?: OSS.GetStreamOptions): Promise<OSS.GetStreamResult>
  putStream(name: string, stream: unknown, options?: OSS.PutStreamOptions): Promise<unknown>
}

function missing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = 'code' in error ? error.code : undefined
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined
  return code === 'NoSuchKey' && status === 404
}

function header(headers: object, name: string): string | undefined {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1]
  return typeof value === 'string' ? value : undefined
}

function putOptions(size: number, contentType: string, md5: string, contentDisposition?: string,
  forbidOverwrite = false, mutable = false): OSS.PutStreamOptions {
  return {
    contentLength: size,
    timeout: 900_000,
    mime: contentType,
    headers: {
      'Content-MD5': md5,
      'Cache-Control': mutable ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
      ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
      ...(forbidOverwrite ? { 'x-oss-forbid-overwrite': 'true' } : {}),
    },
  } as OSS.PutStreamOptions
}

function factory(destination: DesktopOssDestination, credentials: DesktopOssCredentials,
  createClient: (destination: DesktopOssDestination, credentials: DesktopOssCredentials) => DesktopOssClient) {
  return () => createClient(destination, credentials)
}

/** Create a bounded OSS transport restricted to the validated plan's object keys. */
export function desktopPublishOss(
  plan: DesktopUploadPlan, destination: DesktopOssDestination, credentials: DesktopOssCredentials,
  createClient: (destination: DesktopOssDestination, credentials: DesktopOssCredentials) => DesktopOssClient = createDesktopOss,
): DesktopPublishTransport {
  if (destination.bucket !== plan.bucket) throw new Error('desktop publish: OSS destination differs from the selected plan')
  const keys = new Map(plan.artifacts.map(artifact => [artifact.key, artifact.channelMetadata]))
  const client = factory(destination, credentials, createClient)
  const role = (key: string, channel: boolean) => {
    if (!keys.has(key)) throw new Error('desktop publish: object is outside the selected plan')
    if (keys.get(key) !== channel) throw new Error('desktop publish: object role mismatch')
  }
  return {
    async read(key, channel) {
      role(key, channel)
      let stream: Readable | undefined
      try {
        const response = await client().getStream(key, { timeout: 900_000 })
        if (!(response.stream instanceof Readable)) throw new Error('desktop publish: OSS returned no readable object stream')
        stream = response.stream
        const sha512 = createHash('sha512')
        const chunks: Buffer[] = []
        let size = 0
        for await (const bytes of stream as AsyncIterable<Buffer | Uint8Array | string>) {
          const chunk = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
          size += chunk.length
          if (channel && size > 1024 * 1024) throw new Error('desktop publish: channel metadata exceeds 1 MiB')
          sha512.update(chunk)
          if (channel) chunks.push(chunk)
        }
        const contentDisposition = header(response.res.headers, 'content-disposition')
        return { size, sha512: sha512.digest('base64'), ...(contentDisposition ? { contentDisposition } : {}),
          ...(channel ? { contents: Buffer.concat(chunks).toString('utf8') } : {}) }
      } catch (error) {
        if (missing(error)) return null
        throw new DesktopOssOperationError('GetObject', error)
      } finally { stream?.destroy() }
    },
    async put(artifact, digest, forbidOverwrite) {
      role(artifact.key, artifact.channelMetadata)
      if (forbidOverwrite === artifact.channelMetadata) throw new Error('desktop publish: object write policy mismatch')
      if (digest.size === 0) throw new Error('desktop publish: OSS does not publish empty update objects')
      const upload = await prepareDesktopArtifactUpload(artifact)
      try {
        if (upload.digest.size !== digest.size || upload.digest.sha512 !== digest.sha512) {
          throw new Error('desktop publish: local input changed')
        }
        try {
          await client().putStream(artifact.key, upload.body,
            putOptions(digest.size, artifact.contentType, upload.md5, artifact.contentDisposition,
              forbidOverwrite, artifact.channelMetadata))
        } catch (error) { throw new DesktopOssOperationError('PutObject', error) }
      } finally { await upload.close() }
    },
  }
}

/** Create the OSS write path for a caller-owned, already verified installer stream. */
export function desktopPublishOssWriter(
  plan: DesktopUploadPlan, destination: DesktopOssDestination, credentials: DesktopOssCredentials,
  createClient: (destination: DesktopOssDestination, credentials: DesktopOssCredentials) => DesktopOssClient = createDesktopOss,
): DesktopVerifiedObjectWriter {
  if (destination.bucket !== plan.bucket) throw new Error('desktop publish: OSS destination differs from the selected plan')
  const keys = new Set(plan.artifacts.map(artifact => artifact.key))
  const client = factory(destination, credentials, createClient)
  return { async put(upload) {
    if (!keys.has(upload.key)) throw new Error('desktop publish: object is outside the selected plan')
    if (upload.digest.size === 0) throw new Error('desktop publish: OSS does not publish empty update objects')
    try {
      await client().putStream(upload.key, upload.body,
        putOptions(upload.digest.size, upload.contentType, upload.md5, upload.contentDisposition, false, true))
    } catch (error) { throw new DesktopOssOperationError('PutObject', error) }
    finally { upload.body.destroy() }
  } }
}
