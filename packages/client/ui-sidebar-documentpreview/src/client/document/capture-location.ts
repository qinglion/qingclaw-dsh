/** Translate a preview rectangle to document coordinates and back. */

/** Rectangle measured in viewport CSS pixels. */
export interface DocumentCaptureRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface SurfacePoint {
  readonly page: number
  readonly x: number
  readonly y: number
}

interface RowPoint {
  readonly index: number
  readonly offset: number
}

/** Position of a capture in the rendered version of its source file. */
export interface DocumentCaptureLocation {
  readonly renderer: string
  readonly version: string
  readonly area:
    | { readonly kind: 'surface'; readonly first: SurfacePoint; readonly last: SurfacePoint }
    | {
      readonly kind: 'rows'
      readonly first: RowPoint
      readonly last: RowPoint
      readonly x: number
      readonly width: number
      readonly viewportWidth?: number
    }
    | { readonly kind: 'scroll'; readonly rect: DocumentCaptureRect }
}

const SURFACE = '[data-document-zoom-surface]:not([hidden])'

function rows(port: HTMLElement): readonly Element[] {
  const markdown = port.querySelector('[data-document-markdown]')
  return markdown === null
    ? Array.from(port.querySelectorAll(port.hasAttribute('data-code-block-content') ? 'pre .line' : '[data-textpreview-line]'))
    : Array.from(markdown.children)
}

function rowAt(list: readonly Element[], y: number): RowPoint | undefined {
  let low = 0
  let high = list.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((list[mid]?.getBoundingClientRect().bottom ?? y) < y) low = mid + 1
    else high = mid
  }
  const index = Math.min(low, list.length - 1)
  const bounds = list[index]?.getBoundingClientRect()
  return bounds === undefined || bounds.height === 0 ? undefined : { index, offset: (y - bounds.top) / bounds.height }
}

function surfaceAt(surfaces: readonly HTMLElement[], x: number, y: number): SurfacePoint | undefined {
  let closest: SurfacePoint | undefined
  let distance = Number.POSITIVE_INFINITY
  for (const element of surfaces) {
    const bounds = element.getBoundingClientRect()
    const gap = Math.max(bounds.top - y, y - bounds.bottom, 0)
    if (bounds.width <= 0 || bounds.height <= 0 || gap >= distance) continue
    distance = gap
    closest = {
      page: Number(element.closest('[data-pdf-page]')?.getAttribute('data-pdf-page') ?? 0),
      x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height,
    }
    if (gap === 0) break
  }
  return closest
}

/**
 * Record a rectangle against page surfaces, text rows, or the owning scrollport.
 * @param port - the renderer's scrollport.
 * @param region - the selected viewport rectangle.
 * @param reflows - whether the renderer wraps content to the viewport.
 * @returns coordinates stable across tab placement and scroll offsets.
 */
export function captureArea(port: HTMLElement, region: DocumentCaptureRect, reflows: boolean): DocumentCaptureLocation['area'] {
  const surfaces = Array.from(port.querySelectorAll<HTMLElement>(SURFACE))
  const first = surfaceAt(surfaces, region.x, region.y)
  const last = surfaceAt(surfaces, region.x + region.width, region.y + region.height)
  if (first !== undefined && last !== undefined) return { kind: 'surface', first, last }
  const bounds = port.getBoundingClientRect()
  const x = region.x - bounds.left + port.scrollLeft
  const list = rows(port)
  const top = rowAt(list, region.y)
  const bottom = rowAt(list, region.y + region.height)
  if (top !== undefined && bottom !== undefined) {
    return { kind: 'rows', first: top, last: bottom, x, width: region.width,
      ...(reflows && port.clientWidth > 0 ? { viewportWidth: port.clientWidth } : {}) }
  }
  return { kind: 'scroll', rect: { ...region, x, y: region.y - bounds.top + port.scrollTop } }
}

function surfacePoint(port: HTMLElement, point: SurfacePoint): { x: number; y: number } | undefined {
  const selector = point.page === 0 ? SURFACE : `[data-pdf-page="${point.page}"] ${SURFACE}`
  const bounds = port.querySelector(selector)?.getBoundingClientRect()
  return bounds === undefined || bounds.width === 0 || bounds.height === 0 ? undefined
    : { x: bounds.left + point.x * bounds.width, y: bounds.top + point.y * bounds.height }
}

function rowBounds(port: HTMLElement, index: number): DOMRect | undefined {
  const markdown = port.querySelector('[data-document-markdown]')
  if (markdown !== null) return markdown.children.item(index)?.getBoundingClientRect()
  const number = index + 1
  const selector = port.hasAttribute('data-code-block-content')
    ? `pre .line:nth-child(${number} of .line)` : `[data-textpreview-line="${number}"]`
  return port.querySelector(selector)?.getBoundingClientRect()
}

/**
 * Measure a saved region after the renderer has drawn its anchors.
 * @param port - the renderer's scrollport.
 * @param area - saved document coordinates.
 * @returns a viewport rectangle, or undefined while its anchors are unavailable.
 */
export function measureCaptureArea(port: HTMLElement, area: DocumentCaptureLocation['area']): DocumentCaptureRect | undefined {
  switch (area.kind) {
    case 'surface': {
      const first = surfacePoint(port, area.first)
      const last = surfacePoint(port, area.last)
      if (first === undefined || last === undefined) return undefined
      return { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y),
        width: Math.abs(last.x - first.x), height: Math.abs(last.y - first.y) }
    }
    case 'rows': {
      const first = rowBounds(port, area.first.index)
      const last = rowBounds(port, area.last.index)
      if (first === undefined || last === undefined) return undefined
      const top = first.top + area.first.offset * first.height
      const bottom = last.top + area.last.offset * last.height
      const scale = area.viewportWidth === undefined || area.x + area.width <= port.clientWidth
        ? 1 : port.clientWidth / area.viewportWidth
      return { x: port.getBoundingClientRect().left - port.scrollLeft + area.x * scale, y: top,
        width: area.width * scale, height: Math.max(1, bottom - top) }
    }
    case 'scroll': {
      const bounds = port.getBoundingClientRect()
      return { ...area.rect, x: bounds.left + area.rect.x - port.scrollLeft, y: bounds.top + area.rect.y - port.scrollTop }
    }
  }
}
