import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pin, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { CommentSection } from '@/components/content/CommentSection'
import { InteractionBar } from '@/components/content/InteractionBar'
import { Button, buttonClass } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, PageLoading } from '@/components/ui/Display'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import { formatDate, formatCount, renderMarkdown } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

export function ArticleDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const query = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.posts.get(id),
    enabled: Boolean(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['post', id] })
    queryClient.invalidateQueries({ queryKey: ['posts'] })
    queryClient.invalidateQueries({ queryKey: ['home'] })
  }

  const pin = useMutation({
    mutationFn: () => api.posts.pin(id),
    onSuccess: () => {
      toast.success('已切换置顶')
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const feature = useMutation({
    mutationFn: () => api.posts.feature(id),
    onSuccess: () => {
      toast.success('已切换推荐')
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const remove = useMutation({
    mutationFn: () => api.posts.remove(id),
    onSuccess: () => {
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      navigate('/articles', { replace: true })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  if (query.isLoading) return <PageLoading label="正在展开这一页…" />
  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="这一页找不到了"
        description="也许作者把它收起来了。"
        action={
          <Link to="/articles" className={buttonClass('outline', 'sm')}>
            回文章列表
          </Link>
        }
      />
    )
  }

  const post = query.data
  const isShort = post.kind === 'short'
  const cover = mediaUrl(post.cover_url || '')
  const canManage = user && (user.permissions.is_staff || user.id === post.author_id)

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        to={isShort ? '/shorts' : '/articles'}
        className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        {isShort ? '回短句' : '回文章列表'}
      </Link>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          {post.category && <Badge tone="clay">{post.category}</Badge>}
          {post.is_pinned && (
            <Badge tone="moss">
              <Pin className="size-2.5" />
              置顶
            </Badge>
          )}
          {post.is_featured && (
            <Badge tone="moss">
              <Sparkles className="size-2.5" />
              推荐
            </Badge>
          )}
          {post.status === 'pending' && <Badge tone="neutral">待审核</Badge>}
          {post.visibility === 'member' && <Badge tone="neutral">仅村民可见</Badge>}
        </div>

        <h1 className="mt-3 text-balance font-serif text-[27px] leading-[1.35] tracking-wide text-ink sm:text-[34px]">
          {post.title || (isShort ? '三言两语' : '无题')}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-line/70 pb-5 text-[12px] text-ink-mute">
          <span className="flex items-center gap-2">
            <Avatar src={post.author?.avatar_url} name={post.author?.nickname} size="xs" />
            <span className="text-ink-soft">{post.author?.nickname ?? '村民'}</span>
          </span>
          <span>{formatDate(post.published_at || post.created_at, true)}</span>
          <span>{formatCount(post.view_count)} 次阅读</span>
          {canManage && (
            <span className="ml-auto flex items-center gap-1">
              {user?.permissions.is_staff && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => pin.mutate()} loading={pin.isPending}>
                    置顶
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => feature.mutate()} loading={feature.isPending}>
                    推荐
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            </span>
          )}
        </div>
      </header>

      {cover && !isShort && (
        <figure className="mt-6 overflow-hidden rounded-card border border-line">
          <img src={cover} alt={post.title ?? ''} className="max-h-[420px] w-full object-cover" />
        </figure>
      )}

      <div className="mt-7">
        {isShort ? (
          <blockquote className="border-l-2 border-clay/40 pl-5 font-serif text-[19px] leading-[2] text-ink/90">
            <p className="whitespace-pre-wrap">{post.content}</p>
          </blockquote>
        ) : post.content_html ? (
          <div className="village-prose" dangerouslySetInnerHTML={{ __html: post.content_html }} />
        ) : (
          <div className="village-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />
        )}
      </div>

      {post.images && post.images.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {post.images.map((image) => (
            <a
              key={image}
              href={mediaUrl(image)}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-xl border border-line"
            >
              <img src={mediaUrl(image)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {post.tags && post.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              to={`/search?q=${encodeURIComponent(tag)}`}
              className="rounded-full bg-paper-2 px-2.5 py-1 text-[11.5px] text-ink-soft transition-colors hover:bg-clay/10 hover:text-clay-deep"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between border-y border-line/70 py-3">
        <InteractionBar targetType="post" targetId={post.id} stats={post} />
        <span className="text-[11.5px] text-ink-mute">
          {formatCount(post.favorite_count)} 人收藏
        </span>
      </div>

      <CommentSection targetType="post" targetId={post.id} title="说说你的记忆" />

      <ConfirmDialog
        open={confirmDelete}
        title="确定删掉这一篇？"
        description="删掉之后，别人就看不到了。"
        danger
        loading={remove.isPending}
        confirmText="删掉"
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </article>
  )
}
