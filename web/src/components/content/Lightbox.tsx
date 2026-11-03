import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useEffect } from 'react'

import { mediaUrl } from '@/lib/api'
import type { MediaItem } from '@/lib/types'
import { cn, formatDate, thumbOf } from '@/lib/utils'

import { InteractionBar } from './InteractionBar'

export function Lightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: MediaItem[]
  index: number | null
  onClose: () => void
  onIndexChange: (next: number) => void
}) {
  const open = index !== null && items.length > 0

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onIndexChange(((index as number) + 1) % items.length)
      if (event.key === 'ArrowLeft') onIndexChange(((index as number) - 1 + items.length) % items.length)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, index, items.length, onClose, onIndexChange])

  const media = open ? items[index as number] : null

  return (
    <AnimatePresence>
      {open && media && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col bg-ink/92 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between px-3 py-2.5 text-paper/80 sm:px-5">
            <span className="text-[12px] tracking-widest">
              {(index as number) + 1} / {items.length}
            </span>
            <div className="flex items-center gap-1">
              {media.urls.original && (
                <a
                  href={mediaUrl(media.urls.original)}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full p-2 transition-colors hover:bg-white/10"
                  aria-label="下载原图"
                >
                  <Download className="size-4" />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 transition-colors hover:bg-white/10"
                aria-label="关闭"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-12">
            {items.length > 1 && (
              <>
                <NavButton
                  side="left"
                  onClick={() => onIndexChange(((index as number) - 1 + items.length) % items.length)}
                />
                <NavButton side="right" onClick={() => onIndexChange(((index as number) + 1) % items.length)} />
              </>
            )}
            <motion.div
              key={media.id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-full max-w-full items-center justify-center"
            >
              {media.kind === 'video' ? (
                <video
                  key={media.id}
                  src={mediaUrl(media.urls.mp4 || media.urls.original || '')}
                  poster={thumbOf(media.urls, 'medium') || undefined}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[76vh] max-w-full rounded-lg bg-black"
                />
              ) : (
                <img
                  src={thumbOf(media.urls, 'medium') || thumbOf(media.urls, 'original')}
                  alt={media.title || media.caption || ''}
                  className="max-h-[76vh] max-w-full select-none rounded-lg object-contain"
                />
              )}
            </motion.div>
          </div>

          <div className="px-4 pb-4 pt-3 sm:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-serif text-[15px] text-paper">
                    {media.title || media.caption || '未命名的影像'}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-paper/55">
                    {media.taken_at && <span>{formatDate(media.taken_at)}</span>}
                    {media.album && <span>· {media.album.title}</span>}
                    {media.uploader && <span>· {media.uploader.nickname} 提供</span>}
                  </div>
                </div>
                <div className="rounded-full bg-white/8 px-2 py-0.5">
                  <InteractionBar
                    key={media.id}
                    targetType="media"
                    targetId={media.id}
                    stats={media}
                    size="sm"
                    className="[&_button]:text-paper/70 [&_button:hover]:text-paper"
                  />
                </div>
              </div>
              {media.caption && !media.title && (
                <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-paper/70">{media.caption}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '上一张' : '下一张'}
      className={cn(
        'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/8 p-2.5 text-paper/75 transition-colors hover:bg-white/16 hover:text-paper',
        side === 'left' ? 'left-1 sm:left-4' : 'right-1 sm:right-4',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}
