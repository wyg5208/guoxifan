import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import { useState } from 'react'

import { PostCard } from '@/components/content/PostCard'
import { PublishDialog } from '@/components/content/PublishDialog'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader } from '@/components/ui/Display'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'

export function ShortsPage() {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [publishOpen, setPublishOpen] = useState(false)

  const query = useInfiniteQuery({
    queryKey: ['posts', 'short'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.posts
        .list({ kind: 'short', limit: 15, before_id: pageParam })
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
        title="三言两语"
        description="一句话、一个瞬间、一个名字。不用写长。"
        action={
          user ? (
            <Button size="sm" icon={<PenLine className="size-3.5" />} onClick={() => setPublishOpen(true)}>
              说两句
            </Button>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-card bg-paper-3" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="还没有人开口"
          description="短句不用讲究文采，写下来就有人记得。"
          action={
            user ? (
              <Button size="sm" onClick={() => setPublishOpen(true)}>
                说第一句
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                再看看
              </Button>
            </div>
          )}
        </>
      )}

      <PublishDialog
        open={publishOpen}
        onClose={() => {
          setPublishOpen(false)
          queryClient.invalidateQueries({ queryKey: ['posts', 'short'] })
        }}
        defaultKind="short"
      />
    </div>
  )
}
