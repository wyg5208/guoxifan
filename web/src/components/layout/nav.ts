import {
  BookOpen,
  Home,
  Images,
  MessageCircle,
  NotebookPen,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** 移动端底部导航 */
  mobile?: boolean
  staffOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', icon: Home, mobile: true },
  { to: '/albums', label: '照片墙', icon: Images, mobile: true },
  { to: '/articles', label: '村里的事', icon: BookOpen, mobile: true },
  { to: '/shorts', label: '三言两语', icon: NotebookPen },
  { to: '/timeline', label: '村史', icon: ScrollText },
  { to: '/villagers', label: '村民', icon: Users },
  { to: '/chat', label: '聊天', icon: MessageCircle, mobile: true },
]

export const ADMIN_NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/admin', label: '总览', icon: Home },
  { to: '/admin/users', label: '用户审核', icon: Users },
  { to: '/admin/moderation', label: '内容审核', icon: ScrollText },
  { to: '/admin/settings', label: '站点配置', icon: Settings },
  { to: '/admin/invites', label: '邀请码', icon: NotebookPen },
]
