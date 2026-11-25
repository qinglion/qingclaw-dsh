import type { ReactNode } from 'react'
import { IconCheckCircleOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CreatorCenter.module.css'

/**
 * One inline result the page shows after an action or a failed read: a tone,
 * a short title, and the detail the website or the filesystem supplied.
 */
export function CreatorNotice({ tone, title, children }: {
  tone: 'error' | 'success'
  title: string
  children?: ReactNode
}): ReactNode {
  const Icon = tone === 'error' ? IconWarningTriangleOutlineRegular : IconCheckCircleOutlineRegular
  const className = [css.notice, tone === 'error' ? css.noticeError : css.noticeSuccess].join(' ').trim()
  return <div className={className} role={tone === 'error' ? 'alert' : 'status'}>
    <span className={css.noticeIcon} aria-hidden="true"><Icon size={16} /></span>
    <span className={css.noticeBody}>
      <span className={css.noticeTitle}>{title}</span>
      {children !== undefined && <span className={css.noticeText}>{children}</span>}
    </span>
  </div>
}
