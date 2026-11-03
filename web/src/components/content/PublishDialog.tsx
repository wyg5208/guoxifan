import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import type { PostItem } from '@/lib/types'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const CATEGORIES = ['村史', '人物', '风物', '口述', '老照片', '随笔']

export function PublishDialog({
  open,
  onClose,
  defaultKind = 'article',
}: {
  open: boolean
  onClose: () => void
  defaultKind?: 'article' | 'short'
}) {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [kind, setKind] = useState<'article' | 'short'>(defaultKind)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('村史')
  const [tags, setTags] = useState('')
  const [cover, setCover] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const reset = () => {
    setKind(defaultKind)
    setTitle('')
    setContent('')
    setSummary('')
    setCategory('村史')
    setTags('')
    setCover(null)
  }

  const close = () => {
    onClose()
    reset()
  }

  const publish = useMutation({
    mutationFn: (status: 'draft' | 'published') =>
      api.posts.create({
        kind,
        title: kind === 'article' ? title.trim() || null : null,
        summary: summary.trim() || null,
        content: content.trim(),
        category: kind === 'article' ? category : null,
        tags: tags
          .split(/[,，\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
        cover_url: cover,
        status,
      }),
    onSuccess: (post: PostItem, status) => {
      toast.success(status === 'draft' ? '已存为草稿' : post.status === 'pending' ? '已提交，等待审核' : '已经发出来了')
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      close()
      if (status === 'published') navigate(`/p/${post.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const pickCover = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const media = await api.uploads.image(file)
      setCover(media.urls.small || media.urls.medium || media.urls.thumb || null)
      toast.success('封面已选好')
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setUploading(false)
    }
  }

  const canPublish = content.trim().length > 0 && (kind === 'short' || title.trim().length > 0)

  return (
    <Modal
      open={open}
      onClose={close}
      title={kind === 'article' ? '写一篇' : '说两句'}
      description="慢慢写，写完可以先存草稿。支持 # 标题、> 引用、- 列表 与 **加粗**。"
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close}>
            取消
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canPublish}
            loading={publish.isPending && publish.variables === 'draft'}
            onClick={() => publish.mutate('draft')}
          >
            存草稿
          </Button>
          <Button
            size="sm"
            disabled={!canPublish}
            loading={publish.isPending && publish.variables === 'published'}
            onClick={() => publish.mutate('published')}
          >
            发布
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-xl bg-paper-2 p-1">
          {(
            [
              { value: 'article', label: '文章' },
              { value: 'short', label: '短句' },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setKind(item.value)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] transition-colors ${
                kind === item.value ? 'bg-[#fffdf9] text-ink shadow-sm' : 'text-ink-mute hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {kind === 'article' && (
          <Field label="标题" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="给它起个名字，比如「村口那棵老槐树」"
            />
          </Field>
        )}

        <Field label="正文" required hint={`${content.length} 字`}>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={kind === 'short' ? 5 : 12}
            placeholder={
              kind === 'short'
                ? '一句话也行，几十个字也行。想到什么就写什么。'
                : '从哪一年说起？那个人长什么样？那天风大不大？'
            }
          />
        </Field>

        {kind === 'article' && (
          <>
            <Field label="摘要" hint="留空会自动截取正文开头">
              <Textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="用一两句话概括，会显示在列表里"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="分类">
                <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="标签" hint="用空格或逗号分隔，最多 8 个">
                <Input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="老槐树 夏天 童年"
                />
              </Field>
            </div>

            <Field label="封面">
              {cover ? (
                <div className="relative inline-block">
                  <img src={mediaUrl(cover)} alt="封面" className="h-28 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setCover(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-ink/80 p-1 text-white"
                    aria-label="移除封面"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[12px] text-ink-mute transition-colors hover:border-clay hover:text-clay-deep"
                >
                  <ImagePlus className="size-5" />
                  {uploading ? '上传中…' : '选一张封面'}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => pickCover(event.target.files?.[0])}
              />
            </Field>
          </>
        )}

        {!user?.permissions.can_write && (
          <p className="rounded-lg bg-clay/8 px-3 py-2 text-[12px] text-clay-deep">
            你的账号还在审核中，文章会先保存，通过后自动发布。
          </p>
        )}
      </div>
    </Modal>
  )
}
