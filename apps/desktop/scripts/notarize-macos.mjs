/** Preserve electron-notarize's signature checks and stapling while recording separate Apple phases. */
import { fileURLToPath } from 'node:url'
import { notarize } from '@electron/notarize'
import { packagingStep } from './packaging-step.mjs'

/**
 * Apple failures that a repeated submission or staple can recover from. Ticket
 * delivery and stapling reach Apple's services from the packaging host, so a
 * lost connection is not evidence that the signed artifact is invalid.
 */
const TRANSIENT_NOTARIZATION_FAILURE = /network connection was lost|NSURLErrorDomain|The staple and validate action failed|timed out|ETIMEDOUT|ECONNRESET|EAI_AGAIN/iu

const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Run one notarization attempt, repeating it when Apple's ticket service loses
 * the connection. Non-network failures keep their original single-attempt
 * behavior so a signing or credential defect still fails immediately.
 * @param {() => Promise<unknown>} action Complete submission, wait, and staple.
 * @param {object} [options] Retry bounds.
 * @param {number} [options.attempts] Maximum attempts, at least one.
 * @param {number} [options.delayMs] Wait between attempts.
 * @param {(ms: number) => Promise<void>} [options.sleep] Wait implementation for tests.
 * @returns {Promise<unknown>} The successful attempt's result.
 */
export async function retryTransientNotarization(
  action,
  { attempts = 3, delayMs = 30_000, sleep = sleepFor } = {},
) {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('notarization attempts must be a positive integer')
  let failure
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      failure = error
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === attempts || !TRANSIENT_NOTARIZATION_FAILURE.test(message)) throw error
      process.stdout.write(`desktop macOS notarization: transient Apple failure on attempt ${String(attempt)}/${String(attempts)}; retrying in ${String(Math.round(delayMs / 1000))}s\n`)
      await sleep(delayMs)
    }
  }
  throw failure
}

/**
 * Notarize and staple one App or DMG through the measured notarytool adapter.
 * @param {object} options Validated credentials and appPath accepted by electron-notarize.
 * @returns {Promise<void>} Resolves only after Apple acceptance and stapling.
 */
export async function notarizeMacOS(options) {
  const secrets = Object.entries(options).filter(([name]) => /password|key|appleId/iu.test(name)).map(([, value]) => String(value))
  await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'notarize-and-staple',
    () => retryTransientNotarization(
      () => notarize({ ...options, notarytoolPath: fileURLToPath(new URL('./logged-notarytool.mjs', import.meta.url)) }),
    ), secrets)
}
