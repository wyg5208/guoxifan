import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { mediaUrl } from './api'
import type { MediaItem, MediaUrls } from './types'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

function toDate(value?: string | null): Date | null {
  if (!value) return null
  // 纯日期（如 1949-08-15）按本地零点解析，避免时区偏移导致日期错一天
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 2024年5月1日 / 2024-05-01 12:30 */
export function formatDate(value?: string | null, withTime = false): string {
  const date = toDate(value)
  if (!date) return ''
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (!withTime) return `${y}年${m}月${d}日`
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${d}日 ${hh}:${mm}`
}

/** 仅取年月：1949年8月 */
export function formatYearMonth(value?: string | null): string {
  const date = toDate(value)
  if (!date) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月`
}

/** 刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2024年5月1日 */
export function formatRelative(value?: string | null): string {
  const date = toDate(value)
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 0) return formatDate(value, true)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(value)
}

/** 聊天时间分隔：今天 14:30 / 昨天 14:30 / 5月1日 14:30 */
export function formatChatTime(value?: string | null): string {
  const date = toDate(value)
  if (!date) return ''
  const now = new Date()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `${hh}:${mm}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hh}:${mm}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`
}

/** 后台可能把 JSON 配置存成字符串（甚至二次编码），统一收敛成地址数组 */
export function toImageList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value !== 'string') return []
  const text = value.trim()
  if (!text) return []
  try {
    return toImageList(JSON.parse(text))
  } catch {
    // 不是 JSON，就当成单个地址
    return /^(https?:)?\//.test(text) ? [text] : []
  }
}

export function formatBytes(value: number): string {
  if (!value || value < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  const digits = size >= 100 || index === 0 ? 0 : 1
  return `${size.toFixed(digits)} ${units[index]}`
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function initials(name?: string | null): string {
  if (!name) return '村'
  const trimmed = name.trim()
  if (!trimmed) return '村'
  // 中文取最后一个字（姓名习惯），西文取首字母
  if (/^[\u4e00-\u9fa5]+$/.test(trimmed)) return trimmed.slice(-1)
  return trimmed.slice(0, 1).toUpperCase()
}

export function thumbOf(
  urls?: MediaUrls | null,
  fallback: 'thumb' | 'small' | 'medium' | 'original' = 'thumb',
): string {
  if (!urls) return ''
  // 大图弹层要的是 medium，别被默认的 thumb 抢先命中，否则会糊
  const order = {
    thumb: ['thumb', 'small', 'medium', 'original'],
    small: ['small', 'medium', 'thumb', 'original'],
    medium: ['medium', 'small', 'original', 'thumb'],
    original: ['original', 'medium', 'small', 'thumb'],
  }[fallback]
  for (const key of order) {
    const value = urls[key as keyof MediaUrls]
    if (typeof value === 'string' && value) return mediaUrl(value)
  }
  return ''
}

export function coverOf(media?: MediaItem | null): string {
  if (!media) return ''
  return thumbOf(media.urls, 'small')
}

export function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerpt(text?: string | null, length = 80): string {
  if (!text) return ''
  const clean = text.replace(/[#>*`_]/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > length ? `${clean.slice(0, length)}…` : clean
}

/** 支持极简 Markdown：# 标题、空行分段、> 引用、**加粗**、- 列表 */
export function renderMarkdown(source?: string | null): string {
  if (!source) return ''
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/)
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
        const items = lines.map((line) => `<li>${inline(escape(line.trim().replace(/^[-*]\s+/, '')))}</li>`)
        return `<ul>${items.join('')}</ul>`
      }
      if (block.startsWith('> ')) {
        const text = block.replace(/^>\s?/gm, '')
        return `<blockquote>${inline(escape(text))}</blockquote>`
      }
      const heading = block.match(/^(#{1,4})\s+(.*)$/)
      if (heading) {
        const level = Math.min(heading[1].length + 1, 4)
        return `<h${level}>${inline(escape(heading[2]))}</h${level}>`
      }
      if (/^---+$/.test(block.trim())) return '<hr />'
      return `<p>${inline(escape(block)).replace(/\n/g, '<br />')}</p>`
    })
    .join('')
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>')
}

export function isVideo(media?: MediaItem | null): boolean {
  return media?.kind === 'video'
}

export function downloadUrl(url: string): string {
  return url
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

/** 把文件按扩展名粗分类，用于聊天附件 */
export function attachmentKind(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

export function formatCount(value?: number | null): string {
  const n = value ?? 0
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}
