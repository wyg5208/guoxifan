import { Heart, MessageCircle, Star } from 'lucide-react'
import { useState } from 'react'

import { api } from '@/lib/api'
import { cn, formatCount } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

export type TargetType = 'post' | 'media' | 'comment'

export interface InteractionStats {
  like_count?: number
  favorite_count?: number
  comment_count?: number
  is_liked?: boolean
  is_favorited?: boolean
}

export function InteractionBar({
  targetType,
  targetId,
  stats,
  onComment,
  size = 'md',
  className,
}: {
  targetType: TargetType
  targetId: string
  stats: InteractionStats
  onComment?: () => void
  size?: 'sm' | 'md'
  className?: string
}) {
  const user = useAuth((state) => state.user)
  const [liked, setLiked] = useState(Boolean(stats.is_liked))
  const [favorited, setFavorited] = useState(Boolean(stats.is_favorited))
  const [likeCount, setLikeCount] = useState(stats.like_count ?? 0)
  const [favoriteCount, setFavoriteCount] = useState(stats.favorite_count ?? 0)
  const [busy, setBusy] = useState(false)

  const requireLogin = () => {
    if (user) return true
    toast.info('先在右上角「进门」，登录后才能喜欢和收藏')
    return false
  }

  const toggleLike = async () => {
    if (!requireLogin() || busy) return
    setBusy(true)
    try {
      const result = await api.interactions.like(targetType, targetId)
      setLiked(result.active)
      setLikeCount(result.like_count)
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleFavorite = async () => {
    if (!requireLogin() || busy) return
    setBusy(true)
    try {
      const result = await api.interactions.favorite(targetType, targetId)
      setFavorited(result.active)
      setFavoriteCount(result.favorite_count)
      toast.success(result.active ? '已收藏，随时回来看看' : '已取消收藏')
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const iconSize = size === 'sm' ? 'size-4' : 'size-[17px]'
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]'

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        onClick={toggleLike}
        aria-pressed={liked}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
          textSize,
          liked ? 'text-danger' : 'text-ink-mute hover:text-ink',
        )}
      >
        <Heart className={cn(iconSize, 'transition-transform duration-200 group-active:scale-90')} fill={liked ? 'currentColor' : 'none'} />
        {likeCount > 0 ? formatCount(likeCount) : '喜欢'}
      </button>
      {onComment && (
        <button
          type="button"
          onClick={onComment}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-ink-mute transition-colors hover:text-ink',
            textSize,
          )}
        >
          <MessageCircle className={iconSize} />
          {stats.comment_count ? formatCount(stats.comment_count) : '留言'}
        </button>
      )}
      <button
        type="button"
        onClick={toggleFavorite}
        aria-pressed={favorited}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
          textSize,
          favorited ? 'text-clay-deep' : 'text-ink-mute hover:text-ink',
        )}
      >
        <Star className={iconSize} fill={favorited ? 'currentColor' : 'none'} />
        {favoriteCount > 0 ? formatCount(favoriteCount) : '收藏'}
      </button>
    </div>
  )
}
