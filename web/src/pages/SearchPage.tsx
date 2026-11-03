import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PostCard } from '@/components/content/PostCard'
import { MediaThumb } from '@/components/content/MediaGrid'
import { Avatar, EmptyState, PageLoading } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Form'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') ?? ''
  const [keyword, setKeyword] = useState(initial)
  const [submitted, setSubmitted] = useState(initial)

  const query = useQuery({
    queryKey: ['search', submitted],
    queryFn: () => api.site.search(submitted),
    enabled: submitted.trim().length > 0,
  })

  const total = useMemo(() => {
    const data = query.data
    if (!data) return 0
    return data.posts.length + data.media.length + data.villagers.length + data.families.length
  }, [query.data])

  const submit = (value: string) => {
    setSubmitted(value)
    setParams(value ? { q: value } : {})
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8 border-b border-line/70 pb-6">
        <h1 className="font-serif text-[26px] tracking-wide text-ink">翻一翻</h1>
        <p className="mt-2 text-[13px] text-ink-mute">名字、地名、一句话，都能搜。</p>
        <div className="mt-5 max-w-lg">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            onSubmit={() => submit(keyword.trim())}
            placeholder="比如：老樟树 / 王 / 打谷场"
          />
        </div>
      </header>

      {!submitted ? (
        <EmptyState
          title="想找什么"
          description="敲个词试试。哪怕只记得一个字。"
          className="py-14"
        />
      ) : query.isLoading ? (
        <PageLoading label="正在翻找…" />
      ) : total === 0 ? (
        <EmptyState
          title={`没有找到「${submitted}」`}
          description="换个说法试试，或者去村民名录里一个一个看。"
          className="py-14"
        />
      ) : (
        <div className="space-y-10">
          <p className="text-[12.5px] text-ink-mute">
            共找到 {total} 条与「{submitted}」相关的内容
          </p>

          {query.data!.posts.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-[17px] text-ink">文章与短句</h2>
              <div className="space-y-1">
                {query.data!.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}

          {query.data!.media.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-[17px] text-ink">照片与影像</h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {query.data!.media.map((media) => (
                  <Link key={media.id} to={`/albums/${media.album_id ?? ''}`} className="block">
                    <MediaThumb media={media} className="aspect-square" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {query.data!.villagers.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-[17px] text-ink">村民</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data!.villagers.map((villager) => (
                  <Link
                    key={villager.id}
                    to={`/villagers/${villager.id}`}
                    className="flex items-center gap-2.5 rounded-xl border border-line/80 bg-white/60 px-3 py-2.5 transition-colors hover:border-clay/40"
                  >
                    <Avatar src={villager.avatar_url} name={villager.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[13.5px] text-ink">{villager.name}</div>
                      <div className="truncate text-[11px] text-ink-mute">
                        {villager.family?.name || '村民'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {query.data!.families.length > 0 && (
            <section>
              <h2 className="mb-3 font-serif text-[17px] text-ink">人家</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {query.data!.families.map((family) => (
                  <Link
                    key={family.id}
                    to={`/families/${family.id}`}
                    className={cn(
                      'rounded-xl border border-line/80 bg-white/60 px-3.5 py-2.5 transition-colors hover:border-clay/40',
                    )}
                  >
                    <div className="font-serif text-[13.5px] text-ink">{family.name}</div>
                    <div className="text-[11px] text-ink-mute">
                      {[family.householder, family.door_no].filter(Boolean).join(' · ') || '信息待补'}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
