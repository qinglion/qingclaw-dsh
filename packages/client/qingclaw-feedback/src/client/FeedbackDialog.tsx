/** Feedback dialog showing the founder's WeChat QR code. */
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeedbackKey } from './locales.ts'
import qrCode from './assets/feedback-qrcode.webp'
import css from './FeedbackDialog.module.css'

/**
 * @param props - localized copy and the caller's close command.
 * @returns the feedback dialog; its owner decides when it is mounted.
 */
export function FeedbackDialog({ close, t }: { close: () => void; t: (key: FeedbackKey) => string }) {
  return <Modal open title={t('entry')} closeLabel={t('close')} onClose={close}>
    <div className={css.body}>
      <img className={css.qrCode} src={qrCode} alt={t('qrAlt')} draggable={false} />
      <p className={css.hint}>{t('description')}</p>
    </div>
  </Modal>
}
