/** Notarize with separate upload and wait timings while preserving signature checks and stapling. */
import type { MacOSNotarizationEnvironment } from './desktop-release-environment.mjs'
/**
 * Notarize and staple an App or DMG through the measured notarytool adapter.
 * @param options Validated Apple credentials and artifact path.
 * @returns Resolves after acceptance and stapling; failures remain in the packaging journal.
 */
export function notarizeMacOS(options: MacOSNotarizationEnvironment & { appPath: string }): Promise<void>
/**
 * Run one notarization attempt, repeating transient Apple ticket-service failures.
 * @param action Complete submission, wait, and staple.
 * @param options Retry bounds and injected wait for tests.
 * @returns The successful attempt's result.
 */
export function retryTransientNotarization(
  action: () => Promise<unknown>,
  options?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<unknown>
