/** Draw saved capture frames in a shared layer over the document scrollport. */

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { measureCaptureArea, type DocumentCaptureLocation } from './capture-location.ts'
import type { DocumentCaptureTarget } from './contract.ts'
import css from '../TextPreview.module.css'

/** A preview outline and its optional action. */
export interface PreviewCaptureFrame {
  readonly location: DocumentCaptureLocation
  readonly target?: DocumentCaptureTarget
}

interface CaptureMarkerProps {
  readonly frames: readonly PreviewCaptureFrame[]
  readonly activeKey: string | undefined
  readonly revision: number
  readonly reveal: boolean
  readonly hidden: boolean
  readonly bodyRef: { readonly current: HTMLElement | null }
  readonly scrollportRef: { readonly current: HTMLElement | null }
  readonly readMore: (() => void) | undefined
  readonly renderAction: (target: DocumentCaptureTarget) => ReactNode
}

function scrollDelta(start: number, size: number, min: number, available: number): number {
  if (start < min || size > available) return start - min
  return Math.max(0, start + size - min - available)
}

function edgeVisible(start: number, end: number, size: number): boolean {
  return (start >= 0 && start < size) || (end > 0 && end <= size)
}

/** @param target - the capture's optional action. @returns the stable key for its outline. */
export function captureKey(target: DocumentCaptureTarget | undefined): string {
  return target === undefined ? '' : `${target.key}:${target.id}`
}

/**
 * Keep all frames aligned to the rendered content and reveal a requested capture once.
 * @param props - saved regions, current preview, and pending-page loader.
 * @returns the frames clipped to the renderer's scrollport.
 */
export function CaptureMarkers({
  frames, activeKey, revision, reveal, hidden, bodyRef, scrollportRef, readMore, renderAction,
}: CaptureMarkerProps): ReactNode {
  const viewport = useRef<HTMLDivElement>(null)
  const revealed = useRef<number>()

  useLayoutEffect(() => {
    const body = bodyRef.current
    const container = body?.parentElement
    const overlay = viewport.current
    if (body === null || container == null || overlay === null) return
    const outlines = overlay.querySelectorAll<HTMLElement>('[data-document-capture-frame]')
    const requested = reveal && activeKey !== undefined ? frames.find(frame => captureKey(frame.target) === activeKey) : undefined
    let pendingFrame: number | undefined
    const measure = (): void => {
      pendingFrame = undefined
      const port = scrollportRef.current
      if (port === null || port.clientWidth === 0 || port.clientHeight === 0) {
        outlines.forEach((outline) => { outline.removeAttribute('data-capture-ready') })
        return
      }
      const clip = port.getBoundingClientRect()
      const width = port.clientWidth
      const height = port.clientHeight
      if (requested !== undefined && revealed.current !== revision) {
        const area = measureCaptureArea(port, requested.location.area)
        if (area !== undefined) {
          revealed.current = revision
          port.scrollLeft += scrollDelta(area.x, area.width, clip.left, width)
          port.scrollTop += scrollDelta(area.y, area.height, clip.top, height)
        } else if (requested.location.area.kind === 'rows') readMore?.()
      }
      const outer = container.getBoundingClientRect()
      const rectangles = frames.map(frame => measureCaptureArea(port, frame.location.area))
      overlay.style.inset = `${clip.top - outer.top}px auto auto ${clip.left - outer.left}px`
      overlay.style.width = `${width}px`
      overlay.style.height = `${height}px`
      outlines.forEach((outline, index) => {
        const area = rectangles[index]
        if (area === undefined) {
          outline.removeAttribute('data-capture-ready')
          return
        }
        const x = area.x - clip.left
        const y = area.y - clip.top
        const right = x + area.width
        const bottom = y + area.height
        const visible = (x < width && right > 0 && edgeVisible(y, bottom, height))
          || (y < height && bottom > 0 && edgeVisible(x, right, width))
        outline.toggleAttribute('data-capture-ready', visible)
        if (!visible) return
        outline.style.inset = `${y}px auto auto ${x}px`
        outline.style.width = `${area.width}px`
        outline.style.height = `${area.height}px`
      })
    }
    const schedule = (): void => { pendingFrame ??= requestAnimationFrame(measure) }
    const mutations = new MutationObserver(schedule)
    mutations.observe(body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'hidden', 'data-textpreview-wrap'] })
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    resize?.observe(body)
    const port = scrollportRef.current
    if (port !== null && port !== body) resize?.observe(port)
    body.addEventListener('scroll', schedule, true)
    body.addEventListener('load', schedule, true)
    schedule()
    return () => {
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
      mutations.disconnect()
      resize?.disconnect()
      body.removeEventListener('scroll', schedule, true)
      body.removeEventListener('load', schedule, true)
    }
  }, [bodyRef, scrollportRef, frames, activeKey, revision, reveal, readMore])

  return <div ref={viewport} className={css.captureViewport} data-document-capture-frames data-capture-suppressed={hidden || undefined}>
    {frames.map(({ target }) => {
      const key = captureKey(target)
      return <div key={key} className={css.captureFrame} data-document-capture-frame
        data-document-capture-active={key === activeKey || undefined}>
        {target === undefined ? undefined : renderAction(target)}
      </div>
    })}
  </div>
}
