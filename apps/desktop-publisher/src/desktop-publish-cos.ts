/** COS transport for resumable Desktop publication; callers authorize writes and own the channel lock. */
import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'
import type COS from 'cos-nodejs-sdk-v5'
import { createDesktopCos, DESKTOP_COS_REGION, type DesktopCosCredentials } from './desktop-cos.ts'
import { cosOperation } from './cos-operation.ts'
import type { DesktopUploadPlan } from './desktop-upload-types.ts'
import { prepareDesktopArtifactUpload, type DesktopPublishTransport, type DesktopVerifiedObjectWriter } from './desktop-publish.ts'
import { DesktopCosOperationError } from './desktop-publication-failure.ts'

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'NoSuchKey'
}

/**
 * Create a bounded COS transport restricted to the validated plan's object keys.
 * Administrators must keep bucket versioning absent; publication does not query bucket configuration.
 * @param plan Destination and exact object inventory; arbitrary keys are rejected.
 * @param credentials Credentials for this deployment only.
 * @param createClient Client factory; absent uses the shared production client, tests supply a loopback client.
 * @returns Streaming reads and single-attempt writes; transport construction performs no requests.
 */
export function desktopPublishCos(
  plan: DesktopUploadPlan, credentials: DesktopCosCredentials,
  createClient: (credentials: DesktopCosCredentials) => COS = createDesktopCos,
): DesktopPublishTransport {
  const keys = new Map(plan.artifacts.map(artifact => [artifact.key, artifact.channelMetadata]))
  const client = () => createClient(credentials)
  const location = (key: string) => {
    if (!keys.has(key)) throw new Error('desktop publish: object is outside the selected plan')
    return { Bucket: plan.bucket, Region: DESKTOP_COS_REGION, Key: key }
  }
  return {
    async read(key, channel) {
      const address = location(key)
      if (keys.get(key) !== channel) throw new Error('desktop publish: object role mismatch')
      const sha512 = createHash('sha512')
      const chunks: Buffer[] = []
      let size = 0
      const output = new Writable({
        write(bytes: Buffer, _encoding, done) {
          size += bytes.length
          if (channel && size > 1024 * 1024) { done(new Error('desktop publish: channel metadata exceeds 1 MiB')); return }
          sha512.update(bytes)
          if (channel) chunks.push(Buffer.from(bytes))
          done()
        },
      })
      try {
        const cos = client()
        const response = await cosOperation(cos, 900_000, () => cos.getObject({ ...address, Output: output }))
        return { size, sha512: sha512.digest('base64'),
          ...(typeof response.headers?.['content-disposition'] === 'string' ? { contentDisposition: response.headers['content-disposition'] } : {}), ...(channel ? { contents: Buffer.concat(chunks).toString('utf8') } : {}) }
      } catch (error) {
        if (missing(error)) return null
        throw new DesktopCosOperationError('GetObject', error)
      } finally { output.destroy() }
    },
    async put(artifact, digest, forbidOverwrite) {
      const address = location(artifact.key)
      if (keys.get(artifact.key) !== artifact.channelMetadata || forbidOverwrite === artifact.channelMetadata) {
        throw new Error('desktop publish: object write policy mismatch')
      }
      const upload = await prepareDesktopArtifactUpload(artifact)
      try {
        if (upload.digest.size !== digest.size || upload.digest.sha512 !== digest.sha512) {
          throw new Error('desktop publish: local input changed')
        }
        const cos = client()
        try {
          await cosOperation(cos, 900_000, () => cos.putObject({
            ...address, Body: upload.body, ContentLength: digest.size, ContentType: artifact.contentType,
            Headers: { 'Content-MD5': upload.md5,
              ...(artifact.contentDisposition ? { 'Content-Disposition': artifact.contentDisposition } : {}), ...(forbidOverwrite ? { 'x-cos-forbid-overwrite': 'true' } : {}) },
          }))
        } catch (error) { throw new DesktopCosOperationError('PutObject', error) }
      } finally { await upload.close() }
    },
  }
}

/** Create the COS write path for a caller-owned, already verified installer stream. */
export function desktopPublishCosWriter(
  plan: DesktopUploadPlan, credentials: DesktopCosCredentials,
  createClient: (credentials: DesktopCosCredentials) => COS = createDesktopCos,
): DesktopVerifiedObjectWriter {
  const keys = new Set(plan.artifacts.map(artifact => artifact.key))
  return { async put(upload) {
    if (!keys.has(upload.key)) throw new Error('desktop publish: object is outside the selected plan')
    const cos = createClient(credentials)
    try {
      await cosOperation(cos, 900_000, () => cos.putObject({
        Bucket: plan.bucket, Region: DESKTOP_COS_REGION, Key: upload.key, Body: upload.body,
        ContentLength: upload.digest.size, ContentType: upload.contentType,
        Headers: { 'Content-MD5': upload.md5, 'Content-Disposition': upload.contentDisposition },
      }))
    } catch (error) { throw new DesktopCosOperationError('PutObject', error) }
    finally { upload.body.destroy() }
  } }
}
