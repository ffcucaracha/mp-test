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

export type AgroField = {
  id: number
  owner_id: number
  name: string
  crop: string
  latitude: number
  longitude: number
  area_ha: number | null
  created_at: string
}

export type FieldCreate = Pick<AgroField, 'name' | 'crop' | 'latitude' | 'longitude' | 'area_ha'>

export type Post = {
  id: number
  text: string
  created_at: string
  author: User
}
