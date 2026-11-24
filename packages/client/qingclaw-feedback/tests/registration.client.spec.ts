// @vitest-environment jsdom
/** The plugin occupies the account menu's feedback cell below the built-in row. */
import { expect, vi } from 'vitest'
import { ClientRoster, createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import * as feedbackPlugin from '../src/client/index.ts'
import { FeedbackEntry } from '../src/client/FeedbackEntry.tsx'
import manifest from '../package.json' with { type: 'json' }

const roster = ClientRoster.of([...webApp.rows, { name: manifest.name, inject: manifest.dsh.client.inject, immediately: false }])
const it = createClientTest({ roster, provide: { [manifest.name]: feedbackPlugin } })

it('shadows the built-in questionnaire row and removes both registrations on unload', async ({ start }) => {
  const c = await start()
  await vi.waitFor(() => {
    expect(c.ctx.slots.entries('settings.launcher.feedback').some(entry => entry.component === FeedbackEntry)).toBe(true)
  })
  const entries = c.ctx.slots.entries('settings.launcher.feedback')
  expect(entries).toHaveLength(2)
  expect(entries.filter(entry => entry.options.priority === 0)).toHaveLength(1)
  const ours = entries.find(entry => entry.component === FeedbackEntry)!
  expect(ours.options.priority).toBe(-10)
  expect(ours.locale).toBe('qingclaw.feedback')
  expect(c.ctx.slots.entries('shell.overlay').some(entry => entry.options.id === 'qingclaw-feedback')).toBe(true)
  await c.unload(manifest.name)
  expect(c.ctx.slots.entries('settings.launcher.feedback').some(entry => entry.component === FeedbackEntry)).toBe(false)
  expect(c.ctx.slots.entries('shell.overlay').some(entry => entry.options.id === 'qingclaw-feedback')).toBe(false)
}, 120_000)
