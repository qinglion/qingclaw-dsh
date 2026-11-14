import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { bindScopeParent, createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { restrictQingClawWebSearch } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: () => Promise.resolve(name),
  }
}

async function runtime(): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

async function scoped(ctx: Context, key: object): Promise<Scope> {
  let scope: Scope | undefined
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, {
    inject: ['tools', 'systemPrompt'],
  }))
  if (scope === undefined) throw new Error('Scope plugin did not activate')
  return scope
}

async function presetAgent(ctx: Context, withWeb: boolean): Promise<{ agent: Scope; key: object }> {
  const presetKey = {}
  const preset = await scoped(ctx, presetKey)
  if (withWeb) {
    preset.ctx.tools.register(tool('web_search'))
    preset.ctx.tools.register(tool('web_fetch'))
  }
  const key = {}
  bindScopeParent(key, presetKey)
  return { agent: await scoped(ctx, key), key }
}

describe('QingClaw Web policy', () => {
  it.each(['standard', 'ptc', 'cordis'])('keeps fetch and hides search in the %s preset scope', async () => {
    const ctx = await runtime()
    const { agent, key } = await presetAgent(ctx, true)

    restrictQingClawWebSearch(agent.ctx, key)

    expect(ctx.tools.schemas(key).map(schema => schema.name)).toEqual(['web_fetch'])
  })

  it('does nothing for the minimal preset, which has no Web tools', async () => {
    const ctx = await runtime()
    const { agent, key } = await presetAgent(ctx, false)

    expect(() => { restrictQingClawWebSearch(agent.ctx, key) }).not.toThrow()
    expect(ctx.tools.schemas(key)).toEqual([])
  })
})
