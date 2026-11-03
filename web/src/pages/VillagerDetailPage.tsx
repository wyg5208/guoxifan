import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Cake, HeartHandshake, MapPin, MessageCircle, Pencil, Phone, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Lightbox } from '@/components/content/Lightbox'
import { VillagerFormDialog } from '@/components/content/VillagerFormDialog'
import { MediaThumb } from '@/components/content/MediaGrid'
import { Avatar, Badge, EmptyState, PageLoading, SectionTitle } from '@/components/ui/Display'
import { Button, buttonClass } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { MediaItem } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { useAuth, isStaff } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const RELATION_LABEL: Record<string, string> = {
  spouse: '配偶',
  parent: '父母',
  child: '子女',
  sibling: '兄弟姐妹',
}

export function VillagerDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [index, setIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const me = useAuth((state) => state.user)

  const query = useQuery({
    queryKey: ['villager', id],
    queryFn: () => api.villagers.get(id),
    enabled: Boolean(id),
  })

  const direct = useMutation({
    mutationFn: (userId: string) => api.chat.direct(userId),
    onSuccess: (room) => navigate(`/chat?room=${room.id}`),
    onError: (error) => toast.error(describeError(error)),
  })

  if (query.isLoading) return <PageLoading label="正在找这个人…" />
  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="找不到这位村民"
        description="也许名字还没有被记下来。"
        action={
          <Link to="/villagers" className={buttonClass('outline', 'sm')}>
            回村民名录
          </Link>
        }
      />
    )
  }

  const villager = query.data
  const photos = (villager.photos ?? []) as unknown as MediaItem[]
  const relations = villager.relations ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/villagers"
        className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        村民名录
      </Link>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-[#fffdf9] shadow-soft">
        <div
          className="h-24 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 40%, rgba(180,121,63,0.18), transparent 55%), radial-gradient(circle at 85% 20%, rgba(107,127,94,0.12), transparent 50%)',
          }}
        />
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <Avatar
              src={villager.avatar_url}
              name={villager.name}
              size="xl"
              ring
              className={villager.is_deceased ? 'bg-paper-3 grayscale' : ''}
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-[26px] tracking-wide text-ink">{villager.name}</h1>
                {villager.alias && <span className="text-[13px] text-ink-mute">（{villager.alias}）</span>}
                {villager.is_deceased && <Badge tone="neutral">已故</Badge>}
                {!villager.is_deceased && villager.user_id && villager.user_id !== me?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    loading={direct.isPending}
                    icon={<MessageCircle className="size-3.5" />}
                    onClick={() => {
                      if (!me) {
                        navigate(`/login?next=${encodeURIComponent(`/villagers/${villager.id}`)}`)
                        return
                      }
                      if (villager.user_id) direct.mutate(villager.user_id)
                    }}
                  >
                    私信
                  </Button>
                )}
                {isStaff(me) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={villager.user_id && villager.user_id !== me?.id ? '' : 'ml-auto'}
                    icon={<Pencil className="size-3.5" />}
                    onClick={() => setEditing(true)}
                  >
                    编辑
                  </Button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
                {villager.family && (
                  <Link
                    to={`/families/${villager.family.id}`}
                    className="inline-flex items-center gap-1 transition-colors hover:text-clay-deep"
                  >
                    <MapPin className="size-3" />
                    {villager.family.name}
                  </Link>
                )}
                {villager.relation_to_head && (
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="size-3" />
                    {villager.relation_to_head}
                  </span>
                )}
                {villager.generation && <span>{villager.generation}</span>}
              </div>
            </div>
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-line/70 pt-5 text-[12.5px] sm:grid-cols-2">
            {(villager.birth_date || villager.death_date) && (
              <div className="flex gap-2">
                <dt className="flex items-center gap-1.5 text-ink-mute">
                  <Cake className="size-3.5" />
                  生卒
                </dt>
                <dd className="text-ink">
                  {[villager.birth_date && formatDate(villager.birth_date), villager.death_date && formatDate(villager.death_date)]
                    .filter(Boolean)
                    .join(' — ') || '不详'}
                </dd>
              </div>
            )}
            {villager.occupation && (
              <div className="flex gap-2">
                <dt className="text-ink-mute">营生</dt>
                <dd className="text-ink">{villager.occupation}</dd>
              </div>
            )}
            {villager.contact && villager.contact_visibility !== 'private' && (
              <div className="flex gap-2">
                <dt className="flex items-center gap-1.5 text-ink-mute">
                  <Phone className="size-3.5" />
                  联系
                </dt>
                <dd className="text-ink">{villager.contact}</dd>
              </div>
            )}
          </dl>

          {villager.intro && (
            <p className="mt-5 whitespace-pre-wrap border-t border-line/70 pt-5 text-[13.5px] leading-[1.95] text-ink-soft">
              {villager.intro}
            </p>
          )}
        </div>
      </section>

      <VillagerFormDialog open={editing} onClose={() => setEditing(false)} villager={villager} />

      {relations.length > 0 && (
        <section className="mt-10">
          <SectionTitle eyebrow="Kin" title="身边的人" />
          <div className="space-y-3">
            {relations.map((item, key) => (
              <div key={key} className="flex items-center gap-2 rounded-xl border border-line/80 bg-white/60 px-3.5 py-2.5">
                <span className="w-16 shrink-0 text-[11.5px] text-clay">
                  {RELATION_LABEL[item.relation] ?? item.relation}
                </span>
                {item.villager ? (
                  <Link
                    to={`/villagers/${item.villager.id}`}
                    className="flex min-w-0 items-center gap-2 transition-colors hover:text-clay-deep"
                  >
                    <Avatar src={item.villager.avatar_url} name={item.villager.name} size="xs" />
                    <span className="truncate font-serif text-[13.5px] text-ink">{item.villager.name}</span>
                  </Link>
                ) : (
                  <span className="text-[12.5px] text-ink-mute">未记录</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <section className="mt-10">
          <SectionTitle eyebrow="Photos" title="这个人留下的影像" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo, key) => (
              <MediaThumb
                key={photo.id}
                media={photo}
                onOpen={() => setIndex(key)}
                className="aspect-square"
              />
            ))}
          </div>
          <Lightbox items={photos} index={index} onClose={() => setIndex(null)} onIndexChange={setIndex} />
        </section>
      )}

      {villager.posts && villager.posts.length > 0 && (
        <section className="mt-10">
          <SectionTitle eyebrow="Stories" title="写到过这个人" />
          <div className="space-y-2">
            {villager.posts.map((post) => (
              <Link
                key={post.id}
                to={`/p/${post.id}`}
                className="flex items-center gap-3 rounded-xl border border-line/80 bg-white/60 px-4 py-3 transition-colors hover:border-clay/40"
              >
                <HeartHandshake className="size-4 shrink-0 text-clay/70" />
                <span className="min-w-0 flex-1 truncate font-serif text-[14px] text-ink">
                  {post.title || post.summary || '一段记忆'}
                </span>
                <span className="shrink-0 text-[11px] text-ink-mute">{formatDate(post.published_at || post.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
