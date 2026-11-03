import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  Camera,
  HardDrive,
  KeyRound,
  LogOut,
  NotebookPen,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { PostCard } from '@/components/content/PostCard'
import { Button, buttonClass } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, PageHeader, SectionTitle, Spinner } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { api, mediaUrl } from '@/lib/api'
import type { MediaItem } from '@/lib/types'
import { cn, formatBytes, formatDate, formatRelative, thumbOf } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const ROLE_LABELS: Record<string, string> = {
  member: '村民',
  editor: '记录者',
  admin: '管理员',
  super_admin: '站长',
}

type Tab = 'profile' | 'posts' | 'favorites'

export function ProfilePage() {
  const user = useAuth((state) => state.user)
  const ready = useAuth((state) => state.ready)
  const logout = useAuth((state) => state.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('profile')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const avatarInput = useRef<HTMLInputElement>(null)

  const quota = useQuery({ queryKey: ['uploads', 'quota'], queryFn: api.uploads.quota, retry: false })

  const myPosts = useQuery({
    queryKey: ['posts', 'mine', user?.id],
    queryFn: () =>
      api.posts.list({ author_id: user?.id, limit: 12 }).then((result) => result.data),
    enabled: Boolean(user?.id) && tab === 'posts',
  })

  const favorites = useQuery({
    queryKey: ['favorites', 'mine'],
    queryFn: () => api.interactions.favorites({ limit: 24 }).then((result) => result.data),
    enabled: Boolean(user?.id) && tab === 'favorites',
  })

  const saveProfile = useMutation({
    mutationFn: () =>
      api.auth.updateMe({
        nickname: nickname.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      }),
    onSuccess: (updated) => {
      useAuth.setState({ user: updated })
      toast.success('资料改好了')
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const changePassword = useMutation({
    mutationFn: () => api.auth.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('密码换了，下次用新密码登录')
    },
    onError: (error) => toast.error(describeError(error, '密码没改成')),
  })

  if (!ready) return null
  if (!user) return <Navigate to="/login?next=%2Fme" replace />

  const pickAvatar = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const media: MediaItem = await api.uploads.image(file)
      const url = media.urls.small ?? media.urls.thumb ?? media.urls.original ?? ''
      setAvatarUrl(url)
      toast.success('头像选好了，记得点保存')
    } catch (error) {
      toast.error(describeError(error, '头像没传上去'))
    } finally {
      setUploading(false)
      if (avatarInput.current) avatarInput.current.value = ''
    }
  }

  const passwordValid = newPassword.length >= 8 && newPassword === confirmPassword

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="我的" description="改了名字、换了头像，村子里的人还认得出你。">
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {(
            [
              ['profile', '我的资料'],
              ['posts', '我写的'],
              ['favorites', '收藏的'],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors',
                tab === value ? 'bg-clay/12 text-clay-deep' : 'text-ink-soft hover:bg-paper-2',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {tab === 'profile' && (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <section className="rounded-card border border-line bg-[#fcf8f0] px-5 py-6 shadow-soft sm:px-7">
              <SectionTitle eyebrow="Profile" title="认个人" className="mb-5" />
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar src={avatarUrl} name={nickname} size="xl" />
                  <button
                    type="button"
                    onClick={() => avatarInput.current?.click()}
                    className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border border-line bg-white text-ink-soft shadow-sm transition-colors hover:text-clay-deep"
                    aria-label="换头像"
                  >
                    {uploading ? <Spinner /> : <Camera className="size-3.5" />}
                  </button>
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => pickAvatar(event.target.files?.[0])}
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-serif text-[16px] text-ink">{user.nickname}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-mute">
                    <Badge tone="clay">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                    {user.villager_id && (
                      <Link
                        to={`/villagers/${user.villager_id}`}
                        className="transition-colors hover:text-clay-deep"
                      >
                        我的村民名片 →
                      </Link>
                    )}
                    {user.created_at && <span>{formatDate(user.created_at)} 加入</span>}
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <Field label="昵称" required>
                  <Input
                    value={nickname}
                    maxLength={20}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                </Field>
                <Field label="说两句" hint="比如：我是 xx 家的老二，现在住城里。">
                  <Textarea
                    value={bio}
                    rows={3}
                    maxLength={200}
                    onChange={(event) => setBio(event.target.value)}
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <Button loading={saveProfile.isPending} disabled={!nickname.trim()} onClick={() => saveProfile.mutate()}>
                    保存
                  </Button>
                  {(user.email || user.phone) && (
                    <span className="text-[11.5px] text-ink-mute">登录账号：{user.email || user.phone}</span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-card border border-line bg-white/50 px-5 py-6 sm:px-7">
              <SectionTitle eyebrow="Password" title="改密码" className="mb-5" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="现在的密码">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                  />
                </Field>
                <div />
                <Field label="新密码" hint="至少 8 位">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </Field>
                <Field
                  label="再输一次"
                  error={confirmPassword && newPassword !== confirmPassword ? '两次不一样' : undefined}
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </Field>
              </div>
              <Button
                variant="outline"
                className="mt-5"
                icon={<KeyRound className="size-4" />}
                loading={changePassword.isPending}
                disabled={!oldPassword || !passwordValid}
                onClick={() => changePassword.mutate()}
              >
                换密码
              </Button>
            </section>
          </div>

          <aside className="space-y-4">
            <div className="rounded-card border border-line bg-[#fcf8f0] px-5 py-5">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-clay/80">
                <HardDrive className="size-3.5" />
                上传空间
              </div>
              {quota.data ? (
                <>
                  <div className="mt-3 font-serif text-[22px] text-ink">
                    {formatBytes(quota.data.used_bytes)}
                    <span className="ml-1.5 text-[12px] font-normal text-ink-mute">
                      / {formatBytes(quota.data.total_bytes)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-3">
                    <div
                      className="h-full rounded-full bg-clay"
                      style={{
                        width: `${Math.min(
                          100,
                          quota.data.total_bytes
                            ? Math.round((quota.data.used_bytes / quota.data.total_bytes) * 100)
                            : 0,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-ink-mute">
                    还能传 {formatBytes(quota.data.remaining_bytes)}。照片多的时候，分批传更稳。
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[12px] text-ink-mute">
                  {quota.isError ? '暂时查不到空间用量' : '正在算…'}
                </p>
              )}
            </div>

            <div className="rounded-card border border-line bg-[#fcf8f0] px-5 py-5">
              <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.2em] text-clay/80">
                <ShieldCheck className="size-3.5" />
                我的权限
              </div>
              <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink-soft">
                <li className="flex justify-between">
                  <span className="text-ink-mute">发照片、写文章</span>
                  <span>{user.permissions.can_write ? '可以' : '未开放'}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-mute">进管理后台</span>
                  <span>{user.permissions.is_staff ? '可以' : '不行'}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-ink-mute">账号状态</span>
                  <span>
                    {user.status === 'active' ? '正常' : user.status === 'pending' ? '待审核' : '已停用'}
                  </span>
                </li>
              </ul>
              {user.permissions.is_staff && (
                <Link to="/admin" className={buttonClass('outline', 'sm', 'mt-4 w-full')}>
                  去后台
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                await logout()
                queryClient.clear()
                toast.info('已经退出，随时回来')
                navigate('/')
              }}
              className="flex w-full items-center justify-center gap-2 rounded-card border border-line bg-white/50 py-3 text-[12.5px] text-ink-mute transition-colors hover:border-danger/40 hover:text-danger"
            >
              <LogOut className="size-3.5" />
              退出登录
            </button>
          </aside>
        </div>
      )}

      {tab === 'posts' && (
        <div>
          {myPosts.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded-card bg-paper-3/70" />
              ))}
            </div>
          ) : (myPosts.data ?? []).length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="size-6" />}
              title="还没写过东西"
              description="村里的事，谁都记得一段。写下来，就留住了。"
              action={
                <Link to="/articles" className={buttonClass('primary', 'sm')}>
                  去写一篇
                </Link>
              }
            />
          ) : (
            <div className="space-y-1">
              {(myPosts.data ?? []).map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        <div>
          {favorites.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="aspect-square animate-pulse rounded-card bg-paper-3/70" />
              ))}
            </div>
          ) : (favorites.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Bookmark className="size-6" />}
              title="还没收藏什么"
              description="看到舍不得丢的照片和文章，点一下收藏就存这儿了。"
              action={
                <Link to="/albums" className={buttonClass('outline', 'sm')}>
                  去照片墙
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(favorites.data ?? []).map((item) => (
                <Link
                  key={`${item.target_type}-${item.post?.id ?? item.media?.id ?? item.created_at}`}
                  to={
                    item.post
                      ? `/p/${item.post.id}`
                      : item.media?.album_id
                        ? `/albums/${item.media.album_id}`
                        : '/albums'
                  }
                  className="group overflow-hidden rounded-card border border-line bg-[#fcf8f0] transition-colors hover:border-clay/40"
                >
                  <div className="aspect-square overflow-hidden bg-paper-3">
                    {item.media ? (
                      <img
                        src={thumbOf(item.media.urls, 'small')}
                        alt={item.media.title ?? ''}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 ease-soft group-hover:scale-105"
                      />
                    ) : item.post?.cover_url ? (
                      <img
                        src={mediaUrl(item.post.cover_url)}
                        alt={item.post.title ?? ''}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 ease-soft group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center px-3">
                        <span className="line-clamp-4 font-serif text-[13px] leading-relaxed text-ink-soft">
                          {item.post?.title || item.post?.summary || '一篇文字'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2">
                    <div className="truncate text-[12.5px] text-ink">
                      {item.post?.title || item.media?.title || item.media?.caption || '未命名'}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-ink-mute">
                      {formatRelative(item.created_at)}收藏
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-10 flex items-center gap-1.5 text-[11px] text-ink-mute">
        <UserRound className="size-3" />
        资料只有登录后能看到，联系方式按你的设置显示。
      </p>
    </div>
  )
}
