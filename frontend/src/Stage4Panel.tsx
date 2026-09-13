import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import './stage4.css'
import type { AgroField, PrivacyVariant, PublicField, User, VisitRequest } from './types'

type Props = {
  user: User
  fields: AgroField[]
  onFieldChanged: (field: AgroField) => void
}

const DEFAULT_VISIT_MESSAGE = 'Хочу посмотреть поле и обменяться опытом.'

export function Stage4Panel({ user, fields, onFieldChanged }: Props) {
  const [publicFields, setPublicFields] = useState<PublicField[]>([])
  const [incoming, setIncoming] = useState<VisitRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState('')

  const reload = useCallback(async () => {
    try {
      setError('')
      const [publicData, incomingData] = await Promise.all([
        api.publicFields(user.id),
        api.incomingVisitRequests(user.id),
      ])
      setPublicFields(publicData.filter((field) => field.owner_id !== user.id))
      setIncoming(incomingData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки приватности')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  const pendingIncoming = useMemo(
    () => incoming.filter((request) => request.status === 'pending'),
    [incoming],
  )

  const privacySetting: PrivacyVariant = fields.length > 0 && fields.every((field) => field.privacy_variant === 'B') ? 'B' : 'A'

  async function changePrivacyForAll(variant: PrivacyVariant) {
    setBusyKey('privacy-all')
    setError('')
    try {
      const updated = await Promise.all(fields.map((field) => api.updateFieldPrivacy(field.id, user.id, variant)))
      updated.forEach(onFieldChanged)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить приватность')
    } finally {
      setBusyKey('')
    }
  }

  async function requestVisit(field: PublicField) {
    const key = `visit-${field.id}`
    setBusyKey(key)
    setError('')
    try {
      await api.requestVisit(field.id, user.id, DEFAULT_VISIT_MESSAGE)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить запрос')
    } finally {
      setBusyKey('')
    }
  }

  async function answerRequest(request: VisitRequest, status: 'approved' | 'declined') {
    const key = `answer-${request.id}`
    setBusyKey(key)
    setError('')
    try {
      await api.updateVisitRequest(request.id, user.id, status)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось ответить на запрос')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <section className="stage4-panel">
      <div className="stage4-heading user-privacy-heading">
        <div>
          <h2>Приватность полей</h2>
          <p>Вы решаете, сколько информации о хозяйстве видно другим пользователям.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stage4-block privacy-global-card">
        <div className="stage4-block-title">
          <div>
            <h3>Кто видит мои поля</h3>
            <p><strong>Открыто</strong> — соседи видят культуру, площадь и расположение поля. <strong>По запросу</strong> — до вашего разрешения показывается только примерная зона.</p>
          </div>
        </div>
        <div className="privacy-switch privacy-switch-global" role="group" aria-label="Приватность всех моих полей">
          <button
            type="button"
            className={privacySetting === 'A' ? 'active' : ''}
            disabled={busyKey === 'privacy-all' || fields.length === 0}
            onClick={() => void changePrivacyForAll('A')}
          >
            Открыто
          </button>
          <button
            type="button"
            className={privacySetting === 'B' ? 'active' : ''}
            disabled={busyKey === 'privacy-all' || fields.length === 0}
            onClick={() => void changePrivacyForAll('B')}
          >
            По запросу
          </button>
        </div>
        {fields.length === 0 && <small className="muted">Добавьте поле, чтобы настроить его видимость.</small>}
      </div>

      <div className="stage4-block">
        <div className="stage4-block-title">
          <div><h3>Запросы на доступ к моим полям</h3></div>
          {pendingIncoming.length > 0 && <span className="request-counter">{pendingIncoming.length}</span>}
        </div>
        {pendingIncoming.length === 0 ? (
          <div className="stage4-empty compact-empty">Новых запросов нет.</div>
        ) : (
          <div className="request-list">
            {pendingIncoming.map((request) => (
              <article className="request-card" key={request.id}>
                <div>
                  <strong>{request.requester_name}</strong>
                  <span>@{request.requester_username} хочет получить доступ к «{request.field_name}»</span>
                  {request.message && <p>{request.message}</p>}
                </div>
                <div className="request-actions">
                  <button
                    type="button"
                    className="primary-button compact-button"
                    disabled={busyKey === `answer-${request.id}`}
                    onClick={() => void answerRequest(request, 'approved')}
                  >
                    Разрешить
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    disabled={busyKey === `answer-${request.id}`}
                    onClick={() => void answerRequest(request, 'declined')}
                  >
                    Отклонить
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="stage4-block">
        <div className="stage4-block-title"><div><h3>Поля других хозяйств</h3></div></div>

        {loading ? <p>Загрузка полей соседей…</p> : publicFields.length === 0 ? (
          <div className="stage4-empty">Пока нет полей других хозяйств.</div>
        ) : (
          <div className="neighbor-fields">
            {publicFields.map((field) => (
              <PublicFieldCard
                key={field.id}
                field={field}
                busy={busyKey === `visit-${field.id}`}
                onRequest={() => void requestVisit(field)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PublicFieldCard({ field, busy, onRequest }: { field: PublicField; busy: boolean; onRequest: () => void }) {
  const status = field.visit_request_status
  const title = field.details_visible ? field.name : 'Поле хозяйства'

  return (
    <article className={`neighbor-field-card ${field.details_visible ? 'is-open' : 'is-private'}`}>
      <div className="neighbor-field-head">
        <div>
          <h4>{title}</h4>
          <p>{field.owner_name} · @{field.owner_username} · {field.owner_region}</p>
        </div>
      </div>

      {field.details_visible ? (
        <div className="field-detail-grid">
          <span><small>Культура</small><strong>{field.crop || 'Не указана'}</strong></span>
          <span><small>Площадь</small><strong>{field.area_ha ? `${field.area_ha} га` : 'Не указана'}</strong></span>
          <span className="wide"><small>Расположение</small><strong>{field.latitude?.toFixed(4)}, {field.longitude?.toFixed(4)}</strong></span>
        </div>
      ) : (
        <div className="locked-field">
          <strong>Точные данные поля скрыты</strong>
          <p>Видна только примерная зона: {field.approximate_latitude.toFixed(1)}, {field.approximate_longitude.toFixed(1)}.</p>
        </div>
      )}

      {!field.details_visible && (
        <div className="visit-request-row">
          {status === null && (
            <button type="button" className="primary-button" disabled={busy} onClick={onRequest}>
              {busy ? 'Отправляем…' : 'Попросить доступ'}
            </button>
          )}
          {status === 'pending' && <span className="request-status pending">Ожидает подтверждения</span>}
          {status === 'declined' && <span className="request-status declined">Доступ не открыт</span>}
        </div>
      )}

      {status === 'approved' && field.details_visible && <span className="request-status approved">Доступ открыт</span>}
    </article>
  )
}
