import { CREATOR_PATH, type CreatorPackage } from '../types.ts'

type Transport = { __DSH_TRANSPORT__?: { fetch(url: URL, init: RequestInit): Promise<Response> } }
/** Use the shell's owner-peer transport when running in Desktop. */
export function creatorFetch(url: URL, init: RequestInit): Promise<Response> {
  const send = (globalThis as Transport).__DSH_TRANSPORT__?.fetch ?? globalThis.fetch
  return send(url, init)
}

async function request<T>(action: string, signal: AbortSignal, post = false, fields: Record<string, string> = {}): Promise<T> {
  const url = new URL(CREATOR_PATH.slice(1), document.baseURI)
  url.search = new URLSearchParams({ action, ...fields }).toString()
  const response = await creatorFetch(url, { method: post ? 'POST' : 'GET', headers: post ? { 'content-type': 'application/json' } : {}, signal })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) throw new Error(data?.message || data?.error || `HTTP ${response.status}`, { cause: response.status })
  return data as T
}

type InventoryRow = Omit<CreatorPackage, 'name' | 'title'> & { package_name: string }
interface Application {
  id: number
  package_name: string
  version: string
  title?: string
  state: string
  current?: boolean
  listing_blocked_by_version?: boolean
  error?: string
}

/** Prefer the listed application's title, then the most recent one, then the package name. */
function packageTitles(publications: Application[]): Map<string, string> {
  const chosen = new Map<string, { title: string; current: boolean; id: number }>()
  for (const item of publications) {
    const title = item.title?.trim()
    if (!title) continue
    const current = item.current === true
    const prior = chosen.get(item.package_name)
    if (!prior || (current && !prior.current) || (current === prior.current && item.id > prior.id)) {
      chosen.set(item.package_name, { title, current, id: item.id })
    }
  }
  return new Map([...chosen].map(([name, item]) => [name, item.title]))
}

/** Join registry history with the most recent application for each immutable package version. */
export async function getMyPackages(signal: AbortSignal): Promise<CreatorPackage[]> {
  const [inventory, applications] = await Promise.all([
    request<{ packages: InventoryRow[] }>('packages', signal),
    request<{ publications: Application[] }>('applications', signal),
  ])
  const titles = packageTitles(applications.publications)
  const latest = new Map<string, Application>()
  for (const item of applications.publications) {
    const key = item.package_name + '@' + item.version
    if ((latest.get(key)?.id ?? -1) < item.id) latest.set(key, item)
  }
  return inventory.packages.map(row => ({
    name: row.package_name, title: titles.get(row.package_name) ?? row.package_name,
    description: row.description, latest_version: row.latest_version,
    current_market_version: row.current_market_version ?? null, highest_market_version: row.highest_market_version ?? null,
    versions: row.versions.map((version) => {
      const listing = latest.get(row.package_name + '@' + version.version)
      if (!listing) return version
      return {
        ...version,
        listing_blocked_by_version: !!(version.listing_blocked_by_version || listing.listing_blocked_by_version),
        market_state: listing.state === 'published' && listing.current === false ? 'superseded' : listing.state,
        review_note: listing.error ?? null,
      }
    }),
  }))
}

export function submitListing(name: string, version: string, signal: AbortSignal): Promise<unknown> {
  return request('submit', signal, true, { package_name: name, version })
}
