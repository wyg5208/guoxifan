import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ImagePlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { Lightbox } from '@/components/content/Lightbox'
import { MediaGrid } from '@/components/content/MediaGrid'
import { UploadDialog } from '@/components/content/UploadDialog'
import { Button, buttonClass } from '@/components/ui/Button'
import { EmptyState, PageLoading } from '@/components/ui/Display'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

export function AlbumDetailPage() {
  const { id = '' } = useParams()
  const user = useAuth((state) => state.user)
  const [index, setIndex] = useState<number | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const album = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.albums.get(id),
    enabled: Boolean(id),
  })

  const media = useQuery({
    queryKey: ['album-media', id, cursor],
    queryFn: () =>
      api.albums
        .media(id, { limit: 40, before_id: cursor ?? undefined })
        .then((r) => ({ items: r.data, meta: r.meta ?? {} })),
    enabled: Boolean(id),
  })

  const albums = useQuery({
    queryKey: ['albums'],
    queryFn: () => api.albums.list().then((r) => r.data),
    staleTime: 120_000,
  })

  if (album.isLoading) return <PageLoading label="正在打开相册…" />
  if (album.isError || !album.data) {
    return (
      <EmptyState
        title="找不到这本相册"
        description="可能已经被收起来了。"
        action={
          <Link to="/albums" className={buttonClass('outline', 'sm')}>
            回相册列表
          </Link>
        }
      />
    )
  }

  const detail = album.data
  const items = media.data?.items ?? []

  return (
    <div>
      <Link
        to="/albums"
        className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        所有相册
      </Link>

      <header className="mt-4 border-b border-line/70 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {detail.era && (
                <span className="rounded-full bg-clay/10 px-2 py-0.5 text-[10.5px] tracking-wide text-clay-deep">
                  {detail.era}
                </span>
              )}
              <span className="text-[11.5px] text-ink-mute">{detail.media_count} 张</span>
            </div>
            <h1 className="mt-2 font-serif text-[26px] tracking-wide text-ink sm:text-[30px]">{detail.title}</h1>
            {detail.description && (
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-mute">{detail.description}</p>
            )}
          </div>
          {user && (
            <Button variant="outline" size="sm" icon={<ImagePlus className="size-3.5" />} onClick={() => setUploadOpen(true)}>
              往这里加照片
            </Button>
          )}
        </div>
      </header>

      <div className="mt-6">
        {media.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, key) => (
              <div key={key} className="aspect-square animate-pulse rounded-xl bg-paper-3" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="这本相册还是空的"
            description="照片不放进来的话，过些年就真的没人记得了。"
            action={
              user ? (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  放第一张
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <MediaGrid items={items} onOpen={setIndex} masonry />
            {media.data?.meta?.has_more && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  loading={media.isFetching}
                  onClick={() => setCursor(String(media.data?.meta?.next_cursor ?? ''))}
                >
                  再翻一页
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Lightbox items={items} index={index} onClose={() => setIndex(null)} onIndexChange={setIndex} />
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        albumId={id}
        albums={albums.data ?? []}
        onDone={() => {
          album.refetch()
          media.refetch()
        }}
      />
    </div>
  )
}
