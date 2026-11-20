declare module 'libnpmpublish' {
  /** npm CLI publication API. Receives the already-packed bytes and request-scoped options. */
  export function publish(manifest: Record<string, unknown>, tarball: Buffer, options: Record<string, unknown>): Promise<unknown>
}
