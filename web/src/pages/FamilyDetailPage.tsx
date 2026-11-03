import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Home, MapPin, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { FamilyFormDialog } from '@/components/content/FamilyFormDialog'
import { Avatar, EmptyState, PageLoading, SectionTitle } from '@/components/ui/Display'
import { Button, buttonClass } from '@/components/ui/Button'
import { api, mediaUrl } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { isStaff, useAuth } from '@/store/auth'

export function FamilyDetailPage() {
  const { id = '' } = useParams()
  const [editing, setEditing] = useState(false)
  const me = useAuth((state) => state.user)

  const query = useQuery({
    queryKey: ['family', id],
    queryFn: () => api.families.get(id),
    enabled: Boolean(id),
  })

  if (query.isLoading) return <PageLoading label="正在找这户人家…" />
  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="找不到这户人家"
        description="也许门牌号记错了。"
        action={
          <Link to="/families" className={buttonClass('outline', 'sm')}>
            回各家各户
          </Link>
        }
      />
    )
  }

  const family = query.data
  const members = family.members ?? []

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        to="/families"
        className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        各家各户
      </Link>

      {isStaff(me) && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="size-3.5" />}
            onClick={() => setEditing(true)}
          >
            编辑这户
          </Button>
        </div>
      )}

      <FamilyFormDialog open={editing} onClose={() => setEditing(false)} family={family} />

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-[#fcf8f0] shadow-soft">
        <div className="relative aspect-[21/9] overflow-hidden bg-paper-3">
          {family.cover_url ? (
            <img src={mediaUrl(family.cover_url)} alt={family.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_25%_25%,#efe2cf,transparent_60%)]">
              <Home className="size-8 text-clay/30" />
            </div>
          )}
          {family.door_no && (
            <span className="absolute bottom-3 left-4 rounded bg-paper/90 px-2 py-1 font-serif text-[12px] tracking-[0.18em] text-clay-deep backdrop-blur-sm">
              {family.door_no}
            </span>
          )}
        </div>

        <div className="px-5 py-6 sm:px-7">
          <h1 className="font-serif text-[26px] tracking-wide text-ink">{family.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-mute">
            {family.householder && <span>户主 {family.householder}</span>}
            {family.village_area && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {family.village_area}
              </span>
            )}
            {family.address_text && <span>{family.address_text}</span>}
            <span>{family.member_count} 位家人</span>
          </div>

          <dl className="mt-5 grid gap-x-8 gap-y-3 border-t border-line/70 pt-5 text-[12.5px] sm:grid-cols-2">
            {family.relocated_at && (
              <div className="flex gap-2">
                <dt className="text-ink-mute">搬离时间</dt>
                <dd className="text-ink">{formatDate(family.relocated_at)}</dd>
              </div>
            )}
            {family.current_loc && (
              <div className="flex gap-2">
                <dt className="text-ink-mute">现在住</dt>
                <dd className="text-ink">{family.current_loc}</dd>
              </div>
            )}
          </dl>

          {family.intro && (
            <p className="mt-5 whitespace-pre-wrap border-t border-line/70 pt-5 text-[13.5px] leading-[1.95] text-ink-soft">
              {family.intro}
            </p>
          )}
        </div>
      </section>

      {members.length > 0 && (
        <section className="mt-10">
          <SectionTitle eyebrow="Family" title="这户人家的人" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <Link
                key={member.id}
                to={`/villagers/${member.id}`}
                className="flex items-center gap-3 rounded-xl border border-line/80 bg-white/60 px-3.5 py-3 transition-colors hover:border-clay/40"
              >
                <Avatar
                  src={member.avatar_url}
                  name={member.name}
                  size="md"
                  className={member.is_deceased ? 'grayscale' : ''}
                />
                <div className="min-w-0">
                  <div className="truncate font-serif text-[14.5px] text-ink">{member.name}</div>
                  <div className="truncate text-[11px] text-ink-mute">
                    {[member.relation_to_head, member.generation, member.occupation].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {family.map_x != null && family.map_y != null && (
        <p className="mt-6 text-[11.5px] text-ink-mute">
          老宅位置坐标：{family.map_x.toFixed(2)}, {family.map_y.toFixed(2)}
        </p>
      )}
    </div>
  )
}
