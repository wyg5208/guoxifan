import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Database,
  FileText,
  HardDrive,
  Images,
  MessageSquare,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button, buttonClass } from '@/components/ui/Button'
import { PageHeader, SectionTitle, Spinner } from '@/components/ui/Display'
import { api } from '@/lib/api'
import { cn, formatBytes, formatCount } from '@/lib/utils'
import { describeError, toast } from '@/store/toast'

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: number | undefined
  hint?: string
}) {
  return (
    <div className="rounded-card border border-line bg-[#fcf8f0] px-4 py-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-clay/80">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-serif text-[26px] leading-none text-ink">
        {value === undefined ? '—' : formatCount(value)}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-ink-mute">{hint}</div>}
    </div>
  )
}

function QueueCard({
  to,
  title,
  count,
  description,
  icon,
  tone = 'clay',
}: {
  to: string
  title: string
  count: number
  description: string
  icon: ReactNode
  tone?: 'clay' | 'danger'
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-start gap-3 rounded-card border px-4 py-4 transition-all duration-300 ease-soft hover:-translate-y-0.5',
        count > 0
          ? tone === 'danger'
            ? 'border-danger/30 bg-danger/[0.04]'
            : 'border-clay/30 bg-clay/[0.05]'
          : 'border-line bg-white/50',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          count > 0 ? (tone === 'danger' ? 'bg-danger/12 text-danger' : 'bg-clay/12 text-clay-deep') : 'bg-paper-3/70 text-ink-mute',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-[14.5px] text-ink">{title}</span>
          <span
            className={cn(
              'ml-auto font-serif text-[19px] leading-none',
              count > 0 ? (tone === 'danger' ? 'text-danger' : 'text-clay-deep') : 'text-ink-mute',
            )}
          >
            {count}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-mute">{description}</p>
      </div>
    </Link>
  )
}

export function AdminDashboard() {
  const queryClient = useQueryClient()

  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: api.admin.dashboard })
  const storage = useQuery({ queryKey: ['admin', 'storage'], queryFn: api.admin.storage, retry: false })

  const recount = useMutation({
    mutationFn: api.admin.recount,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success(`重算完成，修正了 ${result.fixed} 处计数`)
    },
    onError: (error) => toast.error(describeError(error, '操作失败')),
  })

  const cleanup = useMutation({
    mutationFn: api.admin.cleanupStaging,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success(`清理完成，移除 ${result.removed} 个临时分片`)
    },
    onError: (error) => toast.error(describeError(error, '操作失败')),
  })

  const stats = dashboard.data ?? {}
  const usedRatio = storage.data
    ? Math.min(
        100,
        Math.round(
          ((Number(storage.data.total_bytes) || 0) / (Number(storage.data.disk_total) || 1)) * 100,
        ),
      )
    : 0

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="总览"
        description="村子现在有多少张照片、多少篇文章，还有哪些事等着处理。"
        action={
          <Button
            variant="outline"
            size="sm"
            icon={dashboard.isFetching ? <Spinner /> : <RefreshCw className="size-3.5" />}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['admin'] })
              dashboard.refetch()
              storage.refetch()
            }}
          >
            刷新
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          icon={<Images className="size-3.5" />}
          label="影像"
          value={stats.media}
          hint={`${formatCount(stats.images ?? 0)} 张照片 · ${formatCount(stats.videos ?? 0)} 段视频`}
        />
        <MetricCard icon={<FileText className="size-3.5" />} label="文章" value={stats.posts} hint="已发布" />
        <MetricCard icon={<Users className="size-3.5" />} label="村民" value={stats.villagers} hint="名录人数" />
        <MetricCard icon={<Users className="size-3.5" />} label="人家" value={stats.families} hint="登记户数" />
        <MetricCard
          icon={<UserPlus className="size-3.5" />}
          label="账号"
          value={stats.users}
          hint={`${formatCount(stats.users_active ?? 0)} 个正常可用`}
        />
        <MetricCard
          icon={<MessageSquare className="size-3.5" />}
          label="待办"
          value={
            (stats.users_pending ?? 0) + (stats.posts_pending ?? 0) + (stats.comments_pending ?? 0) + (stats.reports_open ?? 0)
          }
          hint="加起来要处理"
        />
      </div>

      <SectionTitle eyebrow="Queue" title="等着处理的" className="mb-4 mt-10" />
      <div className="grid gap-3 sm:grid-cols-2">
        <QueueCard
          to="/admin/users"
          title="注册待审核"
          count={stats.users_pending ?? 0}
          description="这些人是村里人还是外人，得有人认一认。"
          icon={<UserPlus className="size-4" />}
        />
        <QueueCard
          to="/admin/moderation"
          title="内容待审核"
          count={(stats.posts_pending ?? 0) + (stats.comments_pending ?? 0)}
          description="文章、短文和评论，通过了才会出现在站上。"
          icon={<FileText className="size-4" />}
        />
        <QueueCard
          to="/admin/moderation?tab=reports"
          title="举报待处理"
          count={stats.reports_open ?? 0}
          description="有人说内容不合适，看一眼再决定。"
          icon={<AlertTriangle className="size-4" />}
          tone="danger"
        />
        <QueueCard
          to="/admin/invites"
          title="邀请码"
          count={0}
          description="走亲访友的时候，发一个邀请码出去。"
          icon={<Database className="size-4" />}
        />
      </div>

      <SectionTitle eyebrow="Storage" title="磁盘与空间" className="mb-4 mt-10" />
      <div className="rounded-card border border-line bg-[#fcf8f0] px-5 py-5">
        {storage.isLoading ? (
          <div className="h-20 animate-pulse rounded-lg bg-paper-3/60" />
        ) : storage.isError || !storage.data ? (
          <p className="text-[12.5px] text-ink-mute">只有管理员能看存储用量。</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-clay/80">站点已用</div>
                <div className="mt-1.5 font-serif text-[24px] text-ink">
                  {formatBytes(Number(storage.data.total_bytes) || 0)}
                </div>
                <div className="mt-1 text-[11.5px] text-ink-mute">
                  影像 {formatBytes(Number(storage.data.media_bytes) || 0)} · 聊天附件{' '}
                  {formatBytes(Number(storage.data.attachment_bytes) || 0)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.18em] text-clay/80">磁盘剩余</div>
                <div className="mt-1.5 font-serif text-[18px] text-ink-soft">
                  {formatBytes(Number(storage.data.disk_free) || 0)}
                </div>
                <div className="mt-1 text-[11px] text-ink-mute">
                  总容量 {formatBytes(Number(storage.data.disk_total) || 0)}
                </div>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-3">
              <div className="h-full rounded-full bg-clay" style={{ width: `${usedRatio}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-mute">
              <span className="inline-flex items-center gap-1">
                <HardDrive className="size-3" />
                {String(storage.data.media_root ?? '媒体目录')}
              </span>
            </div>
          </>
        )}
      </div>

      <SectionTitle eyebrow="Maintenance" title="修修补补" className="mb-4 mt-10" />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<RefreshCw className="size-3.5" />}
          loading={recount.isPending}
          onClick={() => recount.mutate()}
        >
          重算所有计数
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={<Trash2 className="size-3.5" />}
          loading={cleanup.isPending}
          onClick={() => cleanup.mutate()}
        >
          清理未完成的分片
        </Button>
        <Link to="/" className={buttonClass('ghost', 'sm')}>
          回站点看看 →
        </Link>
      </div>
    </div>
  )
}
