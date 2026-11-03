import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-clay text-white shadow-[0_10px_24px_-14px_rgba(142,92,43,0.9)] hover:bg-clay-deep active:translate-y-px',
  secondary: 'bg-paper-3 text-ink hover:bg-[#e7dbc9] active:translate-y-px',
  outline: 'border border-line bg-white/60 text-ink hover:border-clay hover:text-clay-deep',
  ghost: 'text-ink-soft hover:bg-paper-2 hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-95 active:translate-y-px',
  quiet: 'bg-clay/10 text-clay-deep hover:bg-clay/15',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-6 text-[15px]',
  icon: 'h-9 w-9 justify-center rounded-full',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(
    'inline-flex select-none items-center justify-center font-medium transition-all duration-200 ease-soft',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    extra,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  active = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors',
        active ? 'text-clay-deep' : 'text-ink-mute hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
