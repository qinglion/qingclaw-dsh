/** Aggregate yuejuan-builder publication entrypoint for a complete macOS release. */
import { resolve } from 'node:path'
import { BuilderPublishUsageError, publishBuilderRelease } from './publish-builder-target.ts'

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  try { await publishBuilderRelease(process.argv.slice(2)) }
  catch (error) {
    const usage = error instanceof BuilderPublishUsageError
      || (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS_'))
    process.stderr.write(`${usage ? 'QingClaw builder release usage error' : 'QingClaw builder release failed'}: ${
      error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
