import { Link } from 'react-router-dom'

import { Avatar } from '@/components/ui/Display'
import { mediaUrl } from '@/lib/api'
import type { PostItem } from '@/lib/types'
import { cn, excerpt, formatCount, formatRelative, stripHtml } from '@/lib/utils'

function CategoryTag({ category }: { category?: string | null }) {
  if (!category) return null
  return (
    <span className="rounded-full bg-paper-3/80 px-2 py-0.5 text-[10.5px] tracking-wide text-ink-soft">
      {category}
    </span>
  )
}

export function PostCard({ post, variant = 'list' }: { post: PostItem; variant?: 'list' | 'grid' }) {
  const summary = post.summary || excerpt(stripHtml(post.content_html || post.content), 120)
  const cover = mediaUrl(post.cover_url || post.images?.[0] || '')

  if (post.kind === 'short') {
    return (
      <article className="card-surface group px-5 py-4 transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex items-center gap-2 text-[11.5px] text-ink-mute">
          <Avatar src={post.author?.avatar_url} name={post.author?.nickname} size="xs" />
          <span className="text-ink-soft">{post.author?.nickname ?? '村民'}</span>
          <span>·</span>
          <span>{formatRelative(post.published_at || post.created_at)}</span>
        </div>
        <Link to={`/p/${post.id}`} className="mt-2.5 block">
          <p className="whitespace-pre-wrap font-serif text-[15.5px] leading-[1.9] text-ink/90 transition-colors group-hover:text-ink">
            {excerpt(post.content_html || post.content || summary, 260)}
          </p>
        </Link>
        {post.images?.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-hidden">
            {post.images.slice(0, 4).map((image) => (
              <img
                key={image}
                src={mediaUrl(image)}
                alt=""
                loading="lazy"
                className="size-[72px] rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 text-[11.5px] text-ink-mute">
          <span>{formatCount(post.like_count)} 喜欢</span>
          <span>{formatCount(post.comment_count)} 留言</span>
        </div>
      </article>
    )
  }

  if (variant === 'grid') {
    return (
      <article className="card-surface group overflow-hidden transition-all duration-300 ease-soft hover:-translate-y-1 hover:shadow-lift">
        <Link to={`/p/${post.id}`} className="block">
          <div className="relative aspect-[16/10] overflow-hidden bg-paper-3">
            {cover ? (
              <img
                src={cover}
                alt={post.title ?? ''}
                loading="lazy"
                className="size-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.05]"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#f4e8d6,transparent_60%)]">
                <span className="font-serif text-2xl text-clay/40">记</span>
              </div>
            )}
          </div>
          <div className="px-4 pb-4 pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <CategoryTag category={post.category} />
              {post.is_pinned && <span className="text-[10.5px] text-clay">置顶</span>}
            </div>
            <h3 className="line-clamp-2 font-serif text-[17px] leading-snug text-ink">{post.title || '无题'}</h3>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-mute">{summary}</p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-mute">
              <span>{post.author?.nickname}</span>
              <span>·</span>
              <span>{formatRelative(post.published_at || post.created_at)}</span>
              <span className="ml-auto">{formatCount(post.view_count)} 读</span>
            </div>
          </div>
        </Link>
      </article>
    )
  }

  return (
    <article className="group grid gap-4 border-b border-line/70 py-5 first:pt-0 last:border-0 sm:grid-cols-[1fr_180px] sm:items-start">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CategoryTag category={post.category} />
          {post.is_pinned && (
            <span className="rounded-full bg-clay/10 px-2 py-0.5 text-[10.5px] text-clay-deep">置顶</span>
          )}
          {post.status === 'pending' && (
            <span className="rounded-full bg-moss/12 px-2 py-0.5 text-[10.5px] text-moss">待审核</span>
          )}
        </div>
        <Link to={`/p/${post.id}`} className="block">
          <h3 className="text-balance font-serif text-[19px] leading-snug text-ink transition-colors group-hover:text-clay-deep">
            {post.title || '无题'}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-mute">{summary}</p>
        </Link>
        <div className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-mute">
          <Avatar src={post.author?.avatar_url} name={post.author?.nickname} size="xs" />
          <span className="text-ink-soft">{post.author?.nickname ?? '村民'}</span>
          <span>·</span>
          <span>{formatRelative(post.published_at || post.created_at)}</span>
          <span className="ml-1 hidden sm:inline">{formatCount(post.like_count)} 喜欢</span>
        </div>
      </div>
      {cover && (
        <Link to={`/p/${post.id}`} className="order-first sm:order-none">
          <div className={cn('overflow-hidden rounded-xl bg-paper-3')}>
            <img
              src={cover}
              alt={post.title ?? ''}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.04]"
            />
          </div>
        </Link>
      )}
    </article>
  )
}

export function PostListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="grid gap-4 border-b border-line/60 py-5 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2.5">
            <div className="h-3 w-16 animate-pulse rounded bg-paper-3" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-paper-3" />
            <div className="h-3 w-full animate-pulse rounded bg-paper-3" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-paper-3" />
          </div>
          <div className="hidden aspect-[4/3] animate-pulse rounded-xl bg-paper-3 sm:block" />
        </div>
      ))}
    </div>
  )
}
