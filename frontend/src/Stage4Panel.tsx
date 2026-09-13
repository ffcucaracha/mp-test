import { useState } from 'react'

import { api } from './api'
import './stage4.css'
import type { AgroField, PrivacyVariant, User } from './types'

type Props = { user: User; fields: AgroField[]; onFieldChanged: (field: AgroField) => void }

export function Stage4Panel({ user, fields, onFieldChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const privacySetting: PrivacyVariant = fields.length > 0 && fields.every((field) => field.privacy_variant === 'B') ? 'B' : 'A'

  async function changePrivacyForAll(variant: PrivacyVariant) {
    setBusy(true)
    setError('')
    try {
      const updated = await Promise.all(fields.map((field) => api.updateFieldPrivacy(field.id, user.id, variant)))
      updated.forEach(onFieldChanged)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить приватность')
    } finally {
      setBusy(false)
    }
  }

  return <section className="stage4-panel">
    <div className="stage4-heading user-privacy-heading"><div><h2>Приватность полей</h2><p>Открытые поля видны всем, а точные данные полей «по запросу» открываются соседу сразу для всего хозяйства.</p></div></div>
    {error && <div className="error-banner">{error}</div>}
    <div className="stage4-block privacy-global-card"><div className="stage4-block-title"><div><h3>Кто видит мои поля</h3><p><strong>Открыто</strong> — видны культура, площадь и расположение. <strong>По запросу</strong> — сосед получает доступ одним решением ко всем полям хозяйства.</p></div></div><div className="privacy-switch privacy-switch-global" role="group" aria-label="Приватность всех моих полей"><button type="button" className={privacySetting === 'A' ? 'active' : ''} disabled={busy || fields.length === 0} onClick={() => void changePrivacyForAll('A')}>Открыто</button><button type="button" className={privacySetting === 'B' ? 'active' : ''} disabled={busy || fields.length === 0} onClick={() => void changePrivacyForAll('B')}>По запросу</button></div>{fields.length === 0 && <small className="muted">Добавьте поле, чтобы настроить его видимость.</small>}</div>
  </section>
}
