import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, MessageSquare, Trash2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button, buttonClass } from '@/components/ui/Button'
import { EmptyState, PageHeader, PageLoading } from '@/components/ui/Display'
import { api } from '@/lib/api'
import type { NotificationItem } from '@/lib/types'
import { cn, formatRelative } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const TYPE_ICONS: Record<string, typeof Bell> = {
  comment: MessageSquare,
  reply: MessageSquare,
  like: Bell,
  favorite: Bell,
  user_approved: UserPlus,
  user_rejected: UserPlus,
  system: Bell,
}

function NotificationRow({
  item,
  onRead,
  onRemove,
}: {
  item: NotificationItem
  onRead: (id: string) => void
  onRemove: (id: string) => void
}) {
  const Icon = TYPE_ICONS[item.type] ?? Bell
  const body = (
    <>
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
          item.is_read ? 'bg-paper-3/70 text-ink-mute' : 'bg-clay/12 text-clay-deep',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[13.5px]', item.is_read ? 'text-ink-soft' : 'text-ink')}>
            {item.title}
          </span>
          <span className="ml-auto shrink-0 text-[10.5px] text-ink-mute">
            {formatRelative(item.created_at)}
          </span>
        </span>
        {item.body && (
          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-ink-mute">{item.body}</span>
        )}
      </span>
      {!item.is_read && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />}
    </>
  )

  return (
    <div className="group flex items-start gap-2">
      {item.link ? (
        <Link
          to={item.link}
          onClick={() => onRead(item.id)}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-paper-2/70"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-2.5 px-2 py-2.5">{body}</div>
      )}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label="删掉这条通知"
        title="删掉"
        className="mt-2 rounded-full p-1 text-ink-mute/60 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

export function NotificationsPage() {
  const user = useAuth((state) => state.user)
  const ready = useAuth((state) => state.ready)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list({ limit: 30 }).then((result) => result.data),
    enabled: Boolean(user),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] })
  }

  const markAll = useMutation({
    mutationFn: () => api.notifications.read(),
    onSuccess: () => {
      refresh()
      toast.success('都看过了')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const markOne = async (id: string) => {
    try {
      await api.notifications.read([id])
      refresh()
    } catch {
      // 单条已读失败不打扰用户
    }
  }

  const remove = async (id: string) => {
    try {
      await api.notifications.remove(id)
      refresh()
    } catch (error) {
      toast.error(describeError(error, '删不掉这条'))
    }
  }

  if (!ready) return <PageLoading label="正在收信…" />

  if (!user) {
    return (
      <EmptyState
        title="要先登录"
        description="通知都在自己名下，登录后就能看到。"
        action={
          <Link to="/login?next=%2Fnotifications" className={buttonClass('primary', 'md')}>
            去登录
          </Link>
        }
        className="py-24"
      />
    )
  }

  const items = query.data ?? []
  const unread = items.filter((item) => !item.is_read).length

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="消息"
        description={unread > 0 ? `有 ${unread} 条还没看。` : '都看过了。'}
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="size-3.5" />}
            loading={markAll.isPending}
            disabled={unread === 0}
            onClick={() => markAll.mutate()}
          >
            全部标为已读
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-paper-3/70" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-6" />}
          title="还没有消息"
          description="有人评论、回复你，或者你的申请通过了，都会在这里说一声。"
          action={
            <Link to="/" className={buttonClass('outline', 'sm')}>
              回首页
            </Link>
          }
        />
      ) : (
        <div className="divide-y divide-line/60 rounded-card border border-line bg-[#fcf8f0] px-2 py-1 shadow-soft">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onRead={markOne} onRemove={remove} />
          ))}
        </div>
      )}
    </div>
  )
}
