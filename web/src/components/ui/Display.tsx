import type { ReactNode } from 'react'

import { mediaUrl } from '@/lib/api'
import { cn, initials } from '@/lib/utils'

const AVATAR_SIZES = {
  xs: 'size-7 text-[11px]',
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
} as const

export function Avatar({
  src,
  name,
  size = 'md',
  className,
  ring = false,
}: {
  src?: string | null
  name?: string | null
  size?: keyof typeof AVATAR_SIZES
  className?: string
  ring?: boolean
}) {
  const url = mediaUrl(src)
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-clay-soft font-serif text-clay-deep',
        AVATAR_SIZES[size],
        ring && 'ring-2 ring-white',
        className,
      )}
    >
      {url ? (
        <img src={url} alt={name ?? ''} loading="lazy" className="size-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'clay' | 'moss' | 'danger' | 'ink'
  className?: string
}) {
  const tones = {
    neutral: 'bg-paper-3 text-ink-soft',
    clay: 'bg-clay-soft text-clay-deep',
    moss: 'bg-moss/12 text-moss',
    danger: 'bg-danger/10 text-danger',
    ink: 'bg-ink text-paper',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-ink-mute', className)}>
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-clay" />
      {label}
    </span>
  )
}

export function SectionTitle({
  eyebrow,
  title,
  action,
  className,
  align = 'left',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  action?: ReactNode
  className?: string
  align?: 'left' | 'center'
}) {
  return (
    <div
      className={cn(
        'mb-6 flex items-end justify-between gap-4',
        align === 'center' && 'flex-col items-center text-center',
        className,
      )}
    >
      <div>
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.28em] text-clay">
            {align === 'center' && <span className="h-px w-6 bg-clay/40" />}
            {eyebrow}
            {align === 'center' && <span className="h-px w-6 bg-clay/40" />}
          </div>
        )}
        <h2 className="font-serif text-[22px] tracking-wide text-ink sm:text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  title = '这里还空着',
  description,
  action,
  icon,
  className,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-paper-2 text-clay/70">
        {icon ?? (
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19V7.5L12 4l8 3.5V19" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 19v-5h6v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="font-serif text-base text-ink">{title}</div>
      {description && <p className="max-w-sm text-sm leading-relaxed text-ink-mute">{description}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-paper-3/80', className)} />
}

export function PageHeader({
  title,
  description,
  action,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-8 border-b border-line/70 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-[26px] leading-tight tracking-wide text-ink sm:text-[30px]">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-ink-mute">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </header>
  )
}

export function PageLoading({ label = '正在加载…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-mute">
      <span className="size-6 animate-spin rounded-full border-2 border-line border-t-clay" />
      <span className="font-serif text-[13px] tracking-widest">{label}</span>
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line/80', className)} />
}
