/** Decorative product mark for the running Chat status. */
import { QingClawMark } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/**
 * Render the running mark inside its fixed icon footprint.
 * @returns the decorative mark; the running text and its hidden status announce the state.
 */
export function RunningMark() {
  return (
    <span className={css.runningIcon} aria-hidden="true">
      <QingClawMark className={css.runningMark} animated />
    </span>
  )
}
