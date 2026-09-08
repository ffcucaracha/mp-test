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

export type GamificationMetrics = {
  profile_completeness: number
  neighbors: number
  weekly_activity_streak: number
  reputation: number
}

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

export type CropSeason = {
  id: number
  field_id: number
  year: number
  crop: string
  created_at: string
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

export type PlantHealthProviderName = 'kindwise' | 'gemini' | 'plantvillage' | 'demo'
export type PlantHealthFeedbackStatus = 'pending' | 'accepted' | 'rejected' | 'corrected'

export type PlantHealthProviderStatus = {
  name: PlantHealthProviderName
  label: string
  configured: boolean
  offline: boolean
}

export type PlantHealthProviders = {
  default: PlantHealthProviderName
  providers: PlantHealthProviderStatus[]
}

export type PlantHealthSuggestion = {
  label: string
  confidence: number
  scientific_name: string | null
  category: string | null
  description: string | null
}

export type PlantHealthAnalysis = {
  id: number
  user_id: number
  field_id: number
  provider: PlantHealthProviderName
  crop_hint: string
  image_sha256: string
  suggestions: PlantHealthSuggestion[]
  top_label: string
  top_confidence: number
  feedback_status: PlantHealthFeedbackStatus
  final_label: string | null
  posted_post_id: number | null
  created_at: string
  feedback_at: string | null
}

export type NeighborLink = {
  user: User
  created_at: string
}

export type Apiary = {
  id: number
  owner_id: number
  name: string
  latitude: number
  longitude: number
  alert_radius_km: number
  created_at: string
}

export type ApiaryCreate = Omit<Apiary, 'id' | 'created_at'>

export type AlertType = 'disease' | 'pesticide' | 'weather'

export type AlertItem = {
  id: number
  type: AlertType
  title: string
  details: string
  field_id: number | null
  field_name: string | null
  author: User
  latitude: number
  longitude: number
  radius_km: number
  starts_at: string | null
  distance_km: number | null
  apiary_id: number | null
  apiary_name: string | null
  is_opened: boolean
  created_at: string
}

export type AlertCreate = {
  author_id: number
  field_id: number | null
  type: AlertType
  latitude: number
  longitude: number
  radius_km: number
  starts_at: string | null
  title: string
  details: string
}

export type WeatherHour = {
  time: string
  temperature_c: number
  apparent_temperature_c: number | null
  precipitation_probability: number | null
  wind_speed_kmh: number | null
}

export type FieldWeather = {
  field_id: number
  field_name: string
  provider: string
  checked_at: string
  threshold_c: number
  hours_requested: number
  frost_risk: boolean
  frost_starts_at: string | null
  min_temperature_c: number
  max_precipitation_probability: number | null
  max_wind_speed_kmh: number | null
  alert_id: number | null
  alert_created: boolean
  hours: WeatherHour[]
}

export type ProductEventSummary = {
  event_name: string
  user_id: number | null
  experiment_variant: string | null
  properties: Record<string, unknown>
  created_at: string
}

export type InternalMetrics = {
  activation: {
    users: number
    profiles_completed: number
    fields: number
    fields_with_location: number
  }
  social: {
    posts: number
    reactions: number
    comments: number
    neighbors: number
  }
  events: Record<string, number>
  privacy_experiment: Record<'A' | 'B', {
    fields: number
    events: Record<string, number>
  }>
  recent_events: ProductEventSummary[]
}
