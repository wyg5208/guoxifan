import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ScrollText } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const CATEGORIES = ['建村', '沿革', '人物', '风物', '大事', '拆迁', '其他']

export function TimelinePage() {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    year_label: '',
    sort_year: '',
    title: '',
    description: '',
    category: '大事',
  })

  const query = useQuery({
    queryKey: ['timeline', category],
    queryFn: () => api.timeline.list(category ? { category } : undefined),
  })

  const events = query.data ?? []

  const submit = async () => {
    if (!form.year_label.trim() || !form.title.trim()) return
    setSaving(true)
    try {
      await api.timeline.create({
        year_label: form.year_label.trim(),
        sort_year: form.sort_year ? Number(form.sort_year) : null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category || null,
      })
      toast.success('记下了')
      setOpen(false)
      setForm({ year_label: '', sort_year: '', title: '', description: '', category: '大事' })
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="村史年表"
        description="从哪一年开始有这个名字，到哪一年最后一户搬走。中间的事，一件件记下来。"
        action={
          user?.permissions.is_staff ? (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>
              加一条
            </Button>
          ) : undefined
        }
      >
        <div className="-mx-1 mt-5 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
          {['', ...CATEGORIES].map((item) => (
            <button
              key={item || 'all'}
              type="button"
              onClick={() => setCategory(item)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors',
                category === item
                  ? 'border-clay bg-clay/10 text-clay-deep'
                  : 'border-line bg-white/50 text-ink-soft hover:border-clay/40 hover:text-ink',
              )}
            >
              {item || '全部'}
            </button>
          ))}
        </div>
      </PageHeader>

      {query.isLoading ? (
        <div className="space-y-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex gap-4">
              <div className="h-3 w-14 animate-pulse rounded bg-paper-3" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/2 animate-pulse rounded bg-paper-3" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-paper-3" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          title="还没有记下任何一年"
          description="可以很细，也可以很粗。比如「1958年，村东头挖了第一口机井」。"
          icon={<ScrollText className="size-6" />}
          action={
            user?.permissions.is_staff ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                加第一条
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ol className="relative border-l border-line pl-6 sm:pl-8">
          {events.map((event, index) => (
            <li key={event.id} className="relative pb-8 last:pb-0">
              <span
                className={cn(
                  'absolute -left-[31px] top-1.5 size-[9px] rounded-full border-2 sm:-left-[39px]',
                  index === 0 ? 'border-clay bg-clay' : 'border-clay/50 bg-paper',
                )}
              />
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-serif text-[13px] tracking-[0.18em] text-clay">{event.year_label}</span>
                {event.category && (
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] text-ink-mute">
                    {event.category}
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-serif text-[17.5px] leading-snug text-ink">{event.title}</h3>
              {event.description && (
                <p className="mt-1.5 text-[13px] leading-[1.9] text-ink-soft">{event.description}</p>
              )}
              {event.image_url && (
                <img
                  src={mediaUrl(event.image_url)}
                  alt={event.title}
                  loading="lazy"
                  className="mt-3 max-h-64 rounded-xl border border-line object-cover"
                />
              )}
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="往村里添一段往事"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button size="sm" loading={saving} onClick={submit} disabled={!form.year_label || !form.title}>
              记下来
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="年份写法" required hint="比如：1958年 / 民国二十七年 / 九十年代">
              <Input
                value={form.year_label}
                onChange={(event) => setForm({ ...form, year_label: event.target.value })}
                placeholder="1958年"
              />
            </Field>
            <Field label="排序用年份" hint="填数字，用于排序">
              <Input
                value={form.sort_year}
                onChange={(event) => setForm({ ...form, sort_year: event.target.value })}
                placeholder="1958"
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="发生了什么" required>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="村东头挖了第一口机井"
            />
          </Field>
          <Field label="细说">
            <Textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              rows={4}
              placeholder="当时的天气、在场的人、后来怎么样了……"
            />
          </Field>
          <Field label="分类">
            <Select
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
