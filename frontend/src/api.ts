import type {
  AgroField,
  AlertCreate,
  AlertItem,
  Apiary,
  ApiaryCreate,
  CropSeason,
  FeedPost,
  FieldCreate,
  FieldWeather,
  GamificationMetrics,
  InternalMetrics,
  NeighborLink,
  PlantHealthAnalysis,
  PlantHealthProviderName,
  PlantHealthProviders,
  PostCreate,
  PrivacyVariant,
  PublicField,
  User,
  UserUpdate,
  VisitRequest,
  VisitRequestStatus,
} from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.detail) message = String(body.detail)
    } catch {
      // Keep the HTTP status text when the body is not JSON.
    }
    throw new Error(message)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; service: string }>('/api/health'),
  users: () => request<User[]>('/api/users'),
  user: (userId: number) => request<User>(`/api/users/${userId}`),
  gamification: (userId: number) => request<GamificationMetrics>(`/api/users/${userId}/gamification`),
  updateUser: (userId: number, payload: UserUpdate) =>
    request<User>(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  fields: (userId: number) => request<AgroField[]>(`/api/users/${userId}/fields`),
  field: (fieldId: number) => request<AgroField>(`/api/fields/${fieldId}`),
  createField: (userId: number, payload: FieldCreate) =>
    request<AgroField>(`/api/users/${userId}/fields`, { method: 'POST', body: JSON.stringify(payload) }),
  updateFieldPrivacy: (fieldId: number, ownerId: number, privacyVariant: PrivacyVariant) =>
    request<AgroField>(`/api/fields/${fieldId}/privacy`, { method: 'PUT', body: JSON.stringify({ owner_id: ownerId, privacy_variant: privacyVariant }) }),
  publicFields: (viewerId: number) => request<PublicField[]>(`/api/public/fields?viewer_id=${viewerId}`),
  cropSeasons: (fieldId: number, viewerId: number) => request<CropSeason[]>(`/api/fields/${fieldId}/crop-seasons?viewer_id=${viewerId}`),
  addCropSeason: (fieldId: number, userId: number, year: number, crop: string) =>
    request<CropSeason>(`/api/fields/${fieldId}/crop-seasons`, { method: 'POST', body: JSON.stringify({ user_id: userId, year, crop }) }),
  checkFieldWeather: (fieldId: number, userId: number, frostThresholdC = 0, hours = 72) =>
    request<FieldWeather>(`/api/fields/${fieldId}/weather/check`, { method: 'POST', body: JSON.stringify({ user_id: userId, frost_threshold_c: frostThresholdC, hours }) }),
  requestVisit: (fieldId: number, requesterId: number, message: string) =>
    request<VisitRequest>(`/api/fields/${fieldId}/visit-requests`, { method: 'POST', body: JSON.stringify({ requester_id: requesterId, message }) }),
  incomingVisitRequests: (ownerId: number) => request<VisitRequest[]>(`/api/users/${ownerId}/visit-requests/incoming`),
  outgoingVisitRequests: (requesterId: number) => request<VisitRequest[]>(`/api/users/${requesterId}/visit-requests/outgoing`),
  updateVisitRequest: (requestId: number, ownerId: number, requestStatus: Exclude<VisitRequestStatus, 'pending'>) =>
    request<VisitRequest>(`/api/visit-requests/${requestId}`, { method: 'PUT', body: JSON.stringify({ owner_id: ownerId, status: requestStatus }) }),
  feed: (viewerId: number) => request<FeedPost[]>(`/api/feed?viewer_id=${viewerId}`),
  createPost: (payload: PostCreate) => request<FeedPost>('/api/posts', { method: 'POST', body: JSON.stringify(payload) }),
  setReaction: (postId: number, userId: number, value: -1 | 1) => request<FeedPost>(`/api/posts/${postId}/reaction`, { method: 'PUT', body: JSON.stringify({ user_id: userId, value }) }),
  addComment: (postId: number, authorId: number, text: string) => request<FeedPost>(`/api/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ author_id: authorId, text }) }),

  plantHealthProviders: () => request<PlantHealthProviders>('/api/ml/providers'),
  analyzePlantHealth: (payload: { user_id: number; field_id: number; image_data_url: string; provider?: PlantHealthProviderName }) =>
    request<PlantHealthAnalysis>('/api/ml/analyze', { method: 'POST', body: JSON.stringify(payload) }),
  plantHealthFeedback: (analysisId: number, userId: number, verdict: 'accepted' | 'rejected' | 'corrected', correctedLabel?: string) =>
    request<PlantHealthAnalysis>(`/api/ml/analyses/${analysisId}/feedback`, {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, verdict, corrected_label: correctedLabel || null }),
    }),
  linkPlantHealthPost: (analysisId: number, userId: number, postId: number) =>
    request<PlantHealthAnalysis>(`/api/ml/analyses/${analysisId}/post`, {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, post_id: postId }),
    }),
  notifyPlantHealthNeighbors: (analysisId: number, userId: number) =>
    request<{ alert_id: number; recipients: number }>(`/api/ml/analyses/${analysisId}/notify-neighbors`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  neighbors: (userId: number) => request<NeighborLink[]>(`/api/neighbors?user_id=${userId}`),
  addNeighbor: (userId: number, neighborUserId: number) => request<NeighborLink>(`/api/neighbors/${neighborUserId}?user_id=${userId}`, { method: 'POST' }),
  removeNeighbor: (userId: number, neighborUserId: number) => request<void>(`/api/neighbors/${neighborUserId}?user_id=${userId}`, { method: 'DELETE' }),
  neighborProfile: (userId: number, neighborUserId: number) => request<User>(`/api/neighbors/${neighborUserId}/profile?user_id=${userId}`),
  apiaries: (userId: number) => request<Apiary[]>(`/api/apiaries?user_id=${userId}`),
  createApiary: (payload: ApiaryCreate) => request<Apiary>('/api/apiaries', { method: 'POST', body: JSON.stringify(payload) }),
  alerts: (userId: number) => request<AlertItem[]>(`/api/alerts?user_id=${userId}`),
  unreadAlerts: (userId: number) => request<{ count: number }>(`/api/alerts/unread-count?user_id=${userId}`),
  createAlert: (payload: AlertCreate) => request<{ id: number; recipients: number }>('/api/alerts', { method: 'POST', body: JSON.stringify(payload) }),
  openAlert: (alertId: number, userId: number) => request<AlertItem>(`/api/alerts/${alertId}/open`, { method: 'PUT', body: JSON.stringify({ user_id: userId }) }),
  alertOwner: (alertId: number, userId: number) => request<User>(`/api/alerts/${alertId}/owner-contact?user_id=${userId}`, { method: 'POST' }),
  metrics: () => request<InternalMetrics>('/api/internal/metrics'),
}
