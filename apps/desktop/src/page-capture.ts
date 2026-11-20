/** Capture one viewport region of the owning application window. */

import type { BrowserWindow, Rectangle } from 'electron'

/**
 * Capture a renderer-selected region, restricted to the content viewport.
 * @param window - application window that owns the requesting frame.
 * @param input - viewport rectangle sent by the trusted preload.
 * @returns PNG bytes, or rejects when the selection is outside the page or capture fails.
 */
export async function capturePageRegion(window: BrowserWindow, input: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const { webContents } = window
  const [width = 0, height = 0] = window.getContentSize()
  const rect = captureRectangle(input, webContents.getZoomFactor(), width, height)
  if (rect === undefined) throw new Error('dsh desktop: invalid page capture region')
  const image = await webContents.capturePage(rect, { stayHidden: true })
  if (image.isEmpty()) throw new Error('dsh desktop: no pixels returned for page capture')
  return new Uint8Array(image.toPNG())
}

function captureRectangle(input: unknown, zoom: number, viewportWidth: number, viewportHeight: number): Rectangle | undefined {
  if (input === null || typeof input !== 'object'
    || !('x' in input) || !('y' in input) || !('width' in input) || !('height' in input)) return
  const { x, y, width, height } = input
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number'
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)
    || x < 0 || y < 0 || width <= 0 || height <= 0) return

  const left = Math.floor(x * zoom)
  const top = Math.floor(y * zoom)
  const roundedRight = Math.ceil((x + width) * zoom)
  const roundedBottom = Math.ceil((y + height) * zoom)
  // A fractional page zoom can round a viewport edge up by one DIP.
  if (roundedRight > viewportWidth + 1 || roundedBottom > viewportHeight + 1) return
  const right = Math.min(roundedRight, viewportWidth)
  const bottom = Math.min(roundedBottom, viewportHeight)
  if (right <= left || bottom <= top) return
  return { x: left, y: top, width: right - left, height: bottom - top }
}
