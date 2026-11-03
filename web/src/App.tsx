import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

import { RequireAuth } from '@/components/RequireAuth'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { SiteLayout } from '@/components/layout/SiteLayout'
import { AlbumDetailPage } from '@/pages/AlbumDetailPage'
import { AlbumsPage } from '@/pages/AlbumsPage'
import { ArticleDetailPage } from '@/pages/ArticleDetailPage'
import { ArticlesPage } from '@/pages/ArticlesPage'
import { FamiliesPage } from '@/pages/FamiliesPage'
import { FamilyDetailPage } from '@/pages/FamilyDetailPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RegisterPage } from '@/pages/RegisterPage'
import { SearchPage } from '@/pages/SearchPage'
import { ShortsPage } from '@/pages/ShortsPage'
import { TimelinePage } from '@/pages/TimelinePage'
import { VillagerDetailPage } from '@/pages/VillagerDetailPage'
import { VillagersPage } from '@/pages/VillagersPage'

// 后台与聊天拆包：普通访客不必为管理员的界面付流量
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const AdminDashboard = lazy(() =>
  import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
)
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })))
const AdminModeration = lazy(() =>
  import('@/pages/admin/AdminModeration').then((m) => ({ default: m.AdminModeration })),
)
const AdminSettings = lazy(() =>
  import('@/pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })),
)
const AdminInvites = lazy(() =>
  import('@/pages/admin/AdminInvites').then((m) => ({ default: m.AdminInvites })),
)

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="albums" element={<AlbumsPage />} />
        <Route path="albums/:id" element={<AlbumDetailPage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="p/:id" element={<ArticleDetailPage />} />
        <Route path="articles/:id" element={<ArticleDetailPage />} />
        <Route path="shorts" element={<ShortsPage />} />
        <Route path="timeline" element={<TimelinePage />} />
        <Route path="villagers" element={<VillagersPage />} />
        <Route path="villagers/:id" element={<VillagerDetailPage />} />
        <Route path="families" element={<FamiliesPage />} />
        <Route path="families/:id" element={<FamilyDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route
          path="notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="me"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth staff>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="moderation" element={<AdminModeration />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="invites" element={<AdminInvites />} />
      </Route>
    </Routes>
  )
}
