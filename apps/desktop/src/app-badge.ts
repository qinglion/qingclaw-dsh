/** Native application badge: the icon counter for Sessions whose finished turn is still unread. */
import { app } from 'electron'

/** Counts above this render as `99+`; longer Dock badge text is unreadable and truncated. */
const BADGE_COUNT_MAX = 99

/**
 * Owns the application icon badge. macOS draws it on the Dock icon and Linux launchers draw it on their
 * launcher entry; Windows exposes no counter badge, so the shell draws none there.
 */
export class DesktopAppBadge {
  private applied: number | undefined

  /** @param platform - native badge platform, replaceable for platform tests. */
  constructor(private readonly platform: string = process.platform) {}

  /**
   * Show the number of Sessions whose finished turn is still unread.
   * @param count - non-negative number of unread completions; 0 removes the badge.
   */
  set(count: number): void {
    if (this.applied === count) return
    this.applied = count
    try {
      if (this.platform === 'darwin') app.dock?.setBadge(count === 0 ? ''
        : count > BADGE_COUNT_MAX ? `${BADGE_COUNT_MAX}+` : String(count))
      else if (this.platform === 'linux') app.setBadgeCount(count)
    } catch (error) {
      // A missing Dock or launcher entry must not fail the page that reported the reminder.
      console.warn('desktop badge: native badge unavailable', error)
    }
  }

  /** Remove the badge. */
  clear(): void { this.set(0) }
}
