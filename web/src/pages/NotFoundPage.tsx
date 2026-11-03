import { Compass, Home, Images } from 'lucide-react'
import { Link } from 'react-router-dom'

import { buttonClass } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-paper-2 text-clay/70">
        <Compass className="size-7" />
      </div>
      <h1 className="mt-5 font-serif text-[26px] tracking-wide text-ink">这条路走岔了</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-mute">
        村里的小路多，走错了也没关系。照片还在，人还在，回头就行。
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link to="/" className={buttonClass('primary', 'md')}>
          <Home className="size-4" />
          回村口
        </Link>
        <Link to="/albums" className={buttonClass('outline', 'md')}>
          <Images className="size-4" />
          去照片墙
        </Link>
      </div>
    </div>
  )
}
