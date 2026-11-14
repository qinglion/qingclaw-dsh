/** QingClaw account route configuration and request-local resolution. */
import type { Volatile } from '@deepseek-ai/cordis'
import { isVolatile } from '@deepseek-ai/cosmokit'
import z from '@deepseek-ai/schemastery'
import {
  catalogModelFields, deepSeekConfigFields, modelListingConfigFields, modelListingURL, resolveAdapterOptions,
  resolveListingTiming,
} from '@deepseek-ai/dsh-llm-deepseek'
import type {
  Config as ProtocolConfig, ListingSettings, ModelListingConfig, ModelListingOptions, ModelOverride,
  Options as ProtocolOptions, ResolvedDeepSeekOptions,
} from '@deepseek-ai/dsh-llm-deepseek'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Default QingClaw Messages endpoint. */
export const DEFAULT_BASE_URL = 'https://api.qingclaw.com/anthropic'
/** Default deadline for exchanging the device session for one model JWT. */
export const DEFAULT_MODEL_TOKEN_TIMEOUT_MS = 30_000

/** QingClaw account route configuration; authentication comes from the account service. */
export interface Config extends Omit<ProtocolConfig, 'models'>, ModelListingConfig {
  /** Field overrides by model id, layered over the gateway listing and bundled catalog. */
  modelOverrides: Volatile<Record<string, ModelOverride>>
  /** Maximum duration of one device-session-to-model-token exchange. */
  modelTokenTimeoutMs: Volatile<number>
}

const { models: _protocolCatalog, ...protocolFields } = deepSeekConfigFields
const modelOverride: z<ModelOverride> = z.object({
  ...catalogModelFields,
  inputModalities: z.array(z.union(['text', 'image'] as const)),
})

export const Config = z.object({
  ...protocolFields,
  ...modelListingConfigFields,
  modelOverrides: z.dict(modelOverride).default({}).volatile(),
  modelTokenTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS)
    .default(DEFAULT_MODEL_TOKEN_TIMEOUT_MS).volatile(),
})

/** Plain QingClaw options accepted by {@link resolveOptions}. */
export type Options = Omit<ProtocolOptions, 'models'> & ModelListingOptions & {
  modelOverrides?: Record<string, ModelOverride>
  modelTokenTimeoutMs?: number
}

/** One validated configuration generation of the QingClaw account route. */
export interface ResolvedOptions {
  /** Messages settings; request resolution replaces `models` with the resolved catalog. */
  readonly protocol: ResolvedDeepSeekOptions
  /** Listing endpoint and cache timing. */
  readonly catalog: ListingSettings
  /** Overrides by model id, holding only the fields each one declares. */
  readonly modelOverrides: Readonly<Record<string, ModelOverride>>
  /** Deadline for one short-token exchange. */
  readonly modelTokenTimeoutMs: number
}

/**
 * Read the current value behind every reference of a validated Config.
 * @param config - parsed plugin Config.
 * @returns plain options for {@link resolveOptions}.
 */
export function plainOptions(config: Config): Options {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, isVolatile(value) ? value.get() : value]))
}

/** Keep only fields an override explicitly declares. */
function resolveOverride(id: string, override: Readonly<Record<string, unknown>>): ModelOverride {
  if (id.length === 0) throw new Error('llm-qingclaw-account: modelOverrides keys must be non-empty model ids')
  if (Object.hasOwn(override, 'id')) throw new Error(`llm-qingclaw-account: modelOverrides.${id} sets "id", which is its key`)
  const declared: ModelOverride = {}
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) continue
    Reflect.set(declared, key, value)
  }
  try {
    resolveAdapterOptions({ models: [{ inputModalities: ['text', 'image'], ...declared, id }] })
  } catch (error) {
    throw new Error(`llm-qingclaw-account: modelOverrides.${id} is invalid: ${String(error)}`, { cause: error })
  }
  return declared
}

/**
 * Resolve raw QingClaw settings into validated protocol, listing, and token-exchange facts.
 * @param options - plain QingClaw account options.
 * @returns validated settings with the QingClaw endpoint applied when `baseURL` is absent.
 */
export function resolveOptions(options: Options): ResolvedOptions {
  if (Object.hasOwn(options, 'models')) {
    throw new Error('llm-qingclaw-account: models is not configurable; /models or the bundled catalog supplies it. '
      + 'Adjust single models with modelOverrides.<model id>')
  }
  const {
    modelsTimeoutMs: _timeout, modelsMaxAgeMs: _maxAge, modelOverrides = {},
    modelTokenTimeoutMs = DEFAULT_MODEL_TOKEN_TIMEOUT_MS, ...protocolOptions
  } = options
  if (!Number.isFinite(modelTokenTimeoutMs) || modelTokenTimeoutMs <= 0 || modelTokenTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`llm-qingclaw-account: modelTokenTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  const timing = resolveListingTiming(options, 'llm-qingclaw-account')
  const protocol = resolveAdapterOptions({ ...protocolOptions, baseURL: protocolOptions.baseURL ?? DEFAULT_BASE_URL })
  return {
    protocol,
    catalog: { url: modelListingURL(protocol.baseURL), ...timing },
    modelOverrides: Object.fromEntries(Object.entries(modelOverrides).map(([id, override]) => [id, resolveOverride(id, override)])),
    modelTokenTimeoutMs,
  }
}
