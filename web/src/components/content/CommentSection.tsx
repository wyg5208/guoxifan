import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Avatar, EmptyState, Skeleton } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Form'
import { api } from '@/lib/api'
import type { CommentItem } from '@/lib/types'
import { cn, formatRelative } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

import type { TargetType } from './InteractionBar'

function CommentRow({
  comment,
  targetType,
  targetId,
  onReply,
  depth = 0,
}: {
  comment: CommentItem
  targetType: TargetType
  targetId: string
  onReply: (parent: CommentItem) => void
  depth?: number
}) {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => api.interactions.removeComment(comment.id),
    onSuccess: () => {
      toast.success('留言已删除')
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const canRemove = user && (user.id === comment.author?.id || user.permissions.is_staff)

  return (
    <div className={cn('flex gap-2.5', depth > 0 && 'ml-9 mt-3')}>
      <Avatar src={comment.author?.avatar_url} name={comment.author?.nickname} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink">{comment.author?.nickname ?? '匿名村民'}</span>
          <span className="text-[11px] text-ink-mute">{formatRelative(comment.created_at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-soft">
          {comment.content}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-mute">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="transition-colors hover:text-clay-deep"
          >
            回应
          </button>
          {canRemove &&
            (confirming ? (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => remove.mutate()}
                  className="text-danger hover:underline"
                  disabled={remove.isPending}
                >
                  确认删除
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="hover:text-ink">
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-0.5 transition-colors hover:text-danger"
                aria-label="删除留言"
              >
                <Trash2 className="size-3" />
              </button>
            ))}
        </div>

        {comment.replies?.map((reply) => (
          <CommentRow
            key={reply.id}
            comment={reply}
            targetType={targetType}
            targetId={targetId}
            onReply={onReply}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  )
}

export function CommentSection({
  targetType,
  targetId,
  title = '留言',
}: {
  targetType: TargetType
  targetId: string
  title?: string
}) {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)

  const query = useQuery({
    queryKey: ['comments', targetType, targetId],
    queryFn: () => api.interactions.comments(targetType, targetId).then((r) => r.data),
  })

  const submit = useMutation({
    mutationFn: () =>
      api.interactions.comment({
        target_type: targetType,
        target_id: targetId,
        content: content.trim(),
        parent_id: replyTo?.id,
      }),
    onSuccess: () => {
      setContent('')
      setReplyTo(null)
      toast.success('留言已发出')
      queryClient.invalidateQueries({ queryKey: ['comments', targetType, targetId] })
      queryClient.invalidateQueries({ queryKey: ['post', targetId] })
      queryClient.invalidateQueries({ queryKey: ['media', targetId] })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const total = (query.data ?? []).reduce((sum, item) => sum + 1 + (item.replies?.length ?? 0), 0)

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="font-serif text-lg text-ink">{title}</h3>
        {total > 0 && <span className="text-[12px] text-ink-mute">{total} 条</span>}
      </div>

      {user ? (
        <div className="card-surface mb-6 p-3.5">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-paper-2 px-2.5 py-1.5 text-[12px] text-ink-soft">
              <span>回应 {replyTo.author?.nickname}：{replyTo.content.slice(0, 24)}…</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-ink-mute hover:text-ink">
                取消
              </button>
            </div>
          )}
          <div className="flex gap-2.5">
            <Avatar src={user.avatar_url} name={user.nickname} size="sm" />
            <div className="flex-1">
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={replyTo ? '说点什么…' : '留一句话，给以后的人看'}
                className="border-transparent bg-paper-2/60 focus:border-clay focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-ink-mute">{content.length}/1000</span>
                <Button
                  size="sm"
                  loading={submit.isPending}
                  disabled={!content.trim()}
                  onClick={() => submit.mutate()}
                >
                  发出
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-surface mb-6 px-4 py-3 text-[13px] text-ink-mute">
          登录后可以留言。不着急，慢慢看。
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((key) => (
            <div key={key} className="flex gap-2.5">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-5">
          {query.data.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              targetType={targetType}
              targetId={targetId}
              onReply={(parent) => {
                setReplyTo(parent)
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="还没有人说话" description="第一句话，往往最难开口。" className="py-10" />
      )}
    </section>
  )
}
