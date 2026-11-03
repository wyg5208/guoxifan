import { useInfiniteQuery } from '@tanstack/react-query'
import { Feather, PenLine } from 'lucide-react'
import { useState } from 'react'

import { PostCard, PostListSkeleton } from '@/components/content/PostCard'
import { PublishDialog } from '@/components/content/PublishDialog'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader } from '@/components/ui/Display'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'

const CATEGORIES = ['全部', '村史', '人物', '风物', '口述', '老照片', '随笔']

export function ArticlesPage() {
  const user = useAuth((state) => state.user)
  const [category, setCategory] = useState('全部')
  const [publishOpen, setPublishOpen] = useState(false)

  const query = useInfiniteQuery({
    queryKey: ['posts', 'article', category],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.posts
        .list({
          kind: 'article',
          category: category === '全部' ? undefined : category,
          limit: 12,
          before_id: pageParam,
        })
        .then((response) => ({
          items: response.data,
          next: (response.meta?.next_cursor as string | undefined) ?? null,
        })),
    getNextPageParam: (last) => last.next ?? undefined,
  })

  const list = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      <PageHeader
        title="村里的事"
        description="有人写下了拆房那天的雨，有人写下了奶奶的灶台。你也可以写。"
        action={
          user ? (
            <Button size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setPublishOpen(true)}>
              写一篇
            </Button>
          ) : undefined
        }
      >
        <div className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors',
                category === item
                  ? 'border-clay bg-clay/10 text-clay-deep'
                  : 'border-line bg-white/50 text-ink-soft hover:border-clay/40 hover:text-ink',
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </PageHeader>

      {query.isLoading ? (
        <PostListSkeleton count={4} />
      ) : list.length === 0 ? (
        <EmptyState
          title="这一类还没有文章"
          description="也许第一篇就该由你来写。"
          icon={<Feather className="size-6" />}
          action={
            user ? (
              <Button size="sm" onClick={() => setPublishOpen(true)}>
                写第一篇
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div>
            {list.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="mt-8 text-center">
              <Button
                variant="outline"
                size="sm"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                还有更多
              </Button>
            </div>
          )}
        </>
      )}

      <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} defaultKind="article" />
    </div>
  )
}
