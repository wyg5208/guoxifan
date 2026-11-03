import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useToastStore } from '@/store/toast'

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end">
      <AnimatePresence>
        {toasts.map((item) => {
          const Icon = ICONS[item.kind]
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => dismiss(item.id)}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-sm shadow-lift',
                item.kind === 'error'
                  ? 'border-danger/25 bg-[#fdf6f4] text-danger'
                  : item.kind === 'success'
                    ? 'border-moss/25 bg-[#f5f8f1] text-moss'
                    : 'border-line bg-[#fffdf9] text-ink-soft',
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="leading-relaxed">{item.message}</span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
