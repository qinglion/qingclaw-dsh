import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { QingClawMark } from '@deepseek-ai/dsh-client-ui-primitives'
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
  return <QingClawMark size={size} className={className} />
}

/**
 * Render the locale-owned QingClaw product name.
 * @param props - Framework-provided QingClaw locale seat.
 * @returns the active-locale brand name.
 */
export function QingClawBrandName({ t }: PropsLocale<typeof NS>) {
  return <span>{t('brandName')}</span>
}
