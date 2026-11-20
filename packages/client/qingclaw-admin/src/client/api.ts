import { CONTROL_PATH } from '../types.ts'

type ShellTransport = { __DSH_TRANSPORT__?: { fetch?: (url: URL, init: RequestInit) => Promise<Response> } }

/** The Host attaches the signed-in account to marketplace requests. */
export async function marketRequest<T>(action: string, signal: AbortSignal, options: {
  post?: boolean
  params?: Record<string, string>
} = {}): Promise<T> {
  const url = new URL(CONTROL_PATH.slice(1), document.baseURI)
  url.search = new URLSearchParams({ action, ...options.params }).toString()
  const carrier = (globalThis as ShellTransport).__DSH_TRANSPORT__?.fetch ?? globalThis.fetch
  const response = await carrier(url, {
    method: options.post ? 'POST' : 'GET', signal,
    headers: options.post ? { 'content-type': 'application/json' } : {},
  })
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok || payload === undefined) {
    if (action === 'list' && response.status === 404) throw new Error('listing_api_unavailable')
    const details = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const message = typeof details.message === 'string' ? details.message : details.error
    throw new Error(typeof message === 'string' ? message : `HTTP ${response.status}`, { cause: response.status })
  }
  return payload as T
}
