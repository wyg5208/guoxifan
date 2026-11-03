export interface UserBrief {
  id: string
  nickname: string
  avatar_url: string | null
  role: string
}

export interface Permissions {
  can_write: boolean
  is_staff: boolean
  is_admin: boolean
  is_super: boolean
}

export interface UserSelf extends UserBrief {
  email: string | null
  phone: string | null
  bio: string | null
  status: 'pending' | 'active' | 'disabled'
  villager_id: string | null
  villager_name?: string
  created_at: string | null
  permissions: Permissions
}

export interface Tokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface SiteConfig {
  site: {
    title?: string
    subtitle?: string
    description?: string
    logo_url?: string
    hero_images?: string[]
    hero_slogan?: string
    founded_year?: number
    demolition_date?: string
    footer_text?: string
    icp?: string
    share_image?: string
    theme_color?: string
  }
  feature: {
    reg_mode?: 'open' | 'invite' | 'closed'
    auto_approve?: boolean
    guest_browse?: boolean
    comment_enabled?: boolean
    download_original?: boolean
    chat_enabled?: boolean
  }
  contact: { admin_name?: string; admin_phone?: string }
}

export interface MediaUrls {
  thumb?: string | null
  small?: string | null
  medium?: string | null
  original?: string | null
  lqip?: string | null
  poster?: string | null
  hls?: string | null
  mp4?: string | null
}

export interface MediaItem {
  id: string
  kind: 'image' | 'video'
  title: string | null
  caption: string | null
  era: string | null
  tags: string[]
  status: string
  width: number | null
  height: number | null
  duration_sec: number | null
  taken_at: string | null
  urls: MediaUrls
  album: { id: string; title: string } | null
  album_id: string | null
  villager_ids: string[]
  visibility: string
  like_count: number
  favorite_count: number
  comment_count: number
  view_count: number
  is_liked: boolean
  is_favorited: boolean
  uploader: UserBrief | null
  uploader_id: string
  created_at: string | null
}

export interface PostItem {
  id: string
  kind: 'article' | 'short'
  title: string | null
  summary: string | null
  cover_url: string | null
  images: string[]
  author: UserBrief | null
  author_id: string
  category: string | null
  status: string
  visibility: string
  is_pinned: boolean
  is_featured: boolean
  like_count: number
  favorite_count: number
  comment_count: number
  view_count: number
  is_liked: boolean
  is_favorited: boolean
  published_at: string | null
  created_at: string | null
  content?: string
  content_html?: string
  tags?: string[]
  message?: string | null
}

export interface AlbumItem {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  era: string | null
  visibility: string
  sort_order: number
  media_count: number
  samples: (string | null)[]
  created_at: string | null
  media?: MediaItem[]
  members?: VillagerCard[]
}

export interface FamilyBrief {
  id: string
  name: string
  householder: string | null
  village_area: string | null
  door_no: string | null
  cover_url: string | null
}

export interface FamilyCard extends FamilyBrief {
  address_text: string | null
  map_x: number | null
  map_y: number | null
  lat: number | null
  lng: number | null
  intro: string | null
  relocated_at: string | null
  current_loc: string | null
  sort_order: number
  member_count: number
  created_at: string | null
  members?: VillagerCard[]
}

export interface VillagerCard {
  id: string
  name: string
  alias: string | null
  gender: string | null
  generation: string | null
  relation_to_head: string | null
  birth_date: string | null
  death_date: string | null
  is_deceased: boolean
  avatar_url: string | null
  occupation: string | null
  intro: string | null
  family: FamilyBrief | null
  family_id: string | null
  contact: string | null
  contact_visibility: string
  user_id: string | null
  sort_order: number
  relations?: { relation: string; villager: VillagerCard | null }[]
  photos?: { id: string; title: string | null; urls: MediaUrls; width: number | null; height: number | null }[]
  posts?: PostItem[]
  photo_count?: number
}

export interface TimelineItem {
  id: string
  year_label: string
  sort_year: number | null
  title: string
  description: string | null
  image_url: string | null
  category: string | null
  post_id: string | null
  sort_order?: number
}

export interface CommentItem {
  id: string
  target_type: string
  target_id: string
  parent_id: string | null
  root_id: string | null
  content: string
  author: UserBrief | null
  like_count: number
  reply_count: number
  replies: CommentItem[]
  created_at: string | null
}

export interface Attachment {
  id: string
  kind: 'image' | 'video' | 'file'
  filename: string
  mime: string
  size: number
  url: string | null
  width: number | null
  height: number | null
  duration_sec: number | null
}

export interface MessageItem {
  id: string
  room_id: string
  seq: number
  sender: UserBrief | null
  sender_id: string
  kind: 'text' | 'image' | 'video' | 'file' | 'system'
  content: string | null
  attachment: Attachment | null
  reply_to: unknown
  status: string
  created_at: string | null
}

export interface RoomItem {
  id: string
  type: 'hall' | 'group' | 'direct'
  name: string | null
  avatar_url: string | null
  description: string | null
  is_public: boolean
  owner_id: string | null
  last_seq: number
  last_message_at: string | null
  last_message_preview: string | null
  unread: number
  member_count: number
  peer: UserBrief | null
  created_at: string | null
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  target_type: string | null
  target_id: string | null
  is_read: boolean
  created_at: string | null
}

export interface Stats {
  media: number
  images: number
  videos: number
  posts: number
  villagers: number
  families: number
  members: number
  latest_media: {
    id: string
    kind: string
    title: string | null
    caption: string | null
    urls: MediaUrls
    width: number | null
    height: number | null
    created_at: string | null
  }[]
}

export interface HomeData {
  config: SiteConfig
  stats: Stats
  albums: AlbumItem[]
  posts: PostItem[]
  media: MediaItem[]
  villagers: VillagerCard[]
  timeline: TimelineItem[]
}

export interface Page<T> {
  data: T[]
  meta: { next_cursor?: string | null; has_more?: boolean; total?: number; [key: string]: unknown }
}

export interface SettingItem {
  key: string
  value: unknown
  type: string
  group: string
  label: string
  description: string | null
  is_public: boolean
}

export interface InviteItem {
  id: string
  code: string
  max_uses: number
  used_count: number
  auto_approve: boolean
  note: string | null
  expires_at: string | null
  disabled_at: string | null
  created_at: string | null
  status: 'active' | 'used' | 'expired' | 'disabled'
}

export interface AdminUser extends UserBrief {
  email: string | null
  phone: string | null
  bio: string | null
  status: string
  villager_id: string | null
  last_login_at: string | null
  created_at: string | null
}

export interface ReportItem {
  id: string
  target_type: string
  target_id: string
  reason: string
  detail: string | null
  status: string
  reporter: UserBrief | null
  handled_at: string | null
  created_at: string | null
}

export interface AuditLogItem {
  id: string
  action: string
  target_type: string | null
  target_id: string | null
  detail: string | null
  ip: string | null
  actor: UserBrief | null
  created_at: string | null
}
