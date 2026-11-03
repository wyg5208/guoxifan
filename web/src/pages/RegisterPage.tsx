import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Form'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

type Mode = 'email' | 'phone'

export function RegisterPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const register = useAuth((state) => state.register)
  const config = useQuery({ queryKey: ['site-config'], queryFn: api.site.config, staleTime: 300_000 })

  const [mode, setMode] = useState<Mode>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [invite, setInvite] = useState(params.get('invite') ?? '')
  const [villagerName, setVillagerName] = useState('')
  const [familyId, setFamilyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ message: string; approved: boolean } | null>(null)

  const families = useQuery({
    queryKey: ['families'],
    queryFn: () => api.families.list().then((r) => r.data),
    staleTime: 300_000,
  })

  const mode2 = config.data?.feature.reg_mode ?? 'open'
  const site = config.data?.site

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!nickname.trim()) return setError('给自己起个名字吧')
    if (mode === 'email' && !email.trim()) return setError('填一个邮箱')
    if (mode === 'phone' && !phone.trim()) return setError('填一个手机号')
    if (password.length < 8) return setError('密码至少 8 位')
    if (password !== confirm) return setError('两次密码不一样')

    setLoading(true)
    try {
      const result = await register({
        email: mode === 'email' ? email.trim() : undefined,
        phone: mode === 'phone' ? phone.trim() : undefined,
        password,
        nickname: nickname.trim(),
        invite_code: invite.trim() || undefined,
        villager: villagerName.trim()
          ? { name: villagerName.trim(), family_id: familyId || null }
          : undefined,
      })
      setDone({ message: result.message, approved: result.auto_approved })
      if (result.auto_approved) toast.success('登记成功，欢迎回家')
    } catch (caught) {
      setError(describeError(caught, '登记失败，请稍后再试'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg pt-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-moss" />
        <h1 className="mt-4 font-serif text-[24px] text-ink">{done.approved ? '登记好了' : '登记好了，等一等'}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{done.message}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-mute">
          {done.approved
            ? '现在就可以发照片、写文章了。'
            : `管理员${site?.title ? `（${site.title}）` : ''}确认之后，你就可以发内容了。这段时间可以先逛逛。`}
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Button onClick={() => navigate('/')}>回首页看看</Button>
          <Button variant="outline" onClick={() => navigate('/me')}>
            去个人中心
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link
        to="/login"
        className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        已有账号，去登录
      </Link>

      <div className="mt-4 rounded-card border border-line bg-[#fffdf9] p-6 shadow-soft sm:p-8">
        <h1 className="font-serif text-[24px] text-ink">登记一下</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mute">
          {mode2 === 'closed'
            ? '现在暂时关闭了自助登记，请联系管理员开通。'
            : mode2 === 'invite'
              ? '这里需要邀请码才能登记。问问家里的长辈。'
              : '留个名字，让后来的人知道你也是这个村的人。'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="昵称" required hint="建议用村里人熟悉的名字">
            <Input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={40}
              placeholder="比如：王家老三"
            />
          </Field>

          <div>
            <div className="mb-2 inline-flex rounded-lg bg-paper-2 p-0.5">
              {(
                [
                  { value: 'email', label: '用邮箱' },
                  { value: 'phone', label: '用手机号' },
                ] as const
              ).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-[12.5px] transition-colors',
                    mode === item.value ? 'bg-[#fffdf9] text-ink shadow-sm' : 'text-ink-mute',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {mode === 'email' ? (
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            ) : (
              <Input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                placeholder="13800000000"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="密码" required hint="至少 8 位">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="再输一次" required>
              <Input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <Field
            label="邀请码"
            hint={mode2 === 'invite' ? '必填，向管理员索取' : '有就填，没有可以留空'}
          >
            <Input
              value={invite}
              onChange={(event) => setInvite(event.target.value.toUpperCase())}
              placeholder="XXXXXX"
              className="uppercase tracking-[0.2em]"
            />
          </Field>

          <div className="rounded-xl border border-dashed border-line bg-paper-2/40 p-3.5">
            <div className="mb-2 text-[12.5px] font-medium text-ink-soft">顺便建一张村民名片（可选）</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={villagerName}
                onChange={(event) => setVillagerName(event.target.value)}
                placeholder="真实姓名，如：王守义"
              />
              <Select value={familyId} onChange={(event) => setFamilyId(event.target.value)}>
                <option value="">属于哪一户</option>
                {(families.data ?? []).map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {error && <p className="rounded-lg bg-danger/8 px-3 py-2 text-[12.5px] text-danger">{error}</p>}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={loading}
            disabled={mode2 === 'closed'}
          >
            {mode2 === 'closed' ? '暂未开放登记' : '登记'}
          </Button>
        </form>
      </div>
    </div>
  )
}
