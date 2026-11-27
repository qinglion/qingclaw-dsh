// @vitest-environment jsdom
/** The plugin occupies a sidebar footer cell and hosts its dialog above the shell. */
import { expect, vi } from 'vitest'
import { ClientRoster, createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import * as feedbackPlugin from '../src/client/index.ts'
import { FeedbackAction } from '../src/client/FeedbackAction.tsx'
import manifest from '../package.json' with { type: 'json' }

const roster = ClientRoster.of([...webApp.rows, { name: manifest.name, inject: manifest.dsh.client.inject, immediately: false }])
const it = createClientTest({ roster, provide: { [manifest.name]: feedbackPlugin } })

it('adds the footer feedback control and removes both registrations on unload', async ({ start }) => {
  const c = await start()
  await vi.waitFor(() => {
    expect(c.ctx.slots.entries('sidebar.footer.action').some(entry => entry.component === FeedbackAction)).toBe(true)
  })
  const entry = c.ctx.slots.entries('sidebar.footer.action').find(row => row.component === FeedbackAction)!
  expect(entry.options.order).toBe(40)
  expect(entry.locale).toBe('qingclaw.feedback')
  expect(c.ctx.slots.entries('shell.overlay').some(row => row.options.id === 'qingclaw-feedback')).toBe(true)
  await c.unload(manifest.name)
  expect(c.ctx.slots.entries('sidebar.footer.action').some(row => row.component === FeedbackAction)).toBe(false)
  expect(c.ctx.slots.entries('shell.overlay').some(row => row.options.id === 'qingclaw-feedback')).toBe(false)
}, 120_000)
