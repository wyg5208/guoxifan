import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const CONTROL =
  'w-full rounded-xl border border-line bg-white/70 px-3.5 text-ink placeholder:text-ink-mute/70 ' +
  'transition-colors focus:border-clay focus:bg-white focus:outline-none disabled:opacity-60'

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block space-y-1.5', className)}>
      {label && (
        <span className="flex items-center gap-1 text-[13px] font-medium text-ink-soft">
          {label}
          {required && <span className="text-danger">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-ink-mute">{hint}</span>
      ) : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-10 text-sm', className)} {...rest} />
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CONTROL, 'py-2.5 text-sm leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-10 appearance-none pr-8 text-sm', className)} {...rest}>
      {children}
    </select>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div className="min-w-0">
          {label && <div className="text-sm font-medium text-ink">{label}</div>}
          {description && <div className="mt-0.5 text-xs leading-relaxed text-ink-mute">{description}</div>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : '开关'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300',
          checked ? 'border-clay bg-clay' : 'border-line bg-paper-3',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-all duration-300 ease-soft',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = '搜一搜…',
  className,
  onSubmit,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  className?: string
  onSubmit?: () => void
}) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-mute"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.()
        }}
        placeholder={placeholder}
        className={cn(CONTROL, 'h-10 pl-10 text-sm')}
      />
    </div>
  )
}
