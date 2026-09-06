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
  const [outgoing, setOutgoing] = useState<VisitRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyKey, setBusyKey] = useState('')

  const reload = useCallback(async () => {
    try {
      setError('')
      const [publicData, incomingData, outgoingData] = await Promise.all([
        api.publicFields(user.id),
        api.incomingVisitRequests(user.id),
        api.outgoingVisitRequests(user.id),
      ])
      setPublicFields(publicData.filter((field) => field.owner_id !== user.id))
      setIncoming(incomingData)
      setOutgoing(outgoingData)
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

  async function changePrivacy(field: AgroField, variant: PrivacyVariant) {
    const key = `privacy-${field.id}`
    setBusyKey(key)
    setError('')
    try {
      const updated = await api.updateFieldPrivacy(field.id, user.id, variant)
      onFieldChanged(updated)
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
      <div className="stage4-heading">
        <div>
          <span className="stage4-kicker">Этап 4 · A/B-гипотеза</span>
          <h2>Приватность полей и «Попроситься в гости»</h2>
          <p>
            Вариант A показывает точные данные поля. Вариант B оставляет только примерную географию,
            а детали открываются после одобрения владельца.
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stage4-block">
        <div className="stage4-block-title">
          <div>
            <h3>Как видны мои поля</h3>
            <p>Переключатель оставлен прямо в MVP, чтобы демонстрировать обе продуктовые гипотезы.</p>
          </div>
        </div>
        <div className="privacy-list">
          {fields.map((field) => (
            <article className="privacy-card" key={field.id}>
              <div className="privacy-card-copy">
                <strong>{field.name}</strong>
                <span>{field.crop} · {field.area_ha ? `${field.area_ha} га` : 'площадь не указана'}</span>
              </div>
              <div className="privacy-switch" role="group" aria-label={`Приватность поля ${field.name}`}>
                <button
                  type="button"
                  className={field.privacy_variant === 'A' ? 'active' : ''}
                  disabled={busyKey === `privacy-${field.id}`}
                  onClick={() => void changePrivacy(field, 'A')}
                >
                  A · открыто
                </button>
                <button
                  type="button"
                  className={field.privacy_variant === 'B' ? 'active' : ''}
                  disabled={busyKey === `privacy-${field.id}`}
                  onClick={() => void changePrivacy(field, 'B')}
                >
                  B · по запросу
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="stage4-block">
        <div className="stage4-block-title">
          <div>
            <h3>Запросы ко мне</h3>
            <p>Владелец поля сам решает, раскрывать ли точные данные соседу.</p>
          </div>
          {pendingIncoming.length > 0 && <span className="request-counter">{pendingIncoming.length}</span>}
        </div>
        {pendingIncoming.length === 0 ? (
          <div className="stage4-empty">Новых запросов пока нет.</div>
        ) : (
          <div className="request-list">
            {pendingIncoming.map((request) => (
              <article className="request-card" key={request.id}>
                <div>
                  <strong>{request.requester_name}</strong>
                  <span>@{request.requester_username} просится на «{request.field_name}»</span>
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
        <div className="stage4-block-title">
          <div>
            <h3>Поля других хозяйств</h3>
            <p>Так выглядит один и тот же каталог для соседа при разных настройках приватности.</p>
          </div>
        </div>

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

        {outgoing.length > 0 && (
          <div className="outgoing-summary">
            <strong>Мои запросы</strong>
            {outgoing.map((request) => (
              <span key={request.id}>
                «{request.field_name}» · {statusLabel(request.status)}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PublicFieldCard({
  field,
  busy,
  onRequest,
}: {
  field: PublicField
  busy: boolean
  onRequest: () => void
}) {
  const status = field.visit_request_status
  const title = field.details_visible ? field.name : 'Поле хозяйства'

  return (
    <article className={`neighbor-field-card variant-${field.privacy_variant.toLowerCase()}`}>
      <div className="neighbor-field-head">
        <div>
          <span className="variant-badge">Вариант {field.privacy_variant}</span>
          <h4>{title}</h4>
          <p>{field.owner_name} · @{field.owner_username} · {field.owner_region}</p>
        </div>
      </div>

      {field.details_visible ? (
        <div className="field-detail-grid">
          <span><small>Культура</small><strong>{field.crop || 'Не указана'}</strong></span>
          <span><small>Площадь</small><strong>{field.area_ha ? `${field.area_ha} га` : 'Не указана'}</strong></span>
          <span className="wide"><small>Севооборот</small><strong>{field.rotation || 'Не указан'}</strong></span>
          <span className="wide"><small>Точная точка</small><strong>{field.latitude?.toFixed(4)}, {field.longitude?.toFixed(4)}</strong></span>
        </div>
      ) : (
        <div className="locked-field">
          <strong>Точные данные поля скрыты</strong>
          <p>
            Видна только примерная зона: {field.approximate_latitude.toFixed(1)}, {field.approximate_longitude.toFixed(1)}.
          </p>
        </div>
      )}

      {field.privacy_variant === 'B' && !field.details_visible && (
        <div className="visit-request-row">
          {status === null && (
            <button type="button" className="primary-button" disabled={busy} onClick={onRequest}>
              {busy ? 'Отправляем…' : 'Попроситься в гости'}
            </button>
          )}
          {status === 'pending' && <span className="request-status pending">Запрос отправлен</span>}
          {status === 'declined' && <span className="request-status declined">Владелец отказал</span>}
        </div>
      )}

      {status === 'approved' && field.details_visible && (
        <span className="request-status approved">Доступ открыт владельцем</span>
      )}
    </article>
  )
}

function statusLabel(status: VisitRequest['status']) {
  if (status === 'approved') return 'доступ открыт'
  if (status === 'declined') return 'отказано'
  return 'ожидает ответа'
}
