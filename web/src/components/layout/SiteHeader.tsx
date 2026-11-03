import { useQuery } from '@tanstack/react-query'
import { Bell, LogIn, Menu, Search, Settings, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/ui/Display'
import { buttonClass } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { isStaff, useAuth } from '@/store/auth'

import { NAV_ITEMS } from './nav'

export function BrandMark({ className }: { className?: string }) {
  const config = useQuery({ queryKey: ['site-config'], queryFn: api.site.config, staleTime: 300_000 })
  const title = config.data?.site.title || '过溪畈 · 老村记忆'
  // Logo 构成（docs/08）：主词 + 右侧褪色红印，印内白字「畈」
  const wordmark = title.split(/[·・|]/)[0].trim() || '过溪畈'
  const subtitle = config.data?.site.subtitle || '过了溪，就是田畈。'

  return (
    <Link to="/" className={cn('group flex flex-col items-start gap-1', className)} aria-label={title}>
      <span className="flex items-baseline gap-1.5">
        <span className="font-serif text-[17.5px] tracking-[0.18em] text-ink transition-colors duration-300 group-hover:text-clay-deep">
          {wordmark}
        </span>
        <span
          className="flex size-[18px] items-center justify-center rounded-[3px] bg-red-paper font-serif text-[10px] leading-none text-paper/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] transition-transform duration-300 ease-soft group-hover:-rotate-3"
          aria-hidden
        >
          畈
        </span>
      </span>
      <span className="hidden max-w-[15rem] truncate text-[10.5px] leading-none tracking-wide text-ink-mute sm:block">
        {subtitle}
      </span>
    </Link>
  )
}

function useUnread() {
  const user = useAuth((state) => state.user)
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: api.notifications.unread,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    retry: false,
  })
  return data?.unread ?? 0
}

export function DesktopNav() {
  return (
    <nav className="hidden items-center gap-0.5 lg:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cn(
              'relative rounded-lg px-3 py-1.5 text-[13.5px] tracking-wide transition-colors duration-200',
              isActive ? 'text-clay-deep' : 'text-ink-soft hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              {item.label}
              {isActive && (
                <span className="absolute inset-x-3 -bottom-0.5 h-px bg-clay/70" aria-hidden />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function UserMenu() {
  const user = useAuth((state) => state.user)
  const logout = useAuth((state) => state.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!user) {
    return (
      <Link to="/login" className={buttonClass('primary', 'sm', 'gap-1.5')}>
        <LogIn className="size-3.5" />
        进门
      </Link>
    )
  }

  const items = [
    { to: '/me', label: '个人中心', icon: User },
    { to: '/notifications', label: '我的消息', icon: Bell },
    ...(isStaff(user) ? [{ to: '/admin', label: '管理后台', icon: Settings }] : []),
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-line bg-white/60 py-1 pl-1 pr-2.5 transition-colors hover:border-clay/50"
      >
        <Avatar src={user.avatar_url} name={user.nickname} size="xs" />
        <span className="max-w-[6rem] truncate text-[13px] text-ink-soft">{user.nickname}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-xl border border-line bg-[#fffdf9] py-1 shadow-lift">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await logout()
              navigate('/')
            }}
            className="flex w-full items-center gap-2.5 border-t border-line/70 px-3.5 py-2 text-[13px] text-ink-mute transition-colors hover:bg-paper-2 hover:text-danger"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

export function SiteHeader() {
  const unread = useUnread()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <BrandMark />

        <div className="ml-auto flex items-center gap-1.5">
          <DesktopNav />
          <span className="mx-2 hidden h-5 w-px bg-line lg:block" />
          <Link
            to="/search"
            aria-label="搜索"
            className="rounded-full p-2 text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Search className="size-4" />
          </Link>
          <Link
            to="/notifications"
            aria-label="消息"
            className="relative rounded-full p-2 text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-[14px] text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          <div className="hidden sm:block">
            <UserMenu />
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="菜单"
            className="rounded-full p-2 text-ink-mute transition-colors hover:bg-paper-2 hover:text-ink lg:hidden"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-line/70 bg-paper px-4 pb-3 pt-2 lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                    isActive ? 'bg-clay/10 text-clay-deep' : 'text-ink-soft',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="mt-2 border-t border-line/70 pt-2">
            <UserMenu />
          </div>
        </div>
      )}
    </header>
  )
}

export function MobileTabBar() {
  const unread = useUnread()
  const user = useAuth((state) => state.user)

  const tabs = [
    ...NAV_ITEMS.filter((item) => item.mobile),
    { to: unread > 0 ? '/notifications' : '/me', label: user ? '我的' : '进门', icon: unread > 0 ? Bell : User },
  ]

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-paper/95 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] transition-colors',
                isActive ? 'text-clay-deep' : 'text-ink-mute',
              )
            }
          >
            <tab.icon className="size-[18px]" />
            <span className="tracking-wide">{tab.label}</span>
            {tab.label === '我的' && unread > 0 && (
              <span className="absolute right-[22%] top-1.5 size-1.5 rounded-full bg-danger" />
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
