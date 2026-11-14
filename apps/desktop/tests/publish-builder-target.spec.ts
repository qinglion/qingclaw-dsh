import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { BuilderPublishUsageError, parseBuilderPublishArgs, parseBuilderReleaseArgs } from '../scripts/publish-builder-target.ts'

it('parses the stable yuejuan-builder publication contract', () => {
  const recordsRoot = resolve('qingclaw-records')
  expect(parseBuilderPublishArgs(['mac-arm64', '--with-latest', '--records-root', recordsRoot]))
    .toEqual({ target: 'mac-arm64', withLatest: true, recordsRoot })
})

it.each([
  { args: [] },
  { args: ['linux-x64'] },
  { args: ['mac-arm64', 'mac-x64'] },
  { args: ['mac-arm64', '--records-root', 'relative'] },
])('rejects invalid external-builder arguments $args', ({ args }) => {
  expect(() => parseBuilderPublishArgs(args)).toThrow(BuilderPublishUsageError)
})

it('parses the aggregate macOS release contract in a fixed target order', () => {
  const recordsRoot = resolve('qingclaw-release-records')
  expect(parseBuilderReleaseArgs(['mac-x64', 'mac-arm64', '--with-latest', '--records-root', recordsRoot]))
    .toEqual({ targets: ['mac-arm64', 'mac-x64'], withLatest: true, recordsRoot })
})

it.each([
  { args: [] },
  { args: ['mac-arm64'] },
  { args: ['mac-arm64', 'mac-arm64'] },
  { args: ['mac-arm64', 'win-x64'] },
  { args: ['mac-arm64', 'mac-x64', 'win-x64'] },
  { args: ['mac-arm64', 'mac-x64'] },
])('rejects an incomplete aggregate release target set $args', ({ args }) => {
  expect(() => parseBuilderReleaseArgs(args)).toThrow(BuilderPublishUsageError)
})
