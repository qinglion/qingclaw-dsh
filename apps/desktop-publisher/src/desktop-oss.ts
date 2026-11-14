/** Shared Alibaba Cloud OSS client construction for QingClaw Desktop objects. */
import OSS from 'ali-oss'

/** Credentials for one OSS deployment; values never enter retained records. */
export interface DesktopOssCredentials {
  readonly accessKeyId: string
  readonly accessKeySecret: string
}

/** Public, non-secret OSS destination selected by the machine configuration. */
export interface DesktopOssDestination {
  readonly region: string
  readonly bucket: string
}

/**
 * Create a single-bucket OSS client with V4 signing and no SDK retries for streamed writes.
 * @param destination Validated region and bucket.
 * @param credentials RAM credentials restricted to the QingClaw object prefixes.
 * @param timeoutMs Per-request transfer timeout.
 * @returns Client bound to the selected bucket.
 */
export function createDesktopOss(destination: DesktopOssDestination, credentials: DesktopOssCredentials,
  timeoutMs = 900_000): OSS {
  return new OSS({
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    authorizationV4: true,
    bucket: destination.bucket,
    region: destination.region,
    secure: true,
    timeout: timeoutMs,
  })
}
