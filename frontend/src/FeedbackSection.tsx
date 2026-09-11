import { FormEvent, useEffect, useState } from 'react'

import { api } from './api'
import type { FeedbackCreate, UserFeedback } from './types'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.8.0'

const diaryOptions: Array<{ value: FeedbackCreate['field_diary_intent']; label: string }> = [
  { value: 'yes', label: 'Да' },
  { value: 'probably_yes', label: 'Скорее да' },
  { value: 'probably_no', label: 'Скорее нет' },
  { value: 'no', label: 'Нет' },
]

const featureOptions: Array<{ value: FeedbackCreate['most_valuable_feature']; label: string }> = [
  { value: 'local_events', label: 'События рядом' },
  { value: 'field_history', label: 'История полей' },
  { value: 'alerts', label: 'Предупреждения' },
  { value: 'neighbors', label: 'Общение с соседями' },
  { value: 'plant_analysis', label: 'Анализ растений' },
]

function emptyForm(): FeedbackCreate {
  return {
    rating: 5,
    liked_text: '',
    improvement_text: '',
    local_network_score: 5,
    field_diary_intent: 'probably_yes',
    alerts_score: 5,
    privacy_comfort_score: 4,
    most_valuable_feature: 'local_events',
    app_version: APP_VERSION,
  }
}

function toForm(item: UserFeedback): FeedbackCreate {
  return {
    rating: item.rating,
    liked_text: item.liked_text,
    improvement_text: item.improvement_text,
    local_network_score: item.local_network_score,
    field_diary_intent: item.field_diary_intent,
    alerts_score: item.alerts_score,
    privacy_comfort_score: item.privacy_comfort_score,
    most_valuable_feature: item.most_valuable_feature,
    app_version: APP_VERSION,
  }
}

export function FeedbackSection({ userId }: { userId: number }) {
  const [latest, setLatest] = useState<UserFeedback | null>(null)
  const [form, setForm] = useState<FeedbackCreate>(emptyForm)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.latestFeedback(userId)
      .then((item) => {
        if (cancelled) return
        setLatest(item)
        setForm(item ? toForm(item) : emptyForm())
      })
      .catch(() => {
        if (!cancelled) setLatest(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  async function startFeedback() {
    setMessage('')
    setForm(latest ? toForm(latest) : emptyForm())
    setOpen(true)
    try { await api.feedbackOpened(userId) } catch { /* analytics is best-effort */ }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const item = await api.submitFeedback(userId, form)
      setLatest(item)
      setForm(toForm(item))
      setOpen(false)
      setMessage('Спасибо. Обратная связь сохранена.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить обратную связь')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="feedback-card">
      <div className="feedback-card-head">
        <div>
          <h2>Ваше впечатление</h2>
          <p>Помогите понять, какие сценарии AgroConnect действительно полезны в работе.</p>
        </div>
        {latest && <div className="feedback-current-rating" aria-label={`Оценка ${latest.rating} из 5`}>{sunflowers(latest.rating)}</div>}
      </div>

      {loading ? (
        <p className="muted">Загружаем вашу оценку…</p>
      ) : latest ? (
        <>
          <div className="feedback-latest-row">
            <span>Последняя оценка</span>
            <strong>{latest.rating} / 5</strong>
            <small>{new Date(latest.created_at).toLocaleDateString('ru-RU')}</small>
          </div>
          {!open && <button type="button" className="secondary-button feedback-open-button" onClick={startFeedback}>Поделиться новым впечатлением</button>}
        </>
      ) : (
        !open && <button type="button" className="primary-button feedback-open-button" onClick={startFeedback}>🌻 Оценить AgroConnect</button>
      )}

      {open && (
        <form className="feedback-form" onSubmit={submit}>
          <ScoreQuestion
            label="Общая оценка AgroConnect"
            value={form.rating}
            onChange={(rating) => setForm({ ...form, rating })}
            sunflower
          />

          <label className="form-field">
            <span>Что понравилось?</span>
            <textarea rows={3} value={form.liked_text} onChange={(e) => setForm({ ...form, liked_text: e.target.value })} placeholder="Можно кратко" />
          </label>

          <label className="form-field">
            <span>Что можно улучшить?</span>
            <textarea rows={3} value={form.improvement_text} onChange={(e) => setForm({ ...form, improvement_text: e.target.value })} placeholder="Что мешает или чего не хватает" />
          </label>

          <div className="feedback-hypotheses">
            <h3>Несколько коротких вопросов</h3>
            <ScoreQuestion
              label="Насколько полезно видеть события и проблемы хозяйств рядом?"
              value={form.local_network_score}
              onChange={(value) => setForm({ ...form, local_network_score: value })}
            />

            <fieldset className="feedback-choice-group">
              <legend>Стали бы вы вести здесь историю своих полей и культур?</legend>
              <div className="feedback-choice-row">
                {diaryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={form.field_diary_intent === option.value ? 'selected' : ''}
                    onClick={() => setForm({ ...form, field_diary_intent: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <ScoreQuestion
              label="Насколько полезны предупреждения о погоде, заболеваниях и обработках поблизости?"
              value={form.alerts_score}
              onChange={(value) => setForm({ ...form, alerts_score: value })}
            />

            <ScoreQuestion
              label="Насколько комфортно указывать реальные границы и данные полей, если доступ можно ограничить?"
              value={form.privacy_comfort_score}
              onChange={(value) => setForm({ ...form, privacy_comfort_score: value })}
            />

            <label className="form-field">
              <span>Что для вас самое ценное?</span>
              <select value={form.most_valuable_feature} onChange={(e) => setForm({ ...form, most_valuable_feature: e.target.value as FeedbackCreate['most_valuable_feature'] })}>
                {featureOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="feedback-form-actions">
            <button type="button" className="secondary-button" onClick={() => setOpen(false)} disabled={saving}>Отмена</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Отправляем…' : 'Отправить'}</button>
          </div>
        </form>
      )}

      {message && <p className="form-message">{message}</p>}
    </section>
  )
}

function ScoreQuestion({ label, value, onChange, sunflower = false }: { label: string; value: number; onChange: (value: number) => void; sunflower?: boolean }) {
  return (
    <fieldset className="feedback-score-question">
      <legend>{label}</legend>
      <div className="feedback-score-row">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={value === score ? 'selected' : ''}
            aria-label={`${score} из 5`}
            onClick={() => onChange(score)}
          >
            {sunflower ? '🌻' : score}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function sunflowers(rating: number) {
  return `${'🌻'.repeat(rating)}${'○'.repeat(Math.max(0, 5 - rating))}`
}
