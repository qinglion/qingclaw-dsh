import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'

/** Presentation accepted by both QingClaw mark slots. */
export interface QingClawBrandMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the layered QingClaw mark derived from the Qinglion product family.
 * @param props - Host-supplied mark presentation.
 * @returns the decorative QingClaw lion mark.
 */
export function QingClawBrandMark({ size, className }: QingClawBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <g transform="translate(18 7) scale(.84)">
        <g transform="translate(25.4 5) scale(2.39)" fill="#48707A">
          <path d="M290.107 50.116a18.292 18.292 0 0 0 0 36.582h2.47V72.716a4.309 4.309 0 0 1 0-8.618V50.116Z" transform="translate(-272.027 -49.103)" />
          <path d="M282.627 97.034a10.16 10.16 0 0 0-10.146 10.029h20.293a10.16 10.16 0 0 0-10.147-10.029Z" transform="translate(-272.205 -69.409)" />
        </g>
      </g>
      <g transform="translate(-5 0)">
        <g transform="translate(25.4 5) scale(2.39)" fill="#4BB6B0">
          <path d="M290.107 50.116a18.292 18.292 0 0 0 0 36.582h2.47V72.716a4.309 4.309 0 0 1 0-8.618V50.116Z" transform="translate(-272.027 -49.103)" />
          <path d="M282.627 97.034a10.16 10.16 0 0 0-10.146 10.029h20.293a10.16 10.16 0 0 0-10.147-10.029Z" transform="translate(-272.205 -69.409)" />
        </g>
        <g transform="translate(25.4 5) scale(2.39)" fill="#48707A">
          <path d="M290.3 109.044h1.211a18.286 18.286 0 0 1-14.479-7.4 10.232 10.232 0 0 0-1.81 2.169 27.689 27.689 0 0 0 15.078 5.231Z" transform="translate(-273.396 -71.409)" />
        </g>
      </g>
    </svg>
  )
}

/**
 * Render the locale-owned QingClaw product name.
 * @param props - Framework-provided QingClaw locale seat.
 * @returns the active-locale brand name.
 */
export function QingClawBrandName({ t }: PropsLocale<typeof NS>) {
  return <span>{t('brandName')}</span>
}
