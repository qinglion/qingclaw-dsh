/**
 * Verify every change this fork makes to upstream-owned files is registered.
 *
 * The fork keeps a bounded set of patches over the upstream tree. This gate lists
 * the files that differ from the upstream base and require a ledger entry, so a new
 * patch cannot arrive without a stated intent and exit condition.
 * @module verify-qingclaw-patches
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

/** Patch kinds the ledger distinguishes. */
export type PatchKind = 'brand' | 'distribution' | 'feature' | 'config-seam' | 'test-adaptation' | 'upstream-worthy'

/** One ledger row. */
export interface LedgerEntry {
  /** Repository-relative glob the entry covers; the first matching entry owns a path. */
  readonly glob: string
  readonly kind: PatchKind
  /** Why this fork patches upstream here. */
  readonly intent: string
  /** How the patch leaves this fork. */
  readonly exit: string
  /** Upstream pull request, for entries meant to leave. */
  readonly pr?: string
}

/** Ledger document. */
export interface Ledger { readonly base: string; readonly entries: readonly LedgerEntry[] }

/** One changed path without an owner. */
export interface LedgerFailure { readonly path: string; readonly reason: string }

/**
 * Compile one ledger glob to an anchored regular expression.
 * `**` spans path separators, `*` does not.
 * @param glob - ledger glob.
 * @returns the matcher for repository-relative paths.
 */
export function globMatcher(glob: string): RegExp {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') { pattern += '.*'; index += 1 } else pattern += '[^/]*'
    } else if ('\\.+?()[]{}^$|'.includes(char ?? '')) {
      pattern += `\\${char}`
    } else pattern += char
  }
  return new RegExp(`^${pattern}$`, 'u')
}

/**
 * Check changed upstream paths against the ledger.
 * @param paths - paths that exist upstream and differ in this tree.
 * @param ledger - parsed ledger.
 * @returns failures for uncovered paths, empty intents, and stale rows.
 */
export function checkLedger(paths: readonly string[], ledger: Ledger): LedgerFailure[] {
  const failures: LedgerFailure[] = []
  const matchers = ledger.entries.map(entry => ({ entry, matcher: globMatcher(entry.glob) }))
  const matched = new Set<string>()
  for (const path of paths) {
    const owner = matchers.find(candidate => candidate.matcher.test(path))
    if (owner === undefined) {
      failures.push({ path, reason: 'no ledger entry names this patch' })
      continue
    }
    matched.add(owner.entry.glob)
  }
  for (const { entry } of matchers) {
    if (!matched.has(entry.glob)) failures.push({ path: entry.glob, reason: 'ledger entry matches no patch' })
    if (entry.intent.trim().length === 0) failures.push({ path: entry.glob, reason: 'ledger entry states no intent' })
    if (entry.exit.trim().length === 0) failures.push({ path: entry.glob, reason: 'ledger entry states no exit condition' })
    if (entry.kind === 'upstream-worthy' && (entry.pr ?? '').trim().length === 0) {
      failures.push({ path: entry.glob, reason: 'upstream-worthy entry names no pull request' })
    }
  }
  return failures
}

/**
 * List upstream paths this tree modifies.
 * @param repo - checkout to read.
 * @param base - upstream ref to compare against.
 * @returns repository-relative paths that exist in both trees and differ.
 */
export function changedUpstreamPaths(repo: string, base: string): string[] {
  const git = (...args: string[]): string => execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    // The upstream tree listing alone is a few megabytes of paths.
    maxBuffer: 256 * 1024 * 1024,
  })
  const upstream = new Set(git('ls-tree', '-r', '--name-only', base).split('\n').filter(Boolean))
  return git('diff', '--name-status', base, 'HEAD').split('\n')
    .map(line => line.split('\t'))
    .filter(fields => fields[0]?.startsWith('M') === true && fields[1] !== undefined)
    .map(fields => fields[1] as string)
    .filter(path => upstream.has(path))
}

/** @param argv - process arguments after the script name. @returns the parsed options. */
export function parseArgs(argv: readonly string[]): { ledger: string; repo: string; base: string | undefined } {
  let ledger = 'scripts/qingclaw-patch-ledger.json'
  let repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
  let base: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--ledger') ledger = argv[index + 1] ?? ledger
    else if (arg === '--repo') repo = argv[index + 1] ?? repo
    else if (arg === '--base') base = argv[index + 1]
    else continue
    index += 1
  }
  return { ledger, repo, base }
}

/** Run the gate for one checkout. @param argv - process arguments after the script name. */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const options = parseArgs(argv)
  const ledger = JSON.parse(readFileSync(join(options.repo, options.ledger), 'utf8')) as Ledger
  const base = options.base ?? ledger.base
  const paths = changedUpstreamPaths(options.repo, base)
  const failures = checkLedger(paths, ledger)
  if (failures.length > 0) {
    console.error('verify-qingclaw-patches: ledger disagrees with the tree:')
    for (const failure of failures) console.error(`  ${failure.path}: ${failure.reason}`)
    process.exitCode = 1
    return
  }
  console.log(`verify-qingclaw-patches: ${paths.length} upstream patch(es) across ${ledger.entries.length} ledger entr(ies)`)
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) main()
