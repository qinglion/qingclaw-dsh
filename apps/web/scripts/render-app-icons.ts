/**
 * Render the QingClaw Web application install icons from its favicon artwork.
 *
 * A browser installs a Web App only with a raster 192px and a 512px icon, masks
 * the icon it puts on the home screen, and has no manifest support for iOS,
 * which reads `apple-touch-icon` instead. This script rasterizes the committed
 * QingClaw favicon into the PNGs under `public/`. The maskable variant scales
 * only the two-tone artwork into the platform safe zone while the white tile
 * continues to fill the complete icon.
 *
 * The committed PNGs are the output; rerun
 * `pnpm --filter @deepseek-ai/dsh-web-frontend run render:app-icons` after the
 * favicon artwork changes.
 * @module render-app-icons
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertNever } from '@deepseek-ai/dsh-util-values'

/** Vector source shared by the browser favicon and installed Web application. */
export const TILE_SOURCE = fileURLToPath(new URL('../public/favicon.svg', import.meta.url))

/** Directory the generated PNGs are committed to. */
export const ICON_OUTPUT_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url))

/** Tile edge in favicon source units; every render density is expressed against it. */
const TILE_EDGE = 100

/** Tile centre in source units, the fixed point of the maskable scale. */
const TILE_CENTER = TILE_EDGE / 2

/** Density at which the source's own 1:1 scale renders. */
const SOURCE_DENSITY = 72

/** Samples per output pixel along each axis before reduction. */
const RENDER_SCALE = 4

/**
 * Fraction of a maskable icon retained by the artwork. The outer square's
 * stroked corners extend beyond the platform's guaranteed circle at full size;
 * this scale moves those corners inside it with an antialiasing margin.
 */
export const MASKABLE_ARTWORK_SCALE = 0.86

/** Radius a platform mask is guaranteed to show, as a fraction of the icon edge. */
export const MASKABLE_SAFE_RADIUS_RATIO = 0.4

/** Root element required by the icon source. */
const SOURCE_ROOT = /^<svg[^>]*>/u

/** The opaque tile background, which remains unscaled for every variant. */
const TILE_BACKGROUND = '<rect width="100" height="100" fill="#FFFFFF"/>'

/** The QingClaw foreground group; the maskable variant scales only this group. */
const TILE_ARTWORK_GROUP = '<g id="qingclaw-app-artwork">'

/** One committed install icon: the manifest or link member it serves and its edge in pixels. */
export interface AppIconVariant {
  /** File name inside `public/`. */
  readonly file: string
  /** Square edge in pixels. */
  readonly size: number
  /** Which rendering the platform receives. */
  readonly kind: 'tile' | 'maskable'
}

/**
 * Install icons the Web application ships. Chrome requires the 192px and 512px
 * raster pair to offer installation, prefers a maskable icon for the home
 * screen, and iOS reads the touch icon alone.
 */
export const APP_ICON_VARIANTS: readonly AppIconVariant[] = [
  { file: 'icon-192.png', size: 192, kind: 'tile' },
  { file: 'icon-512.png', size: 512, kind: 'tile' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'tile' },
]

/** A scale about the tile centre, so a masked crop stays symmetric. */
function aboutCenter(scale: number): string {
  return `translate(${String(TILE_CENTER)} ${String(TILE_CENTER)}) scale(${String(scale)})`
    + ` translate(${String(-TILE_CENTER)} ${String(-TILE_CENTER)})`
}

/** Validate and normalize the committed favicon source. */
function normalizedSource(source: string): string {
  const trimmed = source.trim()
  const root = SOURCE_ROOT.exec(trimmed)
  if (root === null) throw new Error('app icons: the tile source has no root element')
  if (!root[0].includes('viewBox="0 0 100 100"')) throw new Error('app icons: the tile source must use the 100-unit square view box')
  if (!trimmed.includes(TILE_BACKGROUND)) throw new Error('app icons: the tile source has no opaque background')
  if (!trimmed.includes(TILE_ARTWORK_GROUP)) throw new Error('app icons: the tile source has no artwork group')
  return trimmed
}

/**
 * Validate the favicon source used for ordinary install icons.
 * @param source - complete QingClaw favicon document.
 * @returns the normalized 100-unit-square SVG document.
 */
export function tileDocument(source: string): string {
  return normalizedSource(source)
}

/**
 * Rewrite the tile source into a maskable icon. The white background retains
 * the complete extent while only the QingClaw foreground enters the safe zone.
 * @param source - complete QingClaw favicon document.
 * @returns an SVG document whose artwork survives a circular mask whole.
 */
export function maskableDocument(source: string): string {
  const normalized = normalizedSource(source)
  return normalized.replace(
    TILE_ARTWORK_GROUP,
    `${TILE_ARTWORK_GROUP.slice(0, -1)} transform="${aboutCenter(MASKABLE_ARTWORK_SCALE)}">`,
  )
}

/**
 * Rasterize one rewritten document at a square edge.
 * @param document - output of {@link tileDocument} or {@link maskableDocument}.
 * @param size - square edge in pixels.
 * @returns the PNG bytes.
 */
async function renderPng(document: string, size: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const renderSize = Math.max(TILE_EDGE, size * RENDER_SCALE)
  // A separate raster preserves the source's filters at full resolution and
  // prevents SVG resize optimizations from bypassing the downsampling step.
  const raster = await sharp(Buffer.from(document), { density: SOURCE_DENSITY * renderSize / TILE_EDGE })
    .png()
    .toBuffer()
  return sharp(raster)
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer()
}

function documentForVariant(source: string, kind: AppIconVariant['kind']): string {
  switch (kind) {
    case 'tile': return tileDocument(source)
    case 'maskable': return maskableDocument(source)
    default: return assertNever(kind)
  }
}

/**
 * Render every install icon from the tile source.
 * @param source - complete QingClaw favicon document.
 * @returns one PNG per {@link APP_ICON_VARIANTS} entry, in declaration order.
 */
export async function renderAppIcons(source: string): Promise<readonly { variant: AppIconVariant; png: Buffer }[]> {
  return Promise.all(APP_ICON_VARIANTS.map(async variant => ({
    variant,
    png: await renderPng(
      documentForVariant(source, variant.kind),
      variant.size,
    ),
  })))
}

async function main(): Promise<void> {
  const icons = await renderAppIcons(await readFile(TILE_SOURCE, 'utf8'))
  await Promise.all(icons.map(async ({ variant, png }) => {
    await writeFile(resolve(ICON_OUTPUT_DIRECTORY, variant.file), png)
  }))
  console.info(`app icons: wrote ${icons.map(icon => icon.variant.file).join(', ')} to ${ICON_OUTPUT_DIRECTORY}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
