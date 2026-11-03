import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import { api } from '@/lib/api'
import { formatCount } from '@/lib/utils'

import { MobileTabBar, SiteHeader } from './SiteHeader'

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])
  return null
}

function SiteFooter() {
  const config = useQuery({ queryKey: ['site-config'], queryFn: api.site.config, staleTime: 300_000 })
  const stats = useQuery({ queryKey: ['site-stats'], queryFn: api.site.stats, staleTime: 300_000 })
  const site = config.data?.site ?? {}

  const years =
    site.founded_year && site.demolition_date
      ? `${site.founded_year} — ${String(site.demolition_date).slice(0, 4)}`
      : site.founded_year
        ? `始于 ${site.founded_year}`
        : ''

  return (
    <footer className="mt-16 border-t border-line/80 bg-paper-2/50">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2">
              <span className="font-serif text-[15px] tracking-[0.14em] text-ink">
                {(site.title || '过溪畈 · 老村记忆').split(/[·・|]/)[0].trim()}
              </span>
              <span className="flex size-[15px] items-center justify-center rounded-[2px] bg-red-paper font-serif text-[9px] leading-none text-paper/95">
                畈
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
              {site.footer_text || '留住记忆，就是留住我们自己的来处。'}
            </p>
            {years && <p className="mt-2 font-serif text-[12.5px] tracking-wider text-clay/80">{years}</p>}
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6 text-[12.5px]">
            <div className="space-y-2">
              <div className="mb-1 text-[10.5px] uppercase tracking-[0.24em] text-clay/70">逛逛</div>
              {[
                { to: '/albums', label: '老照片' },
                { to: '/articles', label: '村里的事' },
                { to: '/shorts', label: '三言两语' },
                { to: '/timeline', label: '村史年表' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="block text-ink-mute transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="space-y-2">
              <div className="mb-1 text-[10.5px] uppercase tracking-[0.24em] text-clay/70">找找</div>
              {[
                { to: '/villagers', label: '村民名录' },
                { to: '/families', label: '各家各户' },
                { to: '/chat', label: '村口聊天' },
                { to: '/admin', label: '管理后台' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="block text-ink-mute transition-colors hover:text-ink">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-line/60 pt-5 text-[11.5px] text-ink-mute sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {stats.data && (
              <>
                <span>{formatCount(stats.data.media)} 张照片与影像</span>
                <span className="text-line">·</span>
                <span>{formatCount(stats.data.posts)} 篇文章</span>
                <span className="text-line">·</span>
                <span>{formatCount(stats.data.villagers)} 位村民</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {site.icp && (
              <a
                href="https://beian.miit.gov.cn"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-ink"
              >
                {site.icp}
              </a>
            )}
            <span className="text-ink-mute/70">愿记忆长存</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

export function SiteLayout() {
  return (
    <div className="paper-grain flex min-h-dvh flex-col">
      <ScrollToTop />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        <Outlet />
      </main>
      <SiteFooter />
      <div className="h-14 lg:hidden" aria-hidden />
      <MobileTabBar />
    </div>
  )
}
