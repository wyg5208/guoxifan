import { PageLoading } from '@/components/ui/Display'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/store/auth'

export function RequireAuth({
  children,
  staff = false,
}: {
  children: ReactNode
  staff?: boolean
}) {
  const user = useAuth((state) => state.user)
  const ready = useAuth((state) => state.ready)
  const location = useLocation()

  if (!ready) return <PageLoading label="正在翻开这本册子…" />
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (staff && !user.permissions.is_staff) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
