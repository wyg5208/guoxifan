import type {
  AdminUser,
  AlbumItem,
  Attachment,
  AuditLogItem,
  CommentItem,
  FamilyBrief,
  FamilyCard,
  HomeData,
  InviteItem,
  MediaItem,
  MessageItem,
  NotificationItem,
  PostItem,
  ReportItem,
  RoomItem,
  SettingItem,
  SiteConfig,
  Stats,
  TimelineItem,
  Tokens,
  UserBrief,
  UserSelf,
  VillagerCard,
} from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
export const API_ROOT = `${API_BASE}/api/v1`

export class ApiError extends Error {
  code: string
  status: number
  details: unknown

  constructor(message: string, status: number, code = 'ERROR', details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

let accessToken: string | null = null
let refreshToken: string | null = null
let unauthenticatedHandler: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

export function setAuthTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
}

export function onUnauthenticated(handler: () => void) {
  unauthenticatedHandler = handler
}

export function mediaUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE}${path}`
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

type Envelope<T> = { data: T; meta?: Record<string, unknown> }

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  const isForm = init.body instanceof FormData
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers })

  if (response.status === 401 && retry && refreshToken) {
    const refreshed = await tryRefresh()
    if (refreshed) return raw(path, init, false)
  }
  if (response.status === 401 && retry) {
    unauthenticatedHandler?.()
  }
  return response
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const response = await fetch(`${API_ROOT}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!response.ok) return false
        const payload = await response.json()
        accessToken = payload.data.access_token
        refreshToken = payload.data.refresh_token
        tokenRefreshed?.(payload.data)
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

let tokenRefreshed: ((tokens: Tokens) => void) | null = null
export function onTokenRefreshed(handler: (tokens: Tokens) => void) {
  tokenRefreshed = handler
}

async function call<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
  const response = await raw(path, init)
  if (response.status === 204) return { data: undefined as T }
  const text = await response.text()
  let payload: any = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: { message: text.slice(0, 200) } }
    }
  }
  if (!response.ok) {
    const error = payload?.error ?? {}
    throw new ApiError(
      error.message || `请求失败（${response.status}）`,
      response.status,
      error.code || 'ERROR',
      error.details ?? null,
    )
  }
  return { data: payload.data as T, meta: payload.meta }
}

const json = (body: unknown) => JSON.stringify(body ?? {})

export const api = {
  // ---------------------------------------------------------------- 站点
  site: {
    config: () => call<SiteConfig>('/site/config').then((r) => r.data),
    stats: () => call<Stats>('/site/stats').then((r) => r.data),
    home: () => call<HomeData>('/home').then((r) => r.data),
    search: (q: string) =>
      call<{
        posts: PostItem[]
        media: MediaItem[]
        villagers: VillagerCard[]
        families: FamilyBrief[]
        total: number
      }>(`/search${buildQuery({ q })}`).then((r) => r.data),
  },

  // ---------------------------------------------------------------- 认证
  auth: {
    register: (body: {
      email?: string
      phone?: string
      password: string
      nickname: string
      invite_code?: string
      villager?: { name: string; family_id?: string | null; relation_to_head?: string | null }
    }) =>
      call<
        Tokens & { user_id: string; status: string; auto_approved: boolean; message: string }
      >('/auth/register', { method: 'POST', body: json(body) }).then((r) => r.data),
    login: (account: string, password: string) =>
      call<Tokens & { user: UserSelf }>('/auth/login', {
        method: 'POST',
        body: json({ account, password }),
      }).then((r) => r.data),
    refresh: (token: string) =>
      call<Tokens & { user: UserSelf }>('/auth/refresh', {
        method: 'POST',
        body: json({ refresh_token: token }),
      }).then((r) => r.data),
    logout: (token?: string | null) =>
      call<void>('/auth/logout', { method: 'POST', body: json({ refresh_token: token }) }),
    me: () => call<UserSelf>('/auth/me').then((r) => r.data),
    updateMe: (body: { nickname?: string; avatar_url?: string | null; bio?: string | null }) =>
      call<UserSelf>('/auth/me', { method: 'PATCH', body: json(body) }).then((r) => r.data),
    changePassword: (old_password: string, new_password: string) =>
      call('/auth/password', { method: 'POST', body: json({ old_password, new_password }) }),
  },

  // ---------------------------------------------------------------- 文章
  posts: {
    list: (params?: Record<string, unknown>) =>
      call<PostItem[]>(`/posts${buildQuery(params)}`).then((r) => r),
    get: (id: string) => call<PostItem>(`/posts/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      call<PostItem>('/posts', { method: 'POST', body: json(body) }).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call<PostItem>(`/posts/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    remove: (id: string) => call<void>(`/posts/${id}`, { method: 'DELETE' }),
    pin: (id: string) => call(`/posts/${id}/pin`, { method: 'POST' }),
    feature: (id: string) => call(`/posts/${id}/feature`, { method: 'POST' }),
    tags: () => call<{ id: string; name: string; use_count: number }[]>('/posts/by-slug/tags').then((r) => r.data),
  },

  // ---------------------------------------------------------------- 相册与照片
  albums: {
    list: () => call<AlbumItem[]>('/albums').then((r) => r),
    get: (id: string) => call<AlbumItem>(`/albums/${id}`).then((r) => r.data),
    media: (id: string, params?: Record<string, unknown>) =>
      call<MediaItem[]>(`/albums/${id}/media${buildQuery(params)}`).then((r) => r),
    create: (body: Record<string, unknown>) =>
      call<AlbumItem>('/albums', { method: 'POST', body: json(body) }).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call<AlbumItem>(`/albums/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    remove: (id: string) => call<void>(`/albums/${id}`, { method: 'DELETE' }),
  },

  media: {
    list: (params?: Record<string, unknown>) =>
      call<MediaItem[]>(`/media${buildQuery(params)}`).then((r) => r),
    latest: (params?: Record<string, unknown>) =>
      call<MediaItem[]>(`/photos/latest${buildQuery(params)}`).then((r) => r),
    get: (id: string) => call<MediaItem>(`/media/${id}`).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call<MediaItem>(`/media/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    remove: (id: string) => call<void>(`/media/${id}`, { method: 'DELETE' }),
    batch: (body: { ids: string[]; album_id?: string | null; delete?: boolean }) =>
      call<{ touched: number }>('/media/batch', { method: 'POST', body: json(body) }).then((r) => r.data),
  },

  // ---------------------------------------------------------------- 村民与家庭
  villagers: {
    list: (params?: Record<string, unknown>) =>
      call<VillagerCard[]>(`/villagers${buildQuery(params)}`).then((r) => r),
    get: (id: string) => call<VillagerCard>(`/villagers/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      call<VillagerCard>('/villagers', { method: 'POST', body: json(body) }).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call<VillagerCard>(`/villagers/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    remove: (id: string) => call<void>(`/villagers/${id}`, { method: 'DELETE' }),
    relate: (id: string, to_id: string, relation: string) =>
      call(`/villagers/${id}/relations`, { method: 'POST', body: json({ to_id, relation }) }),
  },

  families: {
    list: (params?: Record<string, unknown>) =>
      call<FamilyCard[]>(`/families${buildQuery(params)}`).then((r) => r),
    get: (id: string) => call<FamilyCard>(`/families/${id}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      call<FamilyCard>('/families', { method: 'POST', body: json(body) }).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call<FamilyCard>(`/families/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    remove: (id: string) => call<void>(`/families/${id}`, { method: 'DELETE' }),
  },

  timeline: {
    list: (params?: Record<string, unknown>) =>
      call<TimelineItem[]>(`/timeline${buildQuery(params)}`).then((r) => r.data),
    create: (body: Record<string, unknown>) =>
      call<{ id: string }>('/timeline', { method: 'POST', body: json(body) }).then((r) => r.data),
    update: (id: string, body: Record<string, unknown>) =>
      call(`/timeline/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: string) => call<void>(`/timeline/${id}`, { method: 'DELETE' }),
  },

  // ---------------------------------------------------------------- 互动
  interactions: {
    comments: (target_type: string, target_id: string, params?: Record<string, unknown>) =>
      call<CommentItem[]>(
        `/interactions/comments${buildQuery({ target_type, target_id, ...params })}`,
      ).then((r) => r),
    replies: (commentId: string, params?: Record<string, unknown>) =>
      call<CommentItem[]>(`/interactions/comments/${commentId}/replies${buildQuery(params)}`).then(
        (r) => r,
      ),
    comment: (body: { target_type: string; target_id: string; content: string; parent_id?: string }) =>
      call<CommentItem>('/interactions/comments', { method: 'POST', body: json(body) }).then((r) => r.data),
    removeComment: (id: string) => call<void>(`/interactions/comments/${id}`, { method: 'DELETE' }),
    like: (target_type: string, target_id: string) =>
      call<{ active: boolean; like_count: number }>('/interactions/likes', {
        method: 'POST',
        body: json({ target_type, target_id }),
      }).then((r) => r.data),
    favorite: (target_type: string, target_id: string) =>
      call<{ active: boolean; favorite_count: number }>('/interactions/favorites', {
        method: 'POST',
        body: json({ target_type, target_id }),
      }).then((r) => r.data),
    favorites: (params?: Record<string, unknown>) =>
      call<{ target_type: string; created_at: string; post?: PostItem; media?: MediaItem }[]>(
        `/interactions/favorites${buildQuery(params)}`,
      ).then((r) => r),
    report: (body: { target_type: string; target_id: string; reason: string; detail?: string }) =>
      call<{ id: string; status: string }>('/interactions/reports', {
        method: 'POST',
        body: json(body),
      }).then((r) => r.data),
  },

  // ---------------------------------------------------------------- 聊天
  chat: {
    rooms: () => call<RoomItem[]>('/chat/rooms').then((r) => r),
    room: (id: string) => call<RoomItem>(`/chat/rooms/${id}`).then((r) => r.data),
    createRoom: (body: Record<string, unknown>) =>
      call<RoomItem>('/chat/rooms', { method: 'POST', body: json(body) }).then((r) => r.data),
    direct: (userId: string) =>
      call<RoomItem>(`/chat/direct/${userId}`, { method: 'POST' }).then((r) => r.data),
    updateRoom: (id: string, body: Record<string, unknown>) =>
      call<RoomItem>(`/chat/rooms/${id}`, { method: 'PATCH', body: json(body) }).then((r) => r.data),
    join: (id: string) => call(`/chat/rooms/${id}/join`, { method: 'POST' }),
    leave: (id: string) => call<void>(`/chat/rooms/${id}/leave`, { method: 'POST' }),
    messages: (roomId: string, params?: Record<string, unknown>) =>
      call<MessageItem[]>(`/chat/rooms/${roomId}/messages${buildQuery(params)}`).then((r) => r),
    send: (roomId: string, body: Record<string, unknown>) =>
      call<MessageItem>(`/chat/rooms/${roomId}/messages`, { method: 'POST', body: json(body) }).then(
        (r) => r.data,
      ),
    read: (roomId: string, seq: number) =>
      call(`/chat/rooms/${roomId}/read`, { method: 'POST', body: json({ seq }) }),
    members: (roomId: string) =>
      call<{ user: UserBrief; role: string; is_muted: boolean; joined_at: string }[]>(
        `/chat/rooms/${roomId}/members`,
      ).then((r) => r.data),
    addMembers: (roomId: string, user_ids: string[]) =>
      call<{ added: number; member_count: number }>(`/chat/rooms/${roomId}/members`, {
        method: 'POST',
        body: json({ user_ids }),
      }).then((r) => r.data),
    removeMember: (roomId: string, userId: string) =>
      call<void>(`/chat/rooms/${roomId}/members/${userId}`, { method: 'DELETE' }),
    unread: () =>
      call<{ total: number; rooms: { room_id: string; unread: number }[] }>('/chat/unread').then(
        (r) => r.data,
      ),
    recall: (roomId: string, messageId: string) =>
      call(`/chat/rooms/${roomId}/messages/${messageId}/recall`, { method: 'POST' }),
  },

  // ---------------------------------------------------------------- 通知
  notifications: {
    list: (params?: Record<string, unknown>) =>
      call<NotificationItem[]>(`/notifications${buildQuery(params)}`).then((r) => r),
    unread: () => call<{ unread: number }>('/notifications/unread-count').then((r) => r.data),
    read: (ids?: string[]) =>
      call('/notifications/read', { method: 'POST', body: json({ ids }) }),
    remove: (id: string) => call<void>(`/notifications/${id}`, { method: 'DELETE' }),
    cleanup: () => call('/notifications/cleanup', { method: 'POST' }),
  },

  // ---------------------------------------------------------------- 上传
  uploads: {
    image: (file: File, albumId?: string | null) => {
      const form = new FormData()
      form.append('file', file)
      if (albumId) form.append('album_id', albumId)
      return call<MediaItem>('/uploads/image', { method: 'POST', body: form }).then((r) => r.data)
    },
    attachment: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return call<Attachment>('/uploads/attachment', { method: 'POST', body: form }).then(
        (r) => r.data,
      )
    },
    quota: () =>
      call<{ used_bytes: number; total_bytes: number; remaining_bytes: number }>('/uploads/quota').then(
        (r) => r.data,
      ),
    large: async (file: File, albumId?: string | null, onProgress?: (ratio: number) => void) => {
      const init = await call<{
        upload_id: string
        chunk_size: number
        chunks: number
        upload_url: string
        complete_url: string
      }>('/uploads/init', {
        method: 'POST',
        body: json({ filename: file.name, size: file.size, mime: file.type, album_id: albumId }),
      }).then((r) => r.data)

      for (let index = 0; index < init.chunks; index += 1) {
        const start = index * init.chunk_size
        const blob = file.slice(start, Math.min(start + init.chunk_size, file.size))
        const response = await raw(`/uploads/${init.upload_id}/chunk/${index}`, {
          method: 'PUT',
          body: blob,
        })
        if (!response.ok) throw new ApiError('分片上传失败，请检查网络', response.status, 'UPLOAD_CHUNK')
        onProgress?.((index + 1) / init.chunks)
      }

      return call<{ media_id: string; status: string }>(
        `/uploads/${init.upload_id}/complete`,
        { method: 'POST' },
      ).then((r) => r.data)
    },
  },

  // ---------------------------------------------------------------- 后台
  admin: {
    dashboard: () => call<Record<string, number>>('/admin/dashboard').then((r) => r.data),
    storage: () => call<Record<string, number | string>>('/admin/storage').then((r) => r.data),
    settings: () => call<SettingItem[]>('/admin/settings').then((r) => r.data),
    updateSettings: (items: { key: string; value: unknown }[]) =>
      call<{ updated: string[] }>('/admin/settings', {
        method: 'PATCH',
        body: json({ items }),
      }).then((r) => r.data),
    users: (params?: Record<string, unknown>) =>
      call<AdminUser[]>(`/admin/users${buildQuery(params)}`).then((r) => r),
    approve: (id: string, role?: string) =>
      call<AdminUser>(`/admin/users/${id}/approve`, { method: 'POST', body: json({ role }) }).then(
        (r) => r.data,
      ),
    reject: (id: string, reason?: string) =>
      call<AdminUser>(`/admin/users/${id}/reject`, { method: 'POST', body: json({ reason }) }).then(
        (r) => r.data,
      ),
    setRole: (id: string, role: string) =>
      call<AdminUser>(`/admin/users/${id}/role`, { method: 'POST', body: json({ role }) }).then(
        (r) => r.data,
      ),
    setStatus: (id: string, status: string) =>
      call<AdminUser>(`/admin/users/${id}/status`, { method: 'POST', body: json({ status }) }).then(
        (r) => r.data,
      ),
    resetPassword: (id: string, new_password?: string) =>
      call<{ user_id: string; password: string }>(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: json({ new_password }),
      }).then((r) => r.data),
    batchApprove: (ids: string[]) =>
      call<{ approved: number }>('/admin/users/batch-approve', {
        method: 'POST',
        body: json({ ids }),
      }).then((r) => r.data),
    removeUser: (id: string) => call<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    invites: () => call<InviteItem[]>('/admin/invites').then((r) => r.data),
    createInvite: (body: Record<string, unknown>) =>
      call<InviteItem>('/admin/invites', { method: 'POST', body: json(body) }).then((r) => r.data),
    disableInvite: (id: string) =>
      call<InviteItem>(`/admin/invites/${id}/disable`, { method: 'POST' }).then((r) => r.data),
    deleteInvite: (id: string) => call<void>(`/admin/invites/${id}`, { method: 'DELETE' }),
    pending: () =>
      call<{ posts: PostItem[]; comments: CommentItem[] }>('/admin/moderation/pending').then(
        (r) => r.data,
      ),
    reviewPost: (id: string, action: 'approve' | 'reject', note?: string) =>
      call(`/admin/posts/${id}/review`, { method: 'POST', body: json({ action, note }) }),
    reviewComment: (id: string, action: 'approve' | 'reject', note?: string) =>
      call(`/admin/comments/${id}/review`, { method: 'POST', body: json({ action, note }) }),
    reports: (params?: Record<string, unknown>) =>
      call<ReportItem[]>(`/admin/reports${buildQuery(params)}`).then((r) => r),
    resolveReport: (id: string, action: 'hide' | 'ignore' | 'warn', note?: string) =>
      call(`/admin/reports/${id}/resolve`, { method: 'POST', body: json({ action, note }) }),
    words: () =>
      call<{ id: string; word: string; level: number; created_at: string }[]>('/admin/sensitive-words').then(
        (r) => r.data,
      ),
    addWord: (word: string, level: number) =>
      call('/admin/sensitive-words', { method: 'POST', body: json({ word, level }) }),
    deleteWord: (id: string) => call<void>(`/admin/sensitive-words/${id}`, { method: 'DELETE' }),
    auditLogs: (params?: Record<string, unknown>) =>
      call<AuditLogItem[]>(`/admin/audit-logs${buildQuery(params)}`).then((r) => r),
    recount: () => call<{ fixed: number }>('/admin/maintenance/recount', { method: 'POST' }).then((r) => r.data),
    cleanupStaging: () =>
      call<{ removed: number }>('/admin/maintenance/cleanup-staging', { method: 'POST' }).then((r) => r.data),
  },
}
