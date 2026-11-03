import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Download,
  FileText,
  ImagePlus,
  MessageCircle,
  Plus,
  Send,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button, IconButton, buttonClass } from '@/components/ui/Button'
import { Avatar, EmptyState, PageLoading, Spinner } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import { socket, type SocketMessage } from '@/lib/socket'
import type { MessageItem, RoomItem } from '@/lib/types'
import { cn, formatBytes, formatChatTime, formatRelative } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

function roomName(room: RoomItem): string {
  if (room.type === 'direct') return room.peer?.nickname || room.name || '私聊'
  if (room.type === 'hall') return room.name || '大厅'
  return room.name || '群聊'
}

function roomAvatar(room: RoomItem): string | null {
  return room.type === 'direct' ? (room.peer?.avatar_url ?? null) : room.avatar_url
}

// ---------------------------------------------------------------- 房间列表

function RoomRow({ room, active }: { room: RoomItem; active: boolean }) {
  return (
    <Link
      to={`/chat?room=${room.id}`}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
        active ? 'bg-clay/10' : 'hover:bg-paper-2',
      )}
    >
      <Avatar src={roomAvatar(room)} name={roomName(room)} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'truncate font-serif text-[14px]',
              active ? 'text-clay-deep' : 'text-ink',
            )}
          >
            {roomName(room)}
          </span>
          {room.type === 'hall' && (
            <span className="shrink-0 rounded bg-clay-soft px-1 text-[9.5px] leading-4 text-clay-deep">
              大厅
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10.5px] text-ink-mute">
            {room.last_message_at ? formatRelative(room.last_message_at) : ''}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="truncate text-[11.5px] text-ink-mute">
            {room.last_message_preview || '还没有人说话'}
          </span>
          {room.unread > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-danger px-1.5 text-[10px] font-semibold leading-4 text-white">
              {room.unread > 99 ? '99+' : room.unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function CreateRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: () =>
      api.chat.createRoom({
        type: 'group',
        name: name.trim(),
        description: description.trim() || null,
        is_public: true,
      }),
    onSuccess: () => {
      toast.success('群建好了')
      queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] })
      setName('')
      setDescription('')
      onClose()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  return (
    <Modal open={open} onClose={onClose} title="建个新群">
      <div className="space-y-4">
        <Field label="群的名字" required hint="比如：一起长大的兄弟姐妹、蓬上那边的人。">
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="群名" />
        </Field>
        <Field label="说一句介绍">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="这个群是干什么的？"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            算了
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            建群
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- 消息气泡

function MessageBody({ message }: { message: MessageItem }) {
  const attachment = message.attachment
  if (message.kind === 'image' && attachment) {
    return (
      <a href={mediaUrl(attachment.url)} target="_blank" rel="noreferrer" className="block">
        <img
          src={mediaUrl(attachment.url)}
          alt={attachment.filename}
          className="max-h-72 max-w-full rounded-lg object-cover"
        />
      </a>
    )
  }
  if (message.kind === 'video' && attachment) {
    return (
      <video
        src={mediaUrl(attachment.url)}
        controls
        preload="metadata"
        className="max-h-72 max-w-full rounded-lg bg-black/80"
      />
    )
  }
  if (message.kind === 'file' && attachment) {
    return (
      <a
        href={mediaUrl(attachment.url)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2.5 rounded-lg bg-white/60 px-3 py-2 transition-colors hover:bg-white"
      >
        <FileText className="size-5 shrink-0 text-clay" />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] text-ink">{attachment.filename}</span>
          <span className="block text-[10.5px] text-ink-mute">{formatBytes(attachment.size)}</span>
        </span>
        <Download className="ml-1 size-3.5 shrink-0 text-ink-mute" />
      </a>
    )
  }
  if (message.kind === 'system') {
    return <span className="text-[11.5px] text-ink-mute">{message.content}</span>
  }
  return <span className="whitespace-pre-wrap break-words">{message.content}</span>
}

function MessageBubble({ message, showName }: { message: MessageItem; showName: boolean }) {
  const me = useAuth((state) => state.user)
  const mine = message.sender_id === me?.id

  if (message.kind === 'system' || message.status === 'recalled') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-paper-3/70 px-3 py-0.5 text-[11px] text-ink-mute">
          {message.status === 'recalled' ? '这条消息被撤回了' : message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-2.5 px-1', mine ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar src={message.sender?.avatar_url} name={message.sender?.nickname} size="sm" />
      <div className={cn('flex max-w-[78%] flex-col gap-1', mine ? 'items-end' : 'items-start')}>
        {showName && !mine && (
          <span className="px-1 text-[10.5px] text-ink-mute">{message.sender?.nickname || '村民'}</span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_2px_rgba(36,28,22,0.04)]',
            mine
              ? 'rounded-tr-sm bg-clay text-white'
              : 'rounded-tl-sm border border-line/70 bg-[#fffdf9] text-ink',
          )}
        >
          <MessageBody message={message} />
        </div>
        <span className="px-1 text-[10px] text-ink-mute/80">{formatChatTime(message.created_at)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 消息窗口

function MessagePane({ room }: { room: RoomItem }) {
  const me = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [typingName, setTypingName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | null>(null)
  const lastTypingSent = useRef(0)

  const merge = useCallback((incoming: MessageItem[]) => {
    setMessages((previous) => {
      const seen = new Set(previous.map((item) => item.id))
      const merged = [...previous]
      for (const item of incoming) {
        if (!seen.has(item.id)) merged.push(item)
      }
      return merged.sort((a, b) => a.seq - b.seq)
    })
  }, [])

  // 首次进入：拉取最近 30 条
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setMessages([])
    setHasOlder(false)
    api.chat
      .messages(room.id, { limit: 30 })
      .then((page) => {
        if (cancelled) return
        setMessages([...page.data].reverse())
        setHasOlder(Boolean(page.meta?.has_more))
      })
      .catch((error) => {
        if (!cancelled) toast.error(describeError(error, '消息没拉下来'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [room.id])

  // 订阅房间
  useEffect(() => {
    socket.join(room.id)
    const off = socket.onMessage((event: SocketMessage) => {
      if (event.room_id !== room.id) return
      if (event.type === 'message' && event.message) {
        merge([event.message as MessageItem])
      }
      if (event.type === 'typing' && event.user_id !== me?.id) {
        setTypingName('有人在打字…')
        if (typingTimer.current) window.clearTimeout(typingTimer.current)
        typingTimer.current = window.setTimeout(() => setTypingName(null), 3200)
      }
    })
    return () => {
      off()
      socket.leave(room.id)
      if (typingTimer.current) window.clearTimeout(typingTimer.current)
    }
  }, [room.id, me?.id, merge])

  // 滚到底 + 已读
  const lastSeq = messages.length ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (loading) return
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [loading, room.id])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 220
    if (nearBottom) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!lastSeq) return
    api.chat
      .read(room.id, lastSeq)
      .then(() => queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] }))
      .catch(() => undefined)
  }, [lastSeq, room.id, queryClient])

  const loadOlder = async () => {
    if (loadingOlder || !messages.length) return
    setLoadingOlder(true)
    const element = scroller.current
    const previousHeight = element?.scrollHeight ?? 0
    try {
      const page = await api.chat.messages(room.id, { before_seq: messages[0].seq, limit: 30 })
      const older = [...page.data].reverse()
      setMessages((previous) => [...older, ...previous])
      setHasOlder(Boolean(page.meta?.has_more))
      window.requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - previousHeight
      })
    } catch (error) {
      toast.error(describeError(error, '更早的消息没拉到'))
    } finally {
      setLoadingOlder(false)
    }
  }

  const appendSent = (message: MessageItem) => {
    merge([message])
    queryClient.invalidateQueries({ queryKey: ['chat', 'rooms'] })
  }

  const sendText = async () => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const message = await api.chat.send(room.id, {
        kind: 'text',
        content,
        client_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      appendSent(message)
      setDraft('')
    } catch (error) {
      toast.error(describeError(error, '没发出去'))
    } finally {
      setSending(false)
    }
  }

  const sendFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const attachment = await api.uploads.attachment(file)
        const message = await api.chat.send(room.id, {
          kind: attachment.kind,
          attachment_id: attachment.id,
          client_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        })
        appendSent(message)
      }
    } catch (error) {
      toast.error(describeError(error, '文件没传上去'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const notifyTyping = () => {
    const now = Date.now()
    if (now - lastTypingSent.current < 2600) return
    lastTypingSent.current = now
    socket.typing(room.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line/70 px-4 py-3">
        <Link
          to="/chat"
          className="inline-flex items-center gap-1 text-[12px] text-ink-mute transition-colors hover:text-ink lg:hidden"
        >
          <ArrowLeft className="size-3.5" />
          会话
        </Link>
        <Avatar src={roomAvatar(room)} name={roomName(room)} size="sm" className="hidden lg:inline-flex" />
        <div className="min-w-0">
          <div className="truncate font-serif text-[15px] text-ink">{roomName(room)}</div>
          <div className="truncate text-[10.5px] text-ink-mute">
            {room.type === 'direct'
              ? '只有你们两个人看得到'
              : `${room.member_count} 人在这个会话里`}
          </div>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <PageLoading label="正在翻开聊天记录…" />
          </div>
        ) : (
          <>
            {hasOlder && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-paper-3/70 px-3 py-1 text-[11px] text-ink-soft transition-colors hover:bg-paper-3 disabled:opacity-50"
                >
                  {loadingOlder ? '正在往前翻…' : '再往前翻翻'}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <EmptyState
                icon={<MessageCircle className="size-6" />}
                title="这儿还没人说话"
                description="说句“我回来了”，或者发张院子的照片。"
                className="py-10"
              />
            )}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const showName = !previous || previous.sender_id !== message.sender_id
              return <MessageBubble key={message.id} message={message} showName={showName} />
            })}
            {typingName && <div className="px-3 text-[11px] text-ink-mute">{typingName}</div>}
          </>
        )}
      </div>

      <div className="border-t border-line/70 bg-[#fffdf9]/80 px-3 py-3 sm:px-4">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
            className="hidden"
            onChange={(event) => sendFiles(event.target.files)}
          />
          <IconButton
            label="发图片或文件"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mb-0.5"
          >
            {uploading ? <Spinner /> : <ImagePlus className="size-[18px]" />}
          </IconButton>
          <Textarea
            value={draft}
            rows={1}
            placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
            onChange={(event) => {
              setDraft(event.target.value)
              notifyTyping()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendText()
              }
            }}
            className="max-h-32 min-h-10 resize-none py-2.5"
          />
          <Button
            size="md"
            loading={sending}
            disabled={!draft.trim()}
            onClick={sendText}
            icon={<Send className="size-4" />}
            className="mb-0.5"
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 页面

export function ChatPage() {
  const [params] = useSearchParams()
  const roomId = params.get('room')
  const me = useAuth((state) => state.user)
  const ready = useAuth((state) => state.ready)
  const [keyword, setKeyword] = useState('')
  const [creating, setCreating] = useState(false)

  const rooms = useQuery({
    queryKey: ['chat', 'rooms'],
    queryFn: () => api.chat.rooms().then((result) => result.data),
    enabled: Boolean(me),
    refetchInterval: 30_000,
  })

  // 从村民名片点「私信」进来时，房间可能还没进列表缓存，单独补一次
  const missing = Boolean(roomId) && !(rooms.data ?? []).some((room) => room.id === roomId)
  const roomDetail = useQuery({
    queryKey: ['chat', 'room', roomId],
    queryFn: () => api.chat.room(roomId as string),
    enabled: Boolean(me) && missing,
    retry: false,
  })

  const list = useMemo(() => {
    const data = rooms.data ?? []
    const sorted = [...data].sort((a, b) => {
      const left = a.last_message_at ?? ''
      const right = b.last_message_at ?? ''
      return right.localeCompare(left)
    })
    if (!keyword.trim()) return sorted
    return sorted.filter((room) =>
      `${roomName(room)}${room.last_message_preview ?? ''}`.includes(keyword.trim()),
    )
  }, [rooms.data, keyword])

  const active = useMemo(
    () => (rooms.data ?? []).find((room) => room.id === roomId) ?? roomDetail.data ?? null,
    [rooms.data, roomId, roomDetail.data],
  )

  if (!ready) return <PageLoading label="正在开门…" />

  if (!me) {
    return (
      <EmptyState
        icon={<MessageCircle className="size-6" />}
        title="聊天要先报个到"
        description="搬走了也还是一个村的人。登录之后，就能在村口聊两句。"
        action={
          <div className="flex gap-2">
            <Link to="/login?next=%2Fchat" className={buttonClass('primary', 'md')}>
              登录
            </Link>
            <Link to="/register" className={buttonClass('outline', 'md')}>
              注册
            </Link>
          </div>
        }
        className="py-24"
      />
    )
  }

  return (
    <div className="mx-auto -mt-2 max-w-5xl">
      <div className="flex h-[calc(100dvh-12rem)] min-h-[26rem] overflow-hidden rounded-card border border-line bg-[#fffdf9] shadow-soft lg:h-[calc(100dvh-10rem)]">
        <aside
          className={cn(
            'flex w-full shrink-0 flex-col border-r border-line/70 lg:w-72',
            roomId && 'hidden lg:flex',
          )}
        >
          <div className="border-b border-line/70 px-3 py-3">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[16px] tracking-wide text-ink">村口</h1>
              <span className="text-[10.5px] text-ink-mute">有话就说</span>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="ml-auto inline-flex size-7 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-paper-2 hover:text-clay-deep"
                aria-label="建群"
                title="建个新群"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="找会话…"
              className="mt-2.5 h-8 w-full rounded-lg border border-line bg-white/70 px-2.5 text-[12.5px] text-ink placeholder:text-ink-mute/70 focus:border-clay focus:outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 py-2">
            {rooms.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-xl bg-paper-3/70" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <p className="px-3 py-8 text-center text-[12px] text-ink-mute">还没有会话</p>
            ) : (
              list.map((room) => <RoomRow key={room.id} room={room} active={room.id === roomId} />)
            )}
          </div>
          <div className="border-t border-line/70 px-3 py-2 text-[10.5px] text-ink-mute">
            找个村民，也能单独说话 →
          </div>
        </aside>

        <section className={cn('min-w-0 flex-1', !roomId && 'hidden lg:block')}>
          {active ? (
            <MessagePane key={active.id} room={active} />
          ) : roomId ? (
            <div className="flex h-full items-center justify-center">
              <PageLoading label="正在打开会话…" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-paper-2 text-clay/70">
                <Users className="size-6" />
              </div>
              <div>
                <div className="font-serif text-[16px] text-ink">左边的会话，随便点一个</div>
                <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-ink-mute">
                  大厅里谁都可能在。想单独聊，就去村民名录里找人，点「私信」。
                </p>
              </div>
              <Link to="/villagers" className={buttonClass('outline', 'sm')}>
                去村民名录
              </Link>
            </div>
          )}
        </section>
      </div>

      <CreateRoomDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
