import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Check,
  CheckCheck,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, PageHeader, PageLoading } from '@/components/ui/Display'
import { Input, Select } from '@/components/ui/Form'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import type { AdminUser } from '@/lib/types'
import { cn, formatDate, formatRelative } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  active: '正常',
  disabled: '已停用',
}

const ROLE_LABELS: Record<string, string> = {
  member: '村民',
  editor: '记录者',
  admin: '管理员',
  super_admin: '站长',
}

const ROLE_OPTIONS = ['member', 'editor', 'admin', 'super_admin']

type StatusFilter = 'pending' | 'active' | 'disabled' | 'all'

export function AdminUsers() {
  const me = useAuth((state) => state.user)
  const isAdmin = Boolean(me?.permissions?.is_admin)
  const queryClient = useQueryClient()

  const [status, setStatusFilter] = useState<StatusFilter>('pending')
  const [keyword, setKeyword] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [issuedPassword, setIssuedPassword] = useState<{ name: string; password: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'users', status, submitted],
    queryFn: () =>
      api.admin
        .users({
          status: status === 'all' ? undefined : status,
          q: submitted || undefined,
          limit: 50,
        })
        .then((result) => result.data),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin'] })
    setSelected([])
  }

  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approve(id),
    onSuccess: () => {
      toast.success('通过了')
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const reject = useMutation({
    mutationFn: (id: string) => api.admin.reject(id, '未通过审核'),
    onSuccess: () => {
      toast.success('已拒绝')
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const batchApprove = useMutation({
    mutationFn: (ids: string[]) => api.admin.batchApprove(ids),
    onSuccess: (result) => {
      toast.success(`通过了 ${result.approved} 个`)
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.admin.setRole(id, role),
    onSuccess: () => {
      toast.success('角色改了')
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) => api.admin.setStatus(id, next),
    onSuccess: () => {
      toast.success('状态改了')
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.admin.resetPassword(id),
    onSuccess: (result) => {
      setResetTarget(null)
      setIssuedPassword({
        name: resetTarget?.nickname ?? '该用户',
        password: result.password,
      })
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.removeUser(id),
    onSuccess: () => {
      toast.success('账号已删除')
      setDeleteTarget(null)
      refresh()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const users = query.data ?? []
  const allSelected = users.length > 0 && selected.length === users.length

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="用户审核"
        description="认一认来的人：是村里的，还是路过的。通过之后才能发东西。"
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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(
          [
            ['pending', '待审核'],
            ['active', '正常'],
            ['disabled', '已停用'],
            ['all', '全部'],
          ] as [StatusFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatusFilter(value)
              setSelected([])
            }}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors',
              status === value ? 'bg-clay/12 text-clay-deep' : 'text-ink-soft hover:bg-paper-2',
            )}
          >
            {label}
          </button>
        ))}

        <form
          className="ml-auto flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(keyword.trim())
            setSelected([])
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-mute" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="昵称 / 邮箱 / 手机号"
              className="h-9 w-52 pl-8 text-[12.5px]"
            />
          </div>
          <Button variant="outline" size="sm" type="submit">
            搜
          </Button>
        </form>
      </div>

      {status === 'pending' && users.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-clay/25 bg-clay/[0.05] px-3.5 py-2.5 text-[12.5px] text-ink-soft">
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : users.map((item) => item.id))}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft transition-colors hover:text-clay-deep"
          >
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded border',
                allSelected ? 'border-clay bg-clay text-white' : 'border-line bg-white',
              )}
            >
              {allSelected && <Check className="size-3" />}
            </span>
            {allSelected ? '取消全选' : '全选'}
          </button>
          <span className="text-ink-mute">已选 {selected.length} 个</span>
          <Button
            size="sm"
            className="ml-auto"
            icon={<CheckCheck className="size-3.5" />}
            loading={batchApprove.isPending}
            disabled={selected.length === 0}
            onClick={() => batchApprove.mutate(selected)}
          >
            批量通过
          </Button>
        </div>
      )}

      {query.isLoading ? (
        <PageLoading label="正在翻名单…" />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="size-6" />}
          title={status === 'pending' ? '没有等着审核的人' : '没找到人'}
          description={
            status === 'pending'
              ? '有人来注册，这里就会出现。'
              : '换个状态或者换个关键词试试。'
          }
        />
      ) : (
        <div className="divide-y divide-line/60 overflow-hidden rounded-card border border-line bg-[#fcf8f0]">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5">
              {status === 'pending' && (
                <button
                  type="button"
                  onClick={() =>
                    setSelected((previous) =>
                      previous.includes(user.id)
                        ? previous.filter((id) => id !== user.id)
                        : [...previous, user.id],
                    )
                  }
                  className={cn(
                    'mt-2.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                    selected.includes(user.id)
                      ? 'border-clay bg-clay text-white'
                      : 'border-line bg-white hover:border-clay',
                  )}
                  aria-label="选择"
                >
                  {selected.includes(user.id) && <Check className="size-3" />}
                </button>
              )}

              <Avatar src={user.avatar_url} name={user.nickname} size="md" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-serif text-[14.5px] text-ink">{user.nickname}</span>
                  <Badge tone={user.status === 'pending' ? 'clay' : user.status === 'disabled' ? 'danger' : 'moss'}>
                    {STATUS_LABELS[user.status] ?? user.status}
                  </Badge>
                  <Badge tone="neutral">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                  {user.id === me?.id && <Badge tone="ink">我</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-mute">
                  {user.email && <span>{user.email}</span>}
                  {user.phone && <span>{user.phone}</span>}
                  <span>注册于 {formatDate(user.created_at)}</span>
                  {user.last_login_at && <span>上次登录 {formatRelative(user.last_login_at)}</span>}
                </div>
                {user.bio && <p className="mt-1 line-clamp-1 text-[11.5px] text-ink-soft">{user.bio}</p>}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {user.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      icon={<Check className="size-3.5" />}
                      loading={approve.isPending && approve.variables === user.id}
                      onClick={() => approve.mutate(user.id)}
                    >
                      通过
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<X className="size-3.5" />}
                      loading={reject.isPending && reject.variables === user.id}
                      onClick={() => reject.mutate(user.id)}
                    >
                      拒绝
                    </Button>
                  </>
                )}

                {isAdmin && user.id !== me?.id && (
                  <>
                    <Select
                      value={user.role}
                      onChange={(event) => setRole.mutate({ id: user.id, role: event.target.value })}
                      className="h-8 w-24 text-[12px]"
                      aria-label="角色"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={user.status === 'disabled' ? <ShieldCheck className="size-3.5" /> : <Ban className="size-3.5" />}
                      onClick={() =>
                        setStatus.mutate({
                          id: user.id,
                          next: user.status === 'disabled' ? 'active' : 'disabled',
                        })
                      }
                      title={user.status === 'disabled' ? '恢复' : '停用'}
                    >
                      {user.status === 'disabled' ? '恢复' : '停用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<KeyRound className="size-3.5" />}
                      onClick={() => setResetTarget(user)}
                      title="重置密码"
                    >
                      密码
                    </Button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(user)}
                      className="rounded-lg p-1.5 text-ink-mute/70 transition-colors hover:text-danger"
                      aria-label="删除账号"
                      title="删除"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-mute">
        最多显示 50 条{status === 'pending' ? '' : '，用关键词缩小范围更快'}。
        {status === 'pending' && users.length > 0 && ' 待审核的人看完最好当天处理掉。'}
      </p>

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="重置密码"
        description={resetTarget ? `给「${resetTarget.nickname}」换一个新密码，旧密码立即失效。` : ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setResetTarget(null)}>
              算了
            </Button>
            <Button
              size="sm"
              loading={resetPassword.isPending}
              onClick={() => resetTarget && resetPassword.mutate(resetTarget.id)}
            >
              重置
            </Button>
          </>
        }
      />

      <Modal
        open={Boolean(issuedPassword)}
        onClose={() => setIssuedPassword(null)}
        title="新密码"
        description="记下来交给本人，关掉之后就看不到了。"
        size="sm"
        footer={
          <Button size="sm" onClick={() => setIssuedPassword(null)}>
            记下了
          </Button>
        }
      >
        <div className="rounded-xl border border-clay/30 bg-clay/[0.06] px-4 py-4 text-center">
          <div className="text-[11.5px] text-ink-mute">{issuedPassword?.name}</div>
          <div className="mt-2 select-all font-mono text-[20px] tracking-[0.12em] text-ink">
            {issuedPassword?.password}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除这个账号？"
        description={
          deleteTarget
            ? `「${deleteTarget.nickname}」将无法再登录。ta 发过的照片和文章会保留。`
            : ''
        }
        confirmText="删除"
        danger
        loading={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
