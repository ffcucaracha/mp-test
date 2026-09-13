import { useEffect, useState } from 'react'

import { api } from './api'
import type { FarmAccessRequest, NeighborLink, NearbyFarmer, PublicField, User } from './types'

const RADII = Array.from({ length: 20 }, (_, index) => (index + 1) * 50)
const ACCESS_MESSAGE = 'Хочу посмотреть все поля хозяйства и обменяться опытом.'

export function NeighborsPage({ currentUser }: { currentUser: User }) {
  const [neighbors, setNeighbors] = useState<NeighborLink[]>([])
  const [nearby, setNearby] = useState<NearbyFarmer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const [incoming, setIncoming] = useState<FarmAccessRequest[]>([])
  const [radiusKm, setRadiusKm] = useState(100)
  const [selected, setSelected] = useState<NeighborLink | null>(null)
  const [neighborFields, setNeighborFields] = useState<PublicField[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [neighborRows, nearbyRows, incomingRows] = await Promise.all([
        api.neighbors(currentUser.id),
        api.nearbyFarmers(currentUser.id, radiusKm),
        api.incomingFarmAccessRequests(currentUser.id),
      ])
      setNeighbors(neighborRows)
      setNearby(nearbyRows)
      setIncoming(incomingRows)
      setSelected((current) => current ? neighborRows.find((item) => item.user.id === current.user.id) ?? null : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить соседей')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [currentUser.id, radiusKm])

  async function addNeighbor(user: User) {
    setBusyKey(`add-${user.id}`)
    try { await api.addNeighbor(currentUser.id, user.id); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось добавить соседа') } finally { setBusyKey('') }
  }

  async function searchNeighbors() {
    const query = searchQuery.trim()
    if (query.length < 2) return
    setSearching(true); setError('')
    try { setSearchResults(await api.searchNeighbors(currentUser.id, query)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Не удалось выполнить поиск') }
    finally { setSearching(false) }
  }

  async function removeNeighbor(user: User) {
    setBusyKey(`remove-${user.id}`)
    try { await api.removeNeighbor(currentUser.id, user.id); setSelected(null); setNeighborFields([]); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось убрать соседа') } finally { setBusyKey('') }
  }

  async function openFields(neighbor: NeighborLink) {
    setBusyKey(`fields-${neighbor.user.id}`)
    try { setNeighborFields(await api.neighborFields(currentUser.id, neighbor.user.id)); setSelected(neighbor) } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось открыть поля соседа') } finally { setBusyKey('') }
  }

  async function requestAccess(neighbor: NeighborLink) {
    setBusyKey(`access-${neighbor.user.id}`)
    try { await api.requestFarmAccess(neighbor.user.id, currentUser.id, ACCESS_MESSAGE); setSelected((current) => current ? { ...current, access_request_status: 'pending' } : null); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось отправить запрос доступа') } finally { setBusyKey('') }
  }

  async function answerRequest(request: FarmAccessRequest, status: 'approved' | 'declined') {
    setBusyKey(`answer-${request.id}`)
    try { await api.updateFarmAccessRequest(request.id, currentUser.id, status); await load() } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось ответить на запрос') } finally { setBusyKey('') }
  }

  const pending = incoming.filter((request) => request.status === 'pending')

  return <section className="neighbors-page">
    <div className="section-heading neighbors-heading"><div><h1>Соседи</h1><p>Добавляйте интересные хозяйства и управляйте доступом сразу ко всем их полям.</p></div><span className="count-badge">{neighbors.length}</span></div>
    {error && <div className="error-banner">{error}</div>}

    <section className="neighbor-search-card nearby-farmers-card">
      <div className="nearby-heading"><div><h2>Рядом с вами</h2><p className="muted">Хозяйства, у которых хотя бы одно поле попадает в выбранный радиус от ваших полей.</p></div><label className="nearby-radius"><span>Радиус</span><select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))}>{RADII.map((radius) => <option key={radius} value={radius}>{radius} км</option>)}</select></label></div>
      {loading ? <p className="muted">Ищем хозяйства рядом…</p> : nearby.length === 0 ? <div className="neighbor-empty">В этом радиусе новых хозяйств нет.</div> : <div className="neighbor-search-results">{nearby.map((farmer) => <article className="neighbor-card searchable" key={farmer.user.id}><div className="neighbor-main"><strong>{farmer.user.name}</strong><small>{farmer.user.farm_name || `@${farmer.user.username}`} · {farmer.user.specialization}</small><small>{farmer.fields_count} полей · {formatArea(farmer.total_area_ha)} · ближайшее поле в {formatDistance(farmer.nearest_field_distance_km)}</small></div><button className="primary-button compact-button" type="button" disabled={busyKey === `add-${farmer.user.id}`} onClick={() => void addNeighbor(farmer.user)}>{busyKey === `add-${farmer.user.id}` ? 'Добавляем…' : '+ Сосед'}</button></article>)}</div>}
    </section>

    <section className="neighbor-search-card">
      <div className="nearby-heading"><div><h2>Найти фермера</h2><p className="muted">По фамилии, имени или @нику — независимо от расстояния.</p></div></div>
      <form className="neighbor-name-search" onSubmit={(event) => { event.preventDefault(); void searchNeighbors() }}><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Например, Иванова или @anna_farm" minLength={2} /><button className="secondary-button compact-button" type="submit" disabled={searching || searchQuery.trim().length < 2}>{searching ? 'Ищем…' : 'Найти'}</button></form>
      {searchResults.length > 0 && <div className="neighbor-search-results">{searchResults.filter((user) => !neighbors.some((item) => item.user.id === user.id)).map((user) => <article className="neighbor-card searchable" key={user.id}><div className="neighbor-main"><strong>{user.name}</strong><small>@{user.username} · {user.region}</small><small>{user.farm_name || user.specialization}</small></div><button className="primary-button compact-button" type="button" disabled={busyKey === `add-${user.id}`} onClick={() => void addNeighbor(user)}>{busyKey === `add-${user.id}` ? 'Добавляем…' : '+ Сосед'}</button></article>)}</div>}
      {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && <div className="neighbor-empty">Ничего не найдено.</div>}
    </section>

    <section className="neighbors-current-section">
      <h2>Мои соседи</h2>
      {loading ? <p>Загрузка соседей…</p> : neighbors.length === 0 ? <div className="neighbor-empty">Добавьте фермера из списка «Рядом с вами».</div> : <div className="neighbor-list">{neighbors.map((neighbor) => <article className="neighbor-card" key={neighbor.user.id}><div className="neighbor-main"><strong>{neighbor.user.name}</strong><small>{neighbor.user.farm_name || `@${neighbor.user.username}`} · {neighbor.user.region}</small><small>{neighbor.fields_count} полей · {formatArea(neighbor.total_area_ha)} · {accessLabel(neighbor.access_request_status)}</small></div><div className="neighbor-actions"><button className="secondary-button compact-button" type="button" disabled={busyKey === `fields-${neighbor.user.id}`} onClick={() => void openFields(neighbor)}>{busyKey === `fields-${neighbor.user.id}` ? 'Открываем…' : 'Поля'}</button><button className="secondary-button compact-button" type="button" disabled={busyKey === `remove-${neighbor.user.id}`} onClick={() => void removeNeighbor(neighbor.user)}>Убрать</button></div></article>)}</div>}
    </section>

    {selected && <section className="neighbor-profile-card neighbor-fields-panel">
      <div className="section-heading"><div><h2>Поля: {selected.user.farm_name || selected.user.name}</h2><p>{selected.fields_count} полей · {formatArea(selected.total_area_ha)}</p></div><button className="secondary-button compact-button" type="button" onClick={() => { setSelected(null); setNeighborFields([]) }}>Закрыть</button></div>
      {selected.access_request_status !== 'approved' && <div className="access-callout"><div><strong>{selected.access_request_status === 'pending' ? 'Доступ: ожидает решения' : 'Доступ: не открыт'}</strong><p>{selected.access_request_status === 'pending' ? 'Остальные поля пока закрыты.' : selected.access_request_status === 'declined' ? 'Владелец отказал. Можно отправить запрос ещё раз.' : 'Открыты только публичные поля.'}</p></div>{selected.access_request_status !== 'pending' && <button className="primary-button compact-button" type="button" disabled={busyKey === `access-${selected.user.id}`} onClick={() => void requestAccess(selected)}>{busyKey === `access-${selected.user.id}` ? 'Отправляем…' : 'Запросить доступ'}</button>}</div>}
      {selected.access_request_status === 'approved' && <div className="access-callout granted"><strong>Доступ ко всем полям открыт</strong><span>Видны точные контуры, культуры и история полей.</span></div>}
      <div className="neighbor-fields">{neighborFields.map((field) => <NeighborFieldCard field={field} key={field.id} />)}</div>
    </section>}

    <section className="neighbors-current-section access-requests-section">
      <h2>Запросы к моим полям {pending.length > 0 && <span className="request-counter">{pending.length}</span>}</h2>
      {pending.length === 0 ? <div className="neighbor-empty">Новых запросов нет.</div> : <div className="neighbor-list">{pending.map((request) => <article className="neighbor-card" key={request.id}><div className="neighbor-main"><strong>{request.requester_name}</strong><small>@{request.requester_username} просит доступ ко всем {request.fields_count} полям вашего хозяйства.</small>{request.message && <small>{request.message}</small>}</div><div className="neighbor-actions"><button className="primary-button compact-button" disabled={busyKey === `answer-${request.id}`} onClick={() => void answerRequest(request, 'approved')}>Разрешить</button><button className="secondary-button compact-button" disabled={busyKey === `answer-${request.id}`} onClick={() => void answerRequest(request, 'declined')}>Отклонить</button></div></article>)}</div>}
    </section>
  </section>
}

function NeighborFieldCard({ field }: { field: PublicField }) {
  if (!field.details_visible) return <article className="neighbor-field-card is-private"><h4>Доступ закрыт</h4><p>Поле откроется после одобрения.</p></article>
  return <article className="neighbor-field-card is-open"><h4>{field.name}</h4><p>{field.crop} · {field.area_ha ? formatArea(field.area_ha) : 'площадь не указана'}</p><div className="field-detail-grid"><span className="wide"><small>Координаты центра</small><strong>{field.latitude?.toFixed(4)}, {field.longitude?.toFixed(4)}</strong></span></div></article>
}

function formatArea(value: number) { return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} га` }
function formatDistance(value: number) { return value < 10 ? `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км` : `${Math.round(value)} км` }
function accessLabel(status: NeighborLink['access_request_status']) { return status === 'approved' ? 'доступ открыт' : status === 'pending' ? 'заявка ожидает решения' : status === 'declined' ? 'доступ не открыт' : 'доступ не запрошен' }
