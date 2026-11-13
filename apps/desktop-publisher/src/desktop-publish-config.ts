/** Read public deployment settings independently from upload and GitHub App secrets. */
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { z } from 'zod'
import type { DesktopCosCredentials } from './desktop-cos.ts'
import type { DesktopOssCredentials } from './desktop-oss.ts'

const singleLine = z.string().min(1).regex(/^[^\r\n\0]+$/u, 'expected a single-line value')
const absolutePath = singleLine.refine(isAbsolute, 'expected an absolute path')
const storageSchema = z.discriminatedUnion('provider', [
  z.strictObject({ provider: z.literal('tencent-cos') }),
  z.strictObject({ provider: z.literal('aliyun-oss'), region: z.string().regex(/^oss-[a-z0-9-]+$/u) }),
])
const cacheSchema = z.discriminatedUnion('provider', [
  z.strictObject({ provider: z.literal('none') }),
  z.strictObject({ provider: z.literal('tencent-edgeone'), zoneId: z.string().regex(/^zone-[a-z0-9]+$/u) }),
])
const schema = z.strictObject({
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u),
  origin: z.url().refine((value) => { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash }, 'expected an HTTPS origin'),
  credentialsFile: absolutePath,
  storage: storageSchema.optional(),
  cache: cacheSchema.optional(),
  edgeOneZoneId: z.string().regex(/^zone-[a-z0-9]+$/u).optional(),
  macOS: z.strictObject({ signingIdentity: z.string().min(1), teamId: z.string().regex(/^[A-Z0-9]{10}$/u) }).optional(),
  windows: z.strictObject({ certificateThumbprint: z.string().regex(/^[A-Fa-f0-9]{40}$/u) }).optional(),
  githubApp: z.strictObject({ clientId: singleLine, privateKeyFile: absolutePath }).optional(),
}).superRefine((config, context) => {
  const provider = config.storage?.provider ?? 'tencent-cos'
  if (provider === 'tencent-cos' && !/-\d+$/u.test(config.bucket)) {
    context.addIssue({ code: 'custom', path: ['bucket'], message: 'Tencent COS bucket must end with its numeric application ID' })
  }
  if (config.cache !== undefined && config.edgeOneZoneId !== undefined) {
    context.addIssue({ code: 'custom', path: ['cache'], message: 'cache and legacy edgeOneZoneId must not both be configured' })
  }
  if (provider === 'aliyun-oss' && (config.cache?.provider === 'tencent-edgeone' || config.edgeOneZoneId !== undefined)) {
    context.addIssue({ code: 'custom', path: ['cache'], message: 'Alibaba OSS first-phase publication supports cache provider none only' })
  }
})
/** Public machine configuration; all secret fields are file references. */
export type DesktopPublishConfig = z.infer<typeof schema>
export type DesktopStorageConfig = z.infer<typeof storageSchema>
export type DesktopCacheConfig = z.infer<typeof cacheSchema>
export type DesktopUploadCredentials = DesktopCosCredentials | DesktopOssCredentials

/** Resolve omitted legacy storage settings to Tencent COS. */
export function desktopStorageConfig(config: DesktopPublishConfig): DesktopStorageConfig {
  return config.storage ?? { provider: 'tencent-cos' }
}

/** Resolve the optional website cache, including the legacy EdgeOne field. */
export function desktopCacheConfig(config: DesktopPublishConfig): DesktopCacheConfig | undefined {
  if (config.cache !== undefined) return config.cache
  return config.edgeOneZoneId === undefined
    ? undefined
    : { provider: 'tencent-edgeone', zoneId: config.edgeOneZoneId }
}

/** Stable, non-secret destination identity used by approvals, locks and durable publication records. */
export function desktopPublishDestination(config: DesktopPublishConfig, resource: string): string {
  const storage = desktopStorageConfig(config)
  return JSON.stringify({ storage, bucket: config.bucket, origin: config.origin, resource })
}

/** Stable, non-secret policy identity; changing storage, region or cache invalidates prior approval. */
export function desktopPublishPolicy(config: DesktopPublishConfig): {
  readonly storage: DesktopStorageConfig
  readonly bucket: string
  readonly origin: string
  readonly cache: DesktopCacheConfig | null
} {
  return { storage: desktopStorageConfig(config), bucket: config.bucket, origin: config.origin,
    cache: desktopCacheConfig(config) ?? null }
}

/**
 * Read one named deployment without opening referenced credential files.
 * @param configRoot Absolute machine packaging configuration directory.
 * @param preset Selected deployment from the retained package.
 * @returns Validated public configuration; production requires App configuration.
 */
export async function readDesktopPublishConfig(configRoot: string, preset: 'test' | 'production'): Promise<DesktopPublishConfig> {
  if (!isAbsolute(configRoot)) throw new Error('desktop publish: configuration root must be absolute')
  const config = schema.parse(JSON.parse(await readFile(join(configRoot, 'publishing', `${preset}.json`), 'utf8')))
  if (preset === 'production' && !config.githubApp) {
    throw new Error('desktop publish: production requires GitHub App configuration')
  }
  return config
}

/**
 * Read upload credentials only after authorization and local validation have passed.
 * @param config Previously validated public deployment configuration.
 * @returns Provider-matched credential pair; contents never enter audit records.
 */
export async function readDesktopUploadCredentials(config: DesktopPublishConfig): Promise<DesktopUploadCredentials> {
  try {
    const value: unknown = JSON.parse(await readFile(config.credentialsFile, 'utf8'))
    return desktopStorageConfig(config).provider === 'aliyun-oss'
      ? z.strictObject({ accessKeyId: z.string().min(1), accessKeySecret: z.string().min(1) }).parse(value)
      : z.strictObject({ secretId: z.string().min(1), secretKey: z.string().min(1) }).parse(value)
  } catch {
    throw new Error('desktop publish: cannot read valid upload credentials from the configured file')
  }
}

/** Narrow credentials after the public provider selection has been validated. */
export function requireDesktopCosCredentials(credentials: DesktopUploadCredentials): DesktopCosCredentials {
  if (!('secretId' in credentials)) throw new Error('desktop publish: COS credentials do not match the selected storage provider')
  return credentials
}

/** Narrow credentials after the public provider selection has been validated. */
export function requireDesktopOssCredentials(credentials: DesktopUploadCredentials): DesktopOssCredentials {
  if (!('accessKeyId' in credentials)) throw new Error('desktop publish: OSS credentials do not match the selected storage provider')
  return credentials
}

/** Require an explicit website-cache policy before fixed installer publication. */
export function requireDesktopWebsiteCache(config: DesktopPublishConfig): DesktopCacheConfig {
  const cache = desktopCacheConfig(config)
  if (cache === undefined) throw new Error('website publication: configure edgeOneZoneId in publishing/production.json before uploading, or set cache.provider to none for a direct origin')
  return cache
}

/**
 * Require the configured EdgeOne destination before website upload or cache recovery.
 * @param config Validated machine publication settings.
 * @returns Configured EdgeOne zone identifier.
 */
export function requireDesktopEdgeOneZoneId(config: DesktopPublishConfig): string {
  const cache = desktopCacheConfig(config)
  if (cache?.provider !== 'tencent-edgeone') throw new Error('website publication: configure edgeOneZoneId in publishing/production.json before uploading')
  return cache.zoneId
}
