import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { api } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useAuth((state) => state.login)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const config = useQuery({ queryKey: ['site-config'], queryFn: api.site.config, staleTime: 300_000 })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!account.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const user = await login(account.trim(), password)
      toast.success(`回来了，${user.nickname}`)
      navigate(params.get('next') || '/', { replace: true })
    } catch (caught) {
      setError(describeError(caught, '登录失败，请检查账号或密码'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-0 overflow-hidden rounded-card border border-line bg-[#fffdf9] shadow-soft md:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-paper-2/70 p-9 md:flex">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, rgba(180,121,63,0.16), transparent 45%), radial-gradient(circle at 85% 85%, rgba(107,127,94,0.12), transparent 45%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex size-10 items-center justify-center rounded-[10px] bg-clay font-serif text-lg text-paper">
            村
          </div>
          <h2 className="mt-6 font-serif text-[22px] leading-relaxed text-ink">
            {config.data?.site.title || '老村记忆'}
          </h2>
          <p className="mt-3 max-w-xs text-[13px] leading-[1.95] text-ink-soft">
            {config.data?.site.hero_slogan ||
              '推门进来，把记得的事放下。这里不赶时间。'}
          </p>
        </div>
        <blockquote className="relative mt-10 border-l-2 border-clay/30 pl-4 font-serif text-[13px] leading-[1.95] text-ink-mute">
          树没了，路没了，
          <br />
          可有些名字还在嘴边。
        </blockquote>
      </div>

      <div className="p-7 sm:p-9">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink md:hidden"
        >
          <ArrowLeft className="size-3.5" />
          回到首页
        </Link>
        <h1 className="mt-4 font-serif text-[24px] text-ink md:mt-0">进门</h1>
        <p className="mt-1.5 text-[13px] text-ink-mute">用邮箱、手机号或昵称登录。</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="账号">
            <Input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              autoComplete="username"
              placeholder="邮箱 / 手机号 / 昵称"
            />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>

          {error && <p className="rounded-lg bg-danger/8 px-3 py-2 text-[12.5px] text-danger">{error}</p>}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            推门
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-[12px] text-ink-mute">
          <Link to="/register" className="transition-colors hover:text-clay-deep">
            还没有账号？登记一下 →
          </Link>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-3" />
            {config.data?.contact.admin_name
              ? `找${config.data.contact.admin_name}要密码`
              : '忘记密码找管理员'}
          </span>
        </div>

        <p className="mt-6 border-t border-line/70 pt-4 text-[11.5px] leading-relaxed text-ink-mute">
          登记后需要管理员确认才能发内容。在那之前，你可以随便逛逛。
        </p>
      </div>
    </div>
  )
}
