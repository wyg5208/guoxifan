import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { api, onTokenRefreshed, onUnauthenticated, setAuthTokens } from '@/lib/api'
import { socket } from '@/lib/socket'
import type { Tokens, UserSelf } from '@/lib/types'

const NO_PERMISSIONS = { can_write: false, is_staff: false, is_admin: false, is_super: false }

/** 老版本缓存里可能没有 permissions，补齐后再交给组件，避免一进来就报错。 */
function normalizeUser(user: UserSelf | null): UserSelf | null {
  if (!user) return null
  return user.permissions ? user : { ...user, permissions: NO_PERMISSIONS }
}

export interface RegisterPayload {
  email?: string
  phone?: string
  password: string
  nickname: string
  invite_code?: string
  villager?: { name: string; family_id?: string | null; relation_to_head?: string | null }
}

export interface RegisterResult {
  message: string
  status: string
  auto_approved: boolean
}

interface AuthState {
  user: UserSelf | null
  accessToken: string | null
  refreshToken: string | null
  /** 首次会话恢复是否结束，避免路由守卫闪跳 */
  ready: boolean
  login: (account: string, password: string) => Promise<UserSelf>
  register: (payload: RegisterPayload) => Promise<RegisterResult>
  logout: () => Promise<void>
  restore: () => Promise<void>
  refreshMe: () => Promise<UserSelf | null>
  patchUser: (patch: Partial<UserSelf>) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      ready: false,

      async login(account, password) {
        const result = await api.auth.login(account, password)
        setAuthTokens(result.access_token, result.refresh_token)
        const user = normalizeUser(result.user) as UserSelf
        set({
          user,
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          ready: true,
        })
        socket.connect(result.access_token)
        return user
      },

      async register(payload) {
        const result = await api.auth.register(payload)
        setAuthTokens(result.access_token, result.refresh_token)
        set({ accessToken: result.access_token, refreshToken: result.refresh_token })
        const me = await api.auth.me().catch(() => null)
        set({ user: normalizeUser(me), ready: true })
        socket.connect(result.access_token)
        return { message: result.message, status: result.status, auto_approved: result.auto_approved }
      },

      async logout() {
        const token = get().refreshToken
        try {
          if (token) await api.auth.logout(token)
        } catch {
          // 退出失败不阻塞本地清理
        }
        socket.disconnect()
        setAuthTokens(null, null)
        set({ user: null, accessToken: null, refreshToken: null, ready: true })
      },

      async restore() {
        const { accessToken, refreshToken } = get()
        setAuthTokens(accessToken, refreshToken)
        if (!accessToken) {
          set({ ready: true })
          return
        }
        try {
          const user = await api.auth.me()
          set({ user: normalizeUser(user), ready: true })
          socket.connect(accessToken)
        } catch {
          set({ user: null, ready: true })
        }
      },

      async refreshMe() {
        try {
          const user = normalizeUser(await api.auth.me())
          set({ user })
          return user
        } catch {
          return null
        }
      },

      patchUser(patch) {
        const current = get().user
        if (!current) return
        set({ user: { ...current, ...patch } })
      },
    }),
    {
      name: 'village-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          setAuthTokens(state.accessToken, state.refreshToken)
        }
        if (state) state.user = normalizeUser(state.user)
      },
    },
  ),
)

// 静默续期成功后同步 token，避免刷新页面后过期
onTokenRefreshed((tokens: Tokens) => {
  useAuth.setState({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
})

// token 失效 → 清空本地会话
onUnauthenticated(() => {
  socket.disconnect()
  setAuthTokens(null, null)
  useAuth.setState({ user: null, accessToken: null, refreshToken: null })
})

export const isStaff = (user: UserSelf | null) => Boolean(user?.permissions?.is_staff)
export const isAdmin = (user: UserSelf | null) => Boolean(user?.permissions?.is_admin)
export const canWrite = (user: UserSelf | null) => Boolean(user?.permissions?.can_write)
