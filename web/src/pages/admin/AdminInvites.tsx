import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Copy, Plus, RefreshCw, Ticket } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Badge, EmptyState, PageHeader, PageLoading } from '@/components/ui/Display'
import { Field, Input, Select, Switch } from '@/components/ui/Form'
import { ConfirmDialog } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import type { InviteItem } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { describeError, toast } from '@/store/toast'

const STATUS_TONE: Record<string, 'moss' | 'neutral' | 'clay' | 'danger'> = {
  active: 'moss',
  used: 'neutral',
  expired: 'clay',
  disabled: 'danger',
}

const STATUS_LABELS: Record<string, string> = {
  active: '可用',
  used: '已用完',
  expired: '已过期',
  disabled: '已停用',
}

export function AdminInvites() {
  const queryClient = useQueryClient()
  const [maxUses, setMaxUses] = useState('5')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const [autoApprove, setAutoApprove] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InviteItem | null>(null)

  const query = useQuery({ queryKey: ['admin', 'invites'], queryFn: api.admin.invites })

  const create = useMutation({
    mutationFn: () =>
      api.admin.createInvite({
        max_uses: Number(maxUses) || 1,
        auto_approve: autoApprove,
        note: note.trim() || null,
        expires_in_days: Number(days) || null,
      }),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
      setNote('')
      toast.success(`邀请码 ${invite.code} 建好了`)
    },
    onError: (error) => toast.error(describeError(error, '没建成')),
  })

  const disable = useMutation({
    mutationFn: (id: string) => api.admin.disableInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
      toast.success('已停用')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.deleteInvite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] })
      setDeleteTarget(null)
      toast.success('删掉了')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success(`已复制 ${code}`)
    } catch {
      toast.info(`手动记一下：${code}`)
    }
  }

  const invites = query.data ?? []
  const activeCount = invites.filter((item) => item.status === 'active').length

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="邀请码"
        description="注册模式设成「邀请码注册」时，就靠这个放人进来。"
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => query.refetch()}
          >
            刷新
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="order-2 lg:order-1">
          {query.isLoading ? (
            <PageLoading label="正在翻邀请码…" />
          ) : invites.length === 0 ? (
            <EmptyState
              icon={<Ticket className="size-6" />}
              title="还没有邀请码"
              description="右边填一下，几秒钟就生成一个。"
            />
          ) : (
            <div className="divide-y divide-line/60 overflow-hidden rounded-card border border-line bg-[#fcf8f0]">
              {invites.map((invite) => (
                <div key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="select-all font-mono text-[14px] tracking-[0.12em] text-ink">
                        {invite.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(invite.code)}
                        className="rounded p-1 text-ink-mute transition-colors hover:text-clay-deep"
                        aria-label="复制邀请码"
                        title="复制"
                      >
                        <Copy className="size-3" />
                      </button>
                      <Badge tone={STATUS_TONE[invite.status] ?? 'neutral'}>
                        {STATUS_LABELS[invite.status] ?? invite.status}
                      </Badge>
                      {invite.auto_approve && (
                        <Badge tone="moss">
                          <Check className="size-2.5" />
                          免审
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-mute">
                      <span>
                        已用 {invite.used_count} / {invite.max_uses}
                      </span>
                      {invite.expires_at && <span>{formatDate(invite.expires_at)} 到期</span>}
                      {invite.note && <span className="truncate">备注：{invite.note}</span>}
                    </div>
                  </div>

                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <span
                      className={cn(
                        'mr-1 h-1.5 w-12 overflow-hidden rounded-full bg-paper-3',
                        invite.status !== 'active' && 'opacity-40',
                      )}
                    >
                      <span
                        className="block h-full rounded-full bg-clay"
                        style={{
                          width: `${Math.min(100, (invite.used_count / Math.max(1, invite.max_uses)) * 100)}%`,
                        }}
                      />
                    </span>
                    {invite.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Ban className="size-3.5" />}
                        loading={disable.isPending && disable.variables === invite.id}
                        onClick={() => disable.mutate(invite.id)}
                      >
                        停用
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(invite)}
                      className="rounded px-2 py-1 text-[11.5px] text-ink-mute transition-colors hover:text-danger"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {invites.length > 0 && (
            <p className="mt-3 text-[11px] text-ink-mute">
              共 {invites.length} 个，其中 {activeCount} 个还能用。发出去之后记得提醒对方别外传。
            </p>
          )}
        </div>

        <aside className="order-1 h-fit rounded-card border border-line bg-[#fcf8f0] px-5 py-5 lg:order-2">
          <div className="font-serif text-[15px] text-ink">生成一个</div>
          <div className="mt-4 space-y-4">
            <Field label="能用几次" hint="用完自动作废。">
              <Input
                type="number"
                min={1}
                max={10000}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                className="max-w-28"
              />
            </Field>
            <Field label="多久到期">
              <Select value={days} onChange={(event) => setDays(event.target.value)}>
                <option value="7">7 天</option>
                <option value="30">30 天</option>
                <option value="90">三个月</option>
                <option value="365">一年</option>
                <option value="">永久</option>
              </Select>
            </Field>
            <Field label="备注" hint="给谁用的，自己心里有数就好。">
              <Input
                value={note}
                maxLength={100}
                onChange={(event) => setNote(event.target.value)}
                placeholder="比如：二舅家的人"
              />
            </Field>
            <Switch
              checked={autoApprove}
              onChange={setAutoApprove}
              label="用这个码进来的免审"
              description="省一步，但也少一道门。"
            />
            <Button
              className="w-full"
              icon={<Plus className="size-4" />}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              生成邀请码
            </Button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这个邀请码？"
        description={deleteTarget ? `${deleteTarget.code} 删除后立刻失效，已经用过的记录不受影响。` : ''}
        confirmText="删除"
        danger
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
