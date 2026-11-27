/** The layered QingClaw product mark: one offset teal disc over the slate pinion and foot. */
import clsx from 'clsx'
import css from './QingClawMark.module.css'

/** Square side of {@link QingClawMark}'s viewBox in user units. */
export const QINGCLAW_MARK_VIEWBOX = 100

/** Brand inks of the mark; the artwork keeps them at any size instead of following theme tokens. */
const SLATE = '#48707A'
const TEAL = '#4BB6B0'

/** QingClaw brand inks, for artwork that draws a QingClaw element outside the shared mark. */
export const QINGCLAW_MARK_INK = Object.freeze({ slate: SLATE, teal: TEAL })

/** Presentation accepted by {@link QingClawMark}. */
export interface QingClawMarkProps {
  /** Square edge in px; omission fills the caller's box. */
  readonly size?: number
  /** Caller-owned placement class. */
  readonly className?: string | undefined
  /** Breathe the mark while the caller reports activity; still under reduced motion. */
  readonly animated?: boolean
}

/**
 * Render the decorative QingClaw mark for a brand slot or an activity row.
 * @param props - Requested square edge, caller placement class, and activity state.
 * @returns the two-layer mark svg; aria-hidden, so the caller supplies the status or brand text.
 */
export function QingClawMark({ size, className, animated = false }: QingClawMarkProps) {
  const edge = size === undefined ? '100%' : size
  return (
    <svg
      width={edge}
      height={edge}
      className={className}
      viewBox={`0 0 ${QINGCLAW_MARK_VIEWBOX} ${QINGCLAW_MARK_VIEWBOX}`}
      aria-hidden="true"
      focusable="false"
    >
      <g className={clsx(animated && css.breath)}>
        <g className={clsx(animated && css.notch)}>
          <g transform="translate(18 7) scale(.84)">
            <g transform="translate(25.4 5) scale(2.39)" fill={SLATE}>
              <path d="M290.107 50.116a18.292 18.292 0 0 0 0 36.582h2.47V72.716a4.309 4.309 0 0 1 0-8.618V50.116Z" transform="translate(-272.027 -49.103)" />
              <path d="M282.627 97.034a10.16 10.16 0 0 0-10.146 10.029h20.293a10.16 10.16 0 0 0-10.147-10.029Z" transform="translate(-272.205 -69.409)" />
            </g>
          </g>
        </g>
        <g transform="translate(-5 0)">
          <g transform="translate(25.4 5) scale(2.39)" fill={TEAL}>
            <path d="M290.107 50.116a18.292 18.292 0 0 0 0 36.582h2.47V72.716a4.309 4.309 0 0 1 0-8.618V50.116Z" transform="translate(-272.027 -49.103)" />
            <path d="M282.627 97.034a10.16 10.16 0 0 0-10.146 10.029h20.293a10.16 10.16 0 0 0-10.147-10.029Z" transform="translate(-272.205 -69.409)" />
          </g>
          <g transform="translate(25.4 5) scale(2.39)" fill={SLATE}>
            <path d="M290.3 109.044h1.211a18.286 18.286 0 0 1-14.479-7.4 10.232 10.232 0 0 0-1.81 2.169 27.689 27.689 0 0 0 15.078 5.231Z" transform="translate(-273.396 -71.409)" />
          </g>
        </g>
      </g>
    </svg>
  )
}
