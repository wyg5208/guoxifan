import { Play } from 'lucide-react'

import { mediaUrl } from '@/lib/api'
import type { MediaItem } from '@/lib/types'
import { cn, formatDuration, formatRelative, thumbOf } from '@/lib/utils'

export function MediaTile({
  media,
  onOpen,
  className,
  showMeta = false,
  priority = false,
}: {
  media: MediaItem
  onOpen?: () => void
  className?: string
  showMeta?: boolean
  priority?: boolean
}) {
  const src = thumbOf(media.urls, 'small')
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3

  return (
    <figure className={cn('group relative', className)}>
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full overflow-hidden rounded-xl bg-paper-3"
        style={{ aspectRatio: `${ratio}` }}
        aria-label={media.title || media.caption || '查看照片'}
      >
        {src ? (
          <img
            src={src}
            alt={media.title || media.caption || '老照片'}
            loading={priority ? 'eager' : 'lazy'}
            className="size-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-[11px] text-ink-mute">无预览</span>
        )}
        {media.kind === 'video' && (
          <>
            <span className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent" />
            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ink/55 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
              <Play className="size-2.5" fill="currentColor" />
              影像
            </span>
            {media.duration_sec ? (
              <span className="absolute bottom-2 right-2 rounded bg-ink/55 px-1.5 py-0.5 text-[10px] text-white/90">
                {formatDuration(media.duration_sec)}
              </span>
            ) : null}
          </>
        )}
        {media.era && (
          <span className="absolute bottom-2 left-2 rounded bg-paper/85 px-1.5 py-0.5 font-serif text-[10px] tracking-wider text-clay-deep backdrop-blur-sm">
            {media.era}
          </span>
        )}
      </button>
      {showMeta && (
        <figcaption className="mt-2">
          <div className="truncate text-[13px] text-ink">{media.title || media.caption || '未命名照片'}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-mute">
            <span>{formatRelative(media.created_at)}</span>
            {media.uploader && <span className="truncate">· {media.uploader.nickname}</span>}
          </div>
        </figcaption>
      )}
    </figure>
  )
}

export function MediaGrid({
  items,
  onOpen,
  className,
  masonry = false,
}: {
  items: MediaItem[]
  onOpen: (index: number) => void
  className?: string
  masonry?: boolean
}) {
  if (masonry) {
    return (
      <div className={cn('columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3', className)}>
        {items.map((media, index) => (
          <div key={media.id} className="break-inside-avoid">
            <MediaTile media={media} onOpen={() => onOpen(index)} priority={index < 4} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {items.map((media, index) => (
        <MediaTile key={media.id} media={media} onOpen={() => onOpen(index)} priority={index < 4} />
      ))}
    </div>
  )
}

export function MediaThumb({
  media,
  className,
  onOpen,
  size = 'small',
}: {
  media: MediaItem
  className?: string
  onOpen?: () => void
  size?: 'thumb' | 'small' | 'medium'
}) {
  const src = thumbOf(media.urls, size)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('block overflow-hidden rounded-lg bg-paper-3', className)}
      aria-label={media.title || '查看照片'}
    >
      {src ? (
        <img src={src} alt={media.title || ''} loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-[10px] text-ink-mute">无预览</span>
      )}
    </button>
  )
}

export function singleImageUrl(media: MediaItem): string {
  return mediaUrl(media.urls.original || media.urls.medium || '')
}
