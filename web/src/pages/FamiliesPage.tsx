import { useQuery } from '@tanstack/react-query'
import { Home, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { FamilyFormDialog } from '@/components/content/FamilyFormDialog'
import { Button } from '@/components/ui/Button'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Form'
import { api, mediaUrl } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { isStaff, useAuth } from '@/store/auth'

export function FamiliesPage() {
  const [keyword, setKeyword] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const me = useAuth((state) => state.user)

  const query = useQuery({
    queryKey: ['families'],
    queryFn: () => api.families.list().then((r) => r.data),
    staleTime: 120_000,
  })

  const families = (query.data ?? []).filter((family) => {
    if (!keyword.trim()) return true
    const target = `${family.name}${family.householder ?? ''}${family.door_no ?? ''}${family.village_area ?? ''}`
    return target.includes(keyword.trim())
  })

  return (
    <div>
      <PageHeader
        title="各家各户"
        description="门牌上写着谁的名字，院子里种了什么树。房子没了，这是它们还在的地方。"
      >
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="搜户主、门牌号…"
            className="sm:w-64"
          />
          <Link
            to="/villagers"
            className="text-[12.5px] text-ink-mute transition-colors hover:text-clay-deep"
          >
            按人查看村民名录 →
          </Link>
          {isStaff(me) && (
            <Button
              variant="quiet"
              size="sm"
              className="ml-auto"
              icon={<Plus className="size-3.5" />}
              onClick={() => setFormOpen(true)}
            >
              登记一户
            </Button>
          )}
        </div>
      </PageHeader>

      <FamilyFormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-card bg-paper-3" />
          ))}
        </div>
      ) : families.length === 0 ? (
        <EmptyState
          title="还没有登记人家"
          description="从自家开始就好：户主、门牌号、老屋的样子。"
          icon={<Home className="size-6" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((family) => (
            <Link
              key={family.id}
              to={`/families/${family.id}`}
              className="group overflow-hidden rounded-card border border-line bg-[#fcf8f0] shadow-soft transition-all duration-300 ease-soft hover:-translate-y-1 hover:border-clay/40 hover:shadow-lift"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-paper-3">
                {family.cover_url ? (
                  <img
                    src={mediaUrl(family.cover_url)}
                    alt={family.name}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.05]"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#efe2cf,transparent_65%)]">
                    <Home className="size-6 text-clay/35" />
                  </div>
                )}
                {family.door_no && (
                  <span className="absolute bottom-2 left-2 rounded bg-paper/85 px-1.5 py-0.5 font-serif text-[10.5px] tracking-wider text-clay-deep">
                    {family.door_no}
                  </span>
                )}
              </div>
              <div className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-serif text-[16px] text-ink">{family.name}</h3>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-mute">{family.member_count} 人</span>
                </div>
                <div className="mt-1 truncate text-[11.5px] text-ink-mute">
                  {[family.householder && `户主 ${family.householder}`, family.village_area]
                    .filter(Boolean)
                    .join(' · ') || '信息待补'}
                </div>
                {family.current_loc && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-soft">
                    <Users className="size-3 text-clay/70" />
                    现居 {family.current_loc}
                  </div>
                )}
                {family.relocated_at && (
                  <div className="mt-0.5 text-[10.5px] text-ink-mute">
                    {formatDate(family.relocated_at)} 搬离
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function FamilyMembers({ members }: { members: { id: string; name: string; avatar_url: string | null }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((member) => (
        <Link
          key={member.id}
          to={`/villagers/${member.id}`}
          className="flex items-center gap-2 rounded-full border border-line bg-white/60 px-2 py-1 pr-3 transition-colors hover:border-clay/40"
        >
          <Avatar src={member.avatar_url} name={member.name} size="xs" />
          <span className="text-[12.5px] text-ink">{member.name}</span>
        </Link>
      ))}
    </div>
  )
}
