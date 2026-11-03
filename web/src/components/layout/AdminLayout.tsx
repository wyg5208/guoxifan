import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { BrandMark } from '@/components/layout/SiteHeader'
import { ADMIN_NAV } from '@/components/layout/nav'
import { Avatar } from '@/components/ui/Display'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'

import { ScrollToTop } from './SiteLayout'

export function AdminLayout() {
  const user = useAuth((state) => state.user)
  const location = useLocation()

  const pending = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: api.admin.dashboard,
    refetchInterval: 120_000,
    retry: false,
  })

  const badge = (to: string): number | null => {
    const data = pending.data
    if (!data) return null
    if (to === '/admin/users') return data.users_pending || null
    if (to === '/admin/moderation') {
      const total = (data.posts_pending ?? 0) + (data.comments_pending ?? 0) + (data.reports_pending ?? 0)
      return total || null
    }
    return null
  }

  return (
    <div className="flex min-h-dvh bg-paper">
      <ScrollToTop />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line/80 bg-[#fffdf9] lg:flex">
        <div className="border-b border-line/70 px-4 py-4">
          <BrandMark />
          <div className="mt-3 text-[10.5px] uppercase tracking-[0.26em] text-clay/70">管理后台</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
          {ADMIN_NAV.map((item) => {
            const count = badge(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors',
                    isActive ? 'bg-clay/10 text-clay-deep' : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
                  )
                }
              >
                <item.icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {count ? (
                  <span className="rounded-full bg-danger/10 px-1.5 text-[10px] font-semibold leading-4 text-danger">
                    {count}
                  </span>
                ) : null}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-line/70 px-3 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-ink-mute transition-colors hover:text-ink"
          >
            ← 回到站点
          </Link>
          <div className="mt-2 flex items-center gap-2 px-1">
            <Avatar src={user?.avatar_url} name={user?.nickname} size="xs" />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] text-ink">{user?.nickname}</div>
              <div className="text-[10.5px] text-ink-mute">{user?.role}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/70 bg-paper/90 px-4 backdrop-blur-md lg:hidden">
          <BrandMark />
          <span className="ml-auto text-[11px] uppercase tracking-[0.22em] text-clay/70">后台</span>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-line/70 bg-[#fffdf9] px-3 py-1.5 no-scrollbar lg:hidden">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px]',
                  isActive ? 'bg-clay/10 text-clay-deep' : 'text-ink-soft',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        <main key={location.pathname} className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
