import { useEffect, useState } from 'react'

import { api } from './api'
import type {
  PlantHealthAnalysis,
  PlantHealthProviderName,
  PlantHealthProviders,
} from './types'

export function PlantHealthPanel({
  userId,
  fieldId,
  imageDataUrl,
  onAnalysisChange,
  onSuggestedText,
}: {
  userId: number
  fieldId: number
  imageDataUrl: string
  onAnalysisChange: (analysis: PlantHealthAnalysis | null) => void
  onSuggestedText: (text: string) => void
}) {
  const [providers, setProviders] = useState<PlantHealthProviders | null>(null)
  const [provider, setProvider] = useState<PlantHealthProviderName>('demo')
  const [analysis, setAnalysis] = useState<PlantHealthAnalysis | null>(null)
  const [correction, setCorrection] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.plantHealthProviders()
      .then((data) => {
        if (cancelled) return
        setProviders(data)
        const preferred = data.providers.find((item) => item.name === data.default && item.configured)
        const fallback = data.providers.find((item) => item.configured)
        if (preferred) setProvider(preferred.name)
        else if (fallback) setProvider(fallback.name)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось получить список ML-провайдеров')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setAnalysis(null)
    setCorrection('')
    setError('')
    onAnalysisChange(null)
  }, [fieldId, imageDataUrl, onAnalysisChange])

  async function analyze() {
    if (!imageDataUrl) return
    setBusy(true)
    setError('')
    try {
      const result = await api.analyzePlantHealth({
        user_id: userId,
        field_id: fieldId,
        image_data_url: imageDataUrl,
        provider,
      })
      setAnalysis(result)
      onAnalysisChange(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить анализ')
    } finally {
      setBusy(false)
    }
  }

  async function saveFeedback(verdict: 'accepted' | 'rejected' | 'corrected') {
    if (!analysis) return
    setBusy(true)
    setError('')
    try {
      const updated = await api.plantHealthFeedback(
        analysis.id,
        userId,
        verdict,
        verdict === 'corrected' ? correction.trim() : undefined,
      )
      setAnalysis(updated)
      onAnalysisChange(updated)
      if (updated.final_label) {
        onSuggestedText(`AI-подсказка: похоже на «${updated.final_label}». Кто-нибудь сталкивался с этим рядом?`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить обратную связь')
    } finally {
      setBusy(false)
    }
  }

  const top = analysis?.suggestions[0]

  return (
    <div className="feed-info-card">
      <strong>AI-анализ проблемы</strong>
      <p>
        Это предварительная визуальная подсказка, а не подтверждённый диагноз. Ваш ответ сохраняется как разметка для будущей собственной модели AgroConnect.
      </p>

      <label className="feed-field">
        <span>Провайдер</span>
        <select
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value as PlantHealthProviderName)
            setAnalysis(null)
            onAnalysisChange(null)
          }}
        >
          {(providers?.providers ?? []).map((item) => (
            <option key={item.name} value={item.name} disabled={!item.configured}>
              {item.label}{item.offline ? ' · offline' : ''}{!item.configured ? ' · не настроен' : ''}
            </option>
          ))}
        </select>
      </label>

      {!analysis && (
        <button type="button" className="primary-button full-width" disabled={busy || !imageDataUrl} onClick={() => void analyze()}>
          {busy ? 'Анализируем…' : 'Проанализировать фото'}
        </button>
      )}

      {top && analysis && (
        <div>
          <p><b>Похоже на: {top.label}</b> · {Math.round(top.confidence * 100)}%</p>
          {top.scientific_name && <small>{top.scientific_name}</small>}
          {top.description && <p>{top.description}</p>}
          {analysis.suggestions.length > 1 && (
            <div>
              <small>Другие варианты:</small>
              <ul>
                {analysis.suggestions.slice(1).map((item) => (
                  <li key={`${item.label}-${item.confidence}`}>{item.label} — {Math.round(item.confidence * 100)}%</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.feedback_status === 'pending' && (
            <>
              <div className="feed-form-grid">
                <button type="button" className="primary-button" disabled={busy} onClick={() => void saveFeedback('accepted')}>
                  Похоже
                </button>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveFeedback('rejected')}>
                  Не похоже
                </button>
              </div>
              <label className="feed-field">
                <span>Если знаете правильный вариант</span>
                <input value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="Например: альтернариоз" />
              </label>
              <button
                type="button"
                className="secondary-button full-width"
                disabled={busy || !correction.trim()}
                onClick={() => void saveFeedback('corrected')}
              >
                Сохранить исправление
              </button>
            </>
          )}

          {analysis.feedback_status === 'accepted' && <p>✓ Подсказка подтверждена. Фото и метка добавлены в обучающий датасет.</p>}
          {analysis.feedback_status === 'corrected' && <p>✓ Сохранена ваша метка: <b>{analysis.final_label}</b>.</p>}
          {analysis.feedback_status === 'rejected' && <p>Отметили как неверную гипотезу. Можно запустить анализ другим провайдером.</p>}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
