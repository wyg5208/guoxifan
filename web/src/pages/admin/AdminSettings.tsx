import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { PageHeader, PageLoading } from '@/components/ui/Display'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { api } from '@/lib/api'
import type { SettingItem } from '@/lib/types'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const GROUPS: { key: string; title: string; description: string }[] = [
  { key: 'site', title: '站点信息', description: '站名、标语、拆迁年份，都会显示在首页和页脚。' },
  { key: 'feature', title: '功能开关', description: '注册、评论、聊天、原图下载，随开随关。' },
  { key: 'moderation', title: '内容审核', description: '内容怎么审，决定新发的东西什么时候能被看到。' },
  { key: 'contact', title: '联系方式', description: '有人想捐照片或者问事情，能找到谁。' },
]

const REG_MODES = [
  { value: 'open', label: '自由注册（需审核）' },
  { value: 'invite', label: '邀请码注册' },
  { value: 'closed', label: '暂停注册' },
]

const MODERATION_MODES = [
  { value: 'post_then_review', label: '先发后审' },
  { value: 'pre_review', label: '先审后发' },
]

function SettingControl({
  item,
  value,
  onChange,
}: {
  item: SettingItem
  value: unknown
  onChange: (next: unknown) => void
}) {
  if (item.type === 'bool') {
    return (
      <Switch
        checked={Boolean(value)}
        onChange={(next) => onChange(next)}
        label={item.label}
        description={item.description ?? undefined}
      />
    )
  }

  const hint = item.description ?? undefined

  if (item.type === 'number') {
    return (
      <Field label={item.label} hint={hint}>
        <Input
          type="number"
          value={typeof value === 'number' ? value : Number(value ?? 0)}
          onChange={(event) => onChange(Number(event.target.value))}
          className="max-w-40"
        />
      </Field>
    )
  }

  if (item.type === 'json') {
    const text = Array.isArray(value) ? value.join('\n') : JSON.stringify(value, null, 2)
    return (
      <Field label={item.label} hint={hint ?? '一行一个地址。留空就是没有。'}>
        <Textarea
          rows={4}
          value={text}
          onChange={(event) =>
            onChange(
              Array.isArray(value)
                ? event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                : event.target.value,
            )
          }
          className="font-mono text-[12.5px]"
        />
      </Field>
    )
  }

  if (item.key === 'feature.reg_mode') {
    return (
      <Field label={item.label} hint={hint}>
        <Select value={String(value ?? 'open')} onChange={(event) => onChange(event.target.value)} className="max-w-64">
          {REG_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    )
  }

  if (item.key === 'moderation.mode') {
    return (
      <Field label={item.label} hint={hint ?? '预留配置，当前实现固定为先发后审。'}>
        <Select
          value={String(value ?? 'post_then_review')}
          onChange={(event) => onChange(event.target.value)}
          className="max-w-64"
        >
          {MODERATION_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    )
  }

  if (item.key === 'site.theme_color') {
    return (
      <Field label={item.label} hint={hint ?? '默认 #B4793F，泥土色。'}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(value || '#B4793F')}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-white/70 p-1"
            aria-label="选色"
          />
          <Input
            value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
            className="max-w-40 font-mono text-[12.5px]"
          />
        </div>
      </Field>
    )
  }

  return (
    <Field label={item.label} hint={hint}>
      <Input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

export function AdminSettings() {
  const me = useAuth((state) => state.user)
  const canEdit = Boolean(me?.permissions?.is_admin)
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, unknown>>({})

  const query = useQuery({ queryKey: ['admin', 'settings'], queryFn: api.admin.settings })

  const original = useMemo(() => {
    const map: Record<string, unknown> = {}
    for (const item of query.data ?? []) map[item.key] = item.value
    return map
  }, [query.data])

  useEffect(() => {
    if (query.data) setDrafts(original)
  }, [query.data, original])

  const dirtyKeys = useMemo(
    () => Object.keys(drafts).filter((key) => JSON.stringify(drafts[key]) !== JSON.stringify(original[key])),
    [drafts, original],
  )

  const save = useMutation({
    mutationFn: () =>
      api.admin.updateSettings(dirtyKeys.map((key) => ({ key, value: drafts[key] }))),
    onSuccess: () => {
      toast.success('配置存好了')
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
    },
    onError: (error) => toast.error(describeError(error, '没存上')),
  })

  if (query.isLoading) return <PageLoading label="正在读配置…" />

  const items = query.data ?? []

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <PageHeader
        title="站点配置"
        description="改了立刻生效。不确定的项，先别动。"
        action={
          canEdit ? (
            <Button
              size="sm"
              icon={<Save className="size-3.5" />}
              loading={save.isPending}
              disabled={dirtyKeys.length === 0}
              onClick={() => save.mutate()}
            >
              保存 {dirtyKeys.length > 0 && `(${dirtyKeys.length})`}
            </Button>
          ) : (
            <span className="text-[11.5px] text-ink-mute">只有管理员能改</span>
          )
        }
      />

      <div className="space-y-8">
        {GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group.key)
          if (groupItems.length === 0) return null
          return (
            <section key={group.key} className="rounded-card border border-line bg-[#fcf8f0] px-5 py-5 sm:px-6">
              <div className="mb-4">
                <h2 className="font-serif text-[16px] text-ink">{group.title}</h2>
                <p className="mt-1 text-[11.5px] text-ink-mute">{group.description}</p>
              </div>
              <div className="space-y-4">
                {groupItems.map((item) => (
                  <div key={item.key}>
                    <SettingControl
                      item={item}
                      value={drafts[item.key]}
                      onChange={(next) => {
                        if (!canEdit) return
                        setDrafts((previous) => ({ ...previous, [item.key]: next }))
                      }}
                    />
                    <div className="mt-1 text-[10px] font-mono text-ink-mute/60">{item.key}</div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {dirtyKeys.length > 0 && canEdit && (
        <div className="sticky bottom-4 mt-6 flex items-center gap-2 rounded-card border border-clay/30 bg-[#fffdf9]/95 px-4 py-3 shadow-lift backdrop-blur">
          <span className="text-[12.5px] text-ink-soft">改了 {dirtyKeys.length} 项</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw className="size-3.5" />}
            onClick={() => setDrafts(original)}
            className="ml-auto"
          >
            撤销
          </Button>
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
            保存
          </Button>
        </div>
      )}
    </div>
  )
}
