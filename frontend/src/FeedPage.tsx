import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { api } from './api'
import './feed.css'
import { MonetizationExperiment } from './MonetizationExperiment'
import { enqueueMutation } from './offline'
import { PlantHealthPanel } from './PlantHealthPanel'
import type { AgroField, FeedComment, FeedPost, PlantHealthAnalysis, PostCreate, PostStatus, User } from './types'

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'sowing', label: 'Посев' },
  { value: 'sprouts', label: 'Всходы' },
  { value: 'flowering', label: 'Цветение' },
  { value: 'problem', label: 'Проблема' },
  { value: 'harvest', label: 'Урожай' },
  { value: 'treatment', label: 'Обработка' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item.label])) as Record<PostStatus, string>

function isNetworkError(error: unknown) {
  if (!navigator.onLine) return true
  if (!(error instanceof Error)) return false
  return error.message.includes('Нет связи') || error.message.includes('не ответил вовремя')
}

export function FeedPage({ currentUser }: { currentUser: User }) {
  const [fields, setFields] = useState<AgroField[]>([])
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [mlAnalysis, setMlAnalysis] = useState<PlantHealthAnalysis | null>(null)
  const [notifyNeighbors, setNotifyNeighbors] = useState(true)
  const [draft, setDraft] = useState<PostCreate>({
    author_id: currentUser.id,
    field_id: 0,
    text: '',
    status: 'problem',
    photo_data_url: '',
    latitude: 0,
    longitude: 0,
  })

  const reloadFeed = useCallback(async () => {
    const data = await api.feed(currentUser.id)
    setPosts(data)
  }, [currentUser.id])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([api.fields(currentUser.id), api.feed(currentUser.id)])
      .then(([fieldData, feedData]) => {
        if (cancelled) return
        setFields(fieldData)
        setPosts(feedData)
        const first = fieldData[0]
        if (first) {
          setDraft((current) => ({ ...current, author_id: currentUser.id, field_id: first.id, latitude: first.latitude, longitude: first.longitude }))
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить ленту') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentUser.id])

  useEffect(() => {
    const handleSync = () => { void reloadFeed().catch(() => undefined) }
    window.addEventListener('agroconnect:sync-complete', handleSync)
    return () => window.removeEventListener('agroconnect:sync-complete', handleSync)
  }, [reloadFeed])

  const selectedField = useMemo(() => fields.find((field) => field.id === draft.field_id) ?? null, [draft.field_id, fields])
  const handleMlAnalysisChange = useCallback((analysis: PlantHealthAnalysis | null) => setMlAnalysis(analysis), [])
  const handleSuggestedText = useCallback((text: string) => {
    setDraft((current) => ({ ...current, text: current.text.trim() ? `${current.text.trim()}\n\n${text}` : text }))
  }, [])

  function selectField(fieldId: number) {
    const field = fields.find((item) => item.id === fieldId)
    if (!field) return
    setMlAnalysis(null)
    setDraft((current) => ({ ...current, field_id: field.id, latitude: field.latitude, longitude: field.longitude }))
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    setNotice('')
    setMlAnalysis(null)
    try {
      const dataUrl = await resizeImage(file)
      setDraft((current) => ({ ...current, photo_data_url: dataUrl }))
      setPhotoName(file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать фотографию')
    }
  }

  function resetComposer() {
    setDraft((current) => ({ ...current, text: '', status: 'problem', photo_data_url: '' }))
    setMlAnalysis(null)
    setPhotoName('')
    setShowComposer(false)
  }

  async function saveOfflinePost(payload: PostCreate) {
    await enqueueMutation('/api/posts', 'POST', payload, `Публикация с поля: ${selectedField?.name ?? 'поле'}`, { kind: 'post' })
    resetComposer()
    setNotice('Нет связи. Публикация с фото сохранена на устройстве и будет отправлена автоматически после появления сети.')
    if (mlAnalysis) setNotice((current) => `${current} ML-анализ и уведомление соседей требуют сети и не будут запускаться до повторного анализа.`)
  }

  async function submitPost(event: FormEvent) {
    event.preventDefault()
    if (!selectedField) { setError('Сначала добавьте поле'); return }
    if (!draft.photo_data_url) { setError('Добавьте фотографию'); return }
    const payload = { ...draft, author_id: currentUser.id }
    setSubmitting(true)
    setError('')
    setNotice('')
    if (!navigator.onLine) {
      try { await saveOfflinePost(payload) } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось сохранить офлайн-черновик') }
      finally { setSubmitting(false) }
      return
    }
    try {
      const post = await api.createPost(payload)
      let mlMessage = ''
      if (mlAnalysis && ['accepted', 'corrected'].includes(mlAnalysis.feedback_status)) {
        try {
          await api.linkPlantHealthPost(mlAnalysis.id, currentUser.id, post.id)
          if (notifyNeighbors) {
            const result = await api.notifyPlantHealthNeighbors(mlAnalysis.id, currentUser.id)
            mlMessage = result.recipients > 0 ? `Проблема опубликована. Предупреждение получили соседние хозяйства: ${result.recipients}.` : 'Проблема опубликована. Подходящих соседей в заданном радиусе пока нет.'
          }
        } catch (mlErr) {
          mlMessage = `Публикация создана, но ML-сценарий завершился не полностью: ${mlErr instanceof Error ? mlErr.message : 'ошибка'}`
        }
      }
      resetComposer()
      setNotice(mlMessage)
      await reloadFeed()
    } catch (err) {
      if (isNetworkError(err)) {
        try { await saveOfflinePost(payload) } catch (queueErr) { setError(queueErr instanceof Error ? queueErr.message : 'Не удалось сохранить офлайн-черновик') }
      } else setError(err instanceof Error ? err.message : 'Не удалось опубликовать запись')
    } finally { setSubmitting(false) }
  }

  function optimisticReaction(postId: number, value: -1 | 1) {
    setPosts((current) => current.map((post) => {
      if (post.id !== postId) return post
      const previous = post.viewer_reaction
      const next = previous === value ? null : value
      const healthy = Math.max(0, post.healthy_count - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0))
      const wilted = Math.max(0, post.wilted_count - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0))
      return { ...post, viewer_reaction: next, healthy_count: healthy, wilted_count: wilted, score: healthy - wilted }
    }))
  }

  async function queueReaction(postId: number, value: -1 | 1) {
    await enqueueMutation(
      `/api/posts/${postId}/reaction`,
      'PUT',
      { user_id: currentUser.id, value },
      `Реакция на публикацию #${postId}`,
      { kind: 'reaction', dedupeKey: `reaction:${postId}:${currentUser.id}` },
    )
    setNotice('Реакция сохранена офлайн и будет синхронизирована.')
  }

  async function react(postId: number, value: -1 | 1) {
    setError('')
    setNotice('')
    optimisticReaction(postId, value)
    if (!navigator.onLine) { await queueReaction(postId, value); return }
    try {
      const updated = await api.setReaction(postId, currentUser.id, value)
      setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)))
    } catch (err) {
      if (isNetworkError(err)) await queueReaction(postId, value)
      else {
        setError(err instanceof Error ? err.message : 'Не удалось сохранить реакцию')
        await reloadFeed().catch(() => undefined)
      }
    }
  }

  async function comment(postId: number, text: string) {
    setError('')
    setNotice('')
    const tempId = -Date.now()
    const optimistic: FeedComment = { id: tempId, author: currentUser, text, created_at: new Date().toISOString() }
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, comments: [...post.comments, optimistic] } : post))
    const queue = async () => {
      await enqueueMutation(`/api/posts/${postId}/comments`, 'POST', { author_id: currentUser.id, text }, `Комментарий к публикации #${postId}`, { kind: 'comment' })
      setNotice('Комментарий сохранён офлайн и будет отправлен позже.')
    }
    if (!navigator.onLine) { await queue(); return }
    try {
      const updated = await api.addComment(postId, currentUser.id, text)
      setPosts((current) => current.map((post) => (post.id === updated.id ? updated : post)))
    } catch (err) {
      if (isNetworkError(err)) await queue()
      else {
        setPosts((current) => current.map((post) => post.id === postId ? { ...post, comments: post.comments.filter((item) => item.id !== tempId) } : post))
        setError(err instanceof Error ? err.message : 'Не удалось добавить комментарий')
        throw err
      }
    }
  }

  return (
    <section className="social-feed-page">
      <div className="feed-page-heading"><div><h1>Лента рядом</h1><p>Публикации из хозяйств в радиусе {currentUser.news_radius_km} км, выше — записи с лучшей оценкой.</p></div><button type="button" className="primary-button compact-button" disabled={fields.length === 0} onClick={() => setShowComposer((value) => !value)}>{showComposer ? 'Закрыть' : '+ Публикация'}</button></div>
      <MonetizationExperiment currentUser={currentUser} />
      {fields.length === 0 && !loading && <div className="feed-info-card"><strong>Для публикации нужно поле</strong><p>Перейдите в раздел «Поля», добавьте его и привяжите к географии.</p></div>}
      {showComposer && selectedField && (
        <form className="publication-composer" onSubmit={submitPost}>
          <div className="composer-title-row"><div><span className="feed-kicker">Публикация с поля</span><h2>Что происходит?</h2></div><span className="field-location-chip">⌖ {selectedField.name}</span></div>
          <div className="feed-form-grid">
            <label className="feed-field"><span>Поле</span><select value={draft.field_id} onChange={(e) => selectField(Number(e.target.value))}>{fields.map((field) => <option key={field.id} value={field.id}>{field.name} · {field.crop}</option>)}</select></label>
            <label className="feed-field"><span>Статус</span><select value={draft.status} onChange={(e) => { const status = e.target.value as PostStatus; if (status !== 'problem') setMlAnalysis(null); setDraft({ ...draft, status }) }}>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <label className="photo-picker"><input type="file" accept="image/*" capture="environment" onChange={(event) => void choosePhoto(event)} />{draft.photo_data_url ? <img src={draft.photo_data_url} alt="Предпросмотр публикации" /> : <span className="photo-placeholder"><b>＋ Фото с поля</b><small>Камера или галерея</small></span>}</label>
          {photoName && <small className="photo-name">{photoName}</small>}
          {draft.status === 'problem' && draft.photo_data_url && navigator.onLine && <PlantHealthPanel userId={currentUser.id} fieldId={selectedField.id} imageDataUrl={draft.photo_data_url} onAnalysisChange={handleMlAnalysisChange} onSuggestedText={handleSuggestedText} />}
          {draft.status === 'problem' && draft.photo_data_url && !navigator.onLine && <div className="feed-info-card"><p>AI-анализ требует сети. Фото можно сохранить сейчас и проанализировать позже.</p></div>}
          {mlAnalysis && ['accepted', 'corrected'].includes(mlAnalysis.feedback_status) && <label className="feed-field"><span><input type="checkbox" checked={notifyNeighbors} onChange={(event) => setNotifyNeighbors(event.target.checked)} />{' '}После публикации предупредить моих соседей в радиусе</span></label>}
          <label className="feed-field"><span>Комментарий (необязательно)</span><textarea rows={3} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Что заметили? Нужен совет?" /></label>
          <div className="publication-meta"><span>⌖ {draft.latitude.toFixed(4)}, {draft.longitude.toFixed(4)}</span><span>{selectedField.crop}</span></div>
          <button className="primary-button full-width" type="submit" disabled={submitting}>{submitting ? 'Сохраняем…' : navigator.onLine ? 'Опубликовать' : 'Сохранить и отправить позже'}</button>
        </form>
      )}
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="feed-info-card"><p>{notice}</p></div>}
      {loading ? <p>Загрузка ленты…</p> : posts.length === 0 ? <div className="feed-info-card"><strong>В радиусе пока тихо</strong><p>Создайте первую публикацию с поля.</p></div> : <div className="social-feed-list">{posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} onReact={(value) => void react(post.id, value)} onComment={(text) => comment(post.id, text)} />)}</div>}
    </section>
  )
}

function PostCard({ post, currentUser, onReact, onComment }: { post: FeedPost; currentUser: User; onReact: (value: -1 | 1) => void; onComment: (text: string) => Promise<void> }) {
  const [commentText, setCommentText] = useState('')
  const [commenting, setCommenting] = useState(false)
  async function submitComment(event: FormEvent) { event.preventDefault(); const text = commentText.trim(); if (!text) return; setCommenting(true); try { await onComment(text); setCommentText('') } finally { setCommenting(false) } }
  return (
    <article className="social-post-card">
      <div className="social-post-author"><Avatar name={post.author.name} /><div><strong>{post.author.name}</strong><span>@{post.author.username} · {post.author.region}</span></div><span className={`post-score ${post.score < 0 ? 'negative' : ''}`}>score {post.score > 0 ? `+${post.score}` : post.score}</span></div>
      <div className="post-context-row"><span className={`status-chip status-${post.status}`}>{STATUS_LABELS[post.status]}</span><span>{post.field_name} · {post.crop}</span>{post.distance_km !== null && <span>⌖ {post.distance_km} км</span>}</div>
      <img className="post-photo" src={post.photo_data_url} alt={`${STATUS_LABELS[post.status]} — ${post.crop}`} />
      {post.text && <p className="social-post-text">{post.text}</p>}
      <div className="reaction-row"><button type="button" className={`reaction-button healthy ${post.viewer_reaction === 1 ? 'active' : ''}`} onClick={() => onReact(1)} aria-label="Здоровый колос"><span>🌾</span><b>{post.healthy_count}</b><small>здорово</small></button><button type="button" className={`reaction-button wilted ${post.viewer_reaction === -1 ? 'active' : ''}`} onClick={() => onReact(-1)} aria-label="Увядший колос"><span>🥀</span><b>{post.wilted_count}</b><small>проблема</small></button><span className="comment-count">💬 {post.comments.length}</span></div>
      {post.comments.length > 0 && <div className="comment-list">{post.comments.map((item) => <div className="comment-item" key={item.id}><Avatar name={item.author.name} small /><div><strong>{item.author.name}</strong><p>{item.text}</p>{item.id < 0 && <small>ждёт отправки</small>}</div></div>)}</div>}
      <form className="comment-form" onSubmit={submitComment}><Avatar name={currentUser.name} small /><input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Ответить по делу…" maxLength={1000} /><button type="submit" disabled={!commentText.trim() || commenting}>{commenting ? '…' : '↗'}</button></form>
    </article>
  )
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) { const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2); return <div className={`feed-avatar ${small ? 'small' : ''}`}>{initials}</div> }

async function resizeImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Выберите изображение')
  const original = await readFile(file)
  const image = await loadImage(original)
  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Не удалось подготовить изображение')
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

function readFile(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Не удалось прочитать фотографию')); reader.readAsDataURL(file) }) }
function loadImage(src: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Не удалось открыть фотографию')); image.src = src }) }
