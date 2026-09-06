import type {
  AgroField,
  FeedPost,
  FieldCreate,
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

  return response.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; service: string }>('/api/health'),
  users: () => request<User[]>('/api/users'),
  user: (userId: number) => request<User>(`/api/users/${userId}`),
  updateUser: (userId: number, payload: UserUpdate) =>
    request<User>(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  fields: (userId: number) => request<AgroField[]>(`/api/users/${userId}/fields`),
  field: (fieldId: number) => request<AgroField>(`/api/fields/${fieldId}`),
  createField: (userId: number, payload: FieldCreate) =>
    request<AgroField>(`/api/users/${userId}/fields`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFieldPrivacy: (fieldId: number, ownerId: number, privacyVariant: PrivacyVariant) =>
    request<AgroField>(`/api/fields/${fieldId}/privacy`, {
      method: 'PUT',
      body: JSON.stringify({ owner_id: ownerId, privacy_variant: privacyVariant }),
    }),
  publicFields: (viewerId: number) => request<PublicField[]>(`/api/public/fields?viewer_id=${viewerId}`),
  requestVisit: (fieldId: number, requesterId: number, message: string) =>
    request<VisitRequest>(`/api/fields/${fieldId}/visit-requests`, {
      method: 'POST',
      body: JSON.stringify({ requester_id: requesterId, message }),
    }),
  incomingVisitRequests: (ownerId: number) =>
    request<VisitRequest[]>(`/api/users/${ownerId}/visit-requests/incoming`),
  outgoingVisitRequests: (requesterId: number) =>
    request<VisitRequest[]>(`/api/users/${requesterId}/visit-requests/outgoing`),
  updateVisitRequest: (requestId: number, ownerId: number, requestStatus: Exclude<VisitRequestStatus, 'pending'>) =>
    request<VisitRequest>(`/api/visit-requests/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify({ owner_id: ownerId, status: requestStatus }),
    }),
  feed: (viewerId: number) => request<FeedPost[]>(`/api/feed?viewer_id=${viewerId}`),
  createPost: (payload: PostCreate) =>
    request<FeedPost>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setReaction: (postId: number, userId: number, value: -1 | 1) =>
    request<FeedPost>(`/api/posts/${postId}/reaction`, {
      method: 'PUT',
      body: JSON.stringify({ user_id: userId, value }),
    }),
  addComment: (postId: number, authorId: number, text: string) =>
    request<FeedPost>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ author_id: authorId, text }),
    }),
}
