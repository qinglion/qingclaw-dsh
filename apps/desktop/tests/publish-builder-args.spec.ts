/** Accept the argument separator pnpm forwards to builder publication scripts. */

import { expect, it } from 'vitest'
import { parseBuilderPublishArgs, parseBuilderReleaseArgs } from '../scripts/publish-builder-target.ts'

it('reads the aggregate targets after the separator pnpm forwards', () => {
  expect(parseBuilderReleaseArgs([
    '--', 'mac-arm64', 'mac-x64', '--with-latest', '--records-root', '/tmp/qingclaw-publication',
  ])).toEqual({
    targets: ['mac-arm64', 'mac-x64'],
    withLatest: true,
    recordsRoot: '/tmp/qingclaw-publication',
  })
})

it('keeps the direct invocation contract for a single target', () => {
  expect(parseBuilderPublishArgs([
    'mac-x64', '--with-latest', '--records-root', '/tmp/qingclaw-publication',
  ])).toMatchObject({ target: 'mac-x64', withLatest: true })
})
