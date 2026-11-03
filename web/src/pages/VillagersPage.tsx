import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { VillagerFormDialog } from '@/components/content/VillagerFormDialog'
import { Button } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, PageHeader } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/Form'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { isStaff, useAuth } from '@/store/auth'

export function VillagersPage() {
  const [keyword, setKeyword] = useState('')
  const [familyId, setFamilyId] = useState('')
  const [deceased, setDeceased] = useState<'all' | 'no' | 'yes'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const me = useAuth((state) => state.user)

  const families = useQuery({
    queryKey: ['families'],
    queryFn: () => api.families.list().then((r) => r.data),
    staleTime: 120_000,
  })

  const query = useQuery({
    queryKey: ['villagers', keyword, familyId, deceased],
    queryFn: () =>
      api.villagers
        .list({
          q: keyword.trim() || undefined,
          family_id: familyId || undefined,
          deceased: deceased === 'all' ? undefined : deceased === 'yes',
          limit: 60,
        })
        .then((r) => r.data),
  })

  const villagers = query.data ?? []

  return (
    <div>
      <PageHeader
        title="村民名录"
        description="在这个村子里住过的人。名字不该随着房子一起消失。"
      >
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={keyword}
            onChange={setKeyword}
            placeholder="搜名字、别名、职业…"
            className="sm:w-64"
          />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <FilterChip active={!familyId} onClick={() => setFamilyId('')}>
              所有人家
            </FilterChip>
            {(families.data ?? []).map((family) => (
              <FilterChip
                key={family.id}
                active={familyId === family.id}
                onClick={() => setFamilyId(family.id === familyId ? '' : family.id)}
              >
                {family.name}
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto hidden rounded-lg bg-paper-2 p-0.5 sm:flex">
            {(
              [
                { value: 'all', label: '全部' },
                { value: 'no', label: '在世' },
                { value: 'yes', label: '已故' },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDeceased(item.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[12px] transition-colors',
                  deceased === item.value ? 'bg-[#fffdf9] text-ink shadow-sm' : 'text-ink-mute',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isStaff(me) && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="quiet"
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => setFormOpen(true)}
            >
              录一位村民
            </Button>
            <span className="text-[11.5px] text-ink-mute">已故的长辈也可以录，不一定要有账号。</span>
          </div>
        )}
      </PageHeader>

      <VillagerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        families={families.data ?? []}
        defaultFamilyId={familyId || null}
      />

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-card bg-paper-3" />
          ))}
        </div>
      ) : villagers.length === 0 ? (
        <EmptyState
          title="没找到人"
          description="换个名字试试，或者去「各家各户」里看看。"
          icon={<Search className="size-6" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {villagers.map((villager) => (
            <Link
              key={villager.id}
              to={`/villagers/${villager.id}`}
              className="group flex gap-3 rounded-card border border-line bg-[#fffdf9] p-3.5 shadow-soft transition-all duration-300 ease-soft hover:-translate-y-0.5 hover:border-clay/40 hover:shadow-lift"
            >
              <Avatar
                src={villager.avatar_url}
                name={villager.name}
                size="md"
                className={villager.is_deceased ? 'grayscale' : ''}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate font-serif text-[15.5px] text-ink">{villager.name}</h3>
                  {villager.alias && (
                    <span className="truncate text-[11px] text-ink-mute">（{villager.alias}）</span>
                  )}
                  {villager.is_deceased && <Badge tone="neutral">已故</Badge>}
                </div>
                <div className="mt-1 truncate text-[11.5px] text-ink-mute">
                  {[villager.family?.name, villager.relation_to_head, villager.generation]
                    .filter(Boolean)
                    .join(' · ') || '村里的人'}
                </div>
                {villager.occupation && (
                  <div className="mt-1 truncate text-[11.5px] text-ink-soft">{villager.occupation}</div>
                )}
                {villager.intro && (
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-mute">
                    {villager.intro}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors',
        active
          ? 'border-clay bg-clay/10 text-clay-deep'
          : 'border-line bg-white/50 text-ink-soft hover:border-clay/40',
      )}
    >
      {children}
    </button>
  )
}
