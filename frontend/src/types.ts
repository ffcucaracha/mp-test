export type User = {
  id: number
  name: string
  username: string
  region: string
  specialization: string
  farm_name: string
  bio: string
  is_beekeeper: boolean
  news_radius_km: number
  broadcast_radius_km: number
}

export type UserUpdate = Omit<User, 'id' | 'username'>

export type PrivacyVariant = 'A' | 'B'
export type VisitRequestStatus = 'pending' | 'approved' | 'declined'

export type AgroField = {
  id: number
  owner_id: number
  name: string
  crop: string
  rotation: string
  latitude: number
  longitude: number
  area_ha: number | null
  privacy_variant: PrivacyVariant
  created_at: string
}

export type FieldCreate = Pick<AgroField, 'name' | 'crop' | 'latitude' | 'longitude' | 'area_ha'> & {
  rotation?: string
  privacy_variant?: PrivacyVariant
}

export type PublicField = {
  id: number
  owner_id: number
  owner_name: string
  owner_username: string
  owner_region: string
  privacy_variant: PrivacyVariant
  details_visible: boolean
  name: string | null
  crop: string | null
  rotation: string | null
  area_ha: number | null
  latitude: number | null
  longitude: number | null
  approximate_latitude: number
  approximate_longitude: number
  visit_request_status: VisitRequestStatus | null
}

export type VisitRequest = {
  id: number
  field_id: number
  field_name: string
  owner_id: number
  requester_id: number
  requester_name: string
  requester_username: string
  message: string
  status: VisitRequestStatus
  created_at: string
}

export type PostStatus = 'sowing' | 'sprouts' | 'flowering' | 'problem' | 'harvest' | 'treatment'

export type FeedComment = {
  id: number
  author: User
  text: string
  created_at: string
}

export type FeedPost = {
  id: number
  text: string
  status: PostStatus
  photo_data_url: string
  latitude: number
  longitude: number
  created_at: string
  author: User
  field_id: number
  field_name: string
  crop: string
  distance_km: number | null
  healthy_count: number
  wilted_count: number
  score: number
  viewer_reaction: -1 | 1 | null
  comments: FeedComment[]
}

export type PostCreate = {
  author_id: number
  field_id: number
  text: string
  status: PostStatus
  photo_data_url: string
  latitude: number
  longitude: number
}
