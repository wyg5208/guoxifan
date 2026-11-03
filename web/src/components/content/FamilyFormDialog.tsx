import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import type { FamilyCard, MediaItem } from '@/lib/types'
import { describeError, toast } from '@/store/toast'

interface FormState {
  name: string
  householder: string
  village_area: string
  door_no: string
  address_text: string
  current_loc: string
  relocated_at: string
  intro: string
  cover_url: string
}

const EMPTY: FormState = {
  name: '',
  householder: '',
  village_area: '',
  door_no: '',
  address_text: '',
  current_loc: '',
  relocated_at: '',
  intro: '',
  cover_url: '',
}

function fromFamily(family: FamilyCard | null): FormState {
  if (!family) return { ...EMPTY }
  return {
    name: family.name ?? '',
    householder: family.householder ?? '',
    village_area: family.village_area ?? '',
    door_no: family.door_no ?? '',
    address_text: family.address_text ?? '',
    current_loc: family.current_loc ?? '',
    relocated_at: family.relocated_at ?? '',
    intro: family.intro ?? '',
    cover_url: family.cover_url ?? '',
  }
}

const text = (value: string) => (value.trim() ? value.trim() : null)

/** 户（家庭）的登记与编辑，进「各家各户」页面对编辑者开放。 */
export function FamilyFormDialog({
  open,
  onClose,
  family = null,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  family?: FamilyCard | null
  onSaved?: (saved: FamilyCard) => void
}) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(() => fromFamily(family))
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) setForm(fromFamily(family))
  }, [open, family])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const pickCover = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const media: MediaItem = await api.uploads.image(file)
      set('cover_url', media.urls.small ?? media.urls.medium ?? media.urls.original ?? '')
      toast.success('照片选好了')
    } catch (error) {
      toast.error(describeError(error, '照片没传上去'))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        householder: text(form.householder),
        village_area: text(form.village_area),
        door_no: text(form.door_no),
        address_text: text(form.address_text),
        current_loc: text(form.current_loc),
        relocated_at: text(form.relocated_at),
        intro: text(form.intro),
        cover_url: form.cover_url || null,
      }
      return family ? api.families.update(family.id, body) : api.families.create(body)
    },
    onSuccess: (saved) => {
      toast.success(family ? '这户改好了' : '登记好了')
      queryClient.invalidateQueries({ queryKey: ['families'] })
      queryClient.invalidateQueries({ queryKey: ['family', saved.id] })
      queryClient.invalidateQueries({ queryKey: ['villagers'] })
      onSaved?.(saved)
      onClose()
    },
    onError: (error) => toast.error(describeError(error, '没存上')),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={family ? `编辑「${family.name}」` : '登记一户人家'}
      description="门牌上写的名字、老屋的样子。拆了以后，这些是唯一能对上的坐标。"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            算了
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!form.name.trim()}
            onClick={() => save.mutate()}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-line bg-paper-3">
            {form.cover_url ? (
              <img src={mediaUrl(form.cover_url)} alt="老屋" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-[12px] text-ink-mute">
                还没有老屋的照片
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={uploading}
            icon={uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
            onClick={() => fileInput.current?.click()}
          >
            选一张老屋照片
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => pickCover(event.target.files?.[0])}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="户名" required hint="一般按户主称呼，比如「老陈家」">
            <Input
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="户主">
            <Input
              value={form.householder}
              onChange={(event) => set('householder', event.target.value)}
              maxLength={60}
            />
          </Field>
          <Field label="自然村" hint="官庄畈 / 蓬上 / 过溪畈">
            <Input
              value={form.village_area}
              onChange={(event) => set('village_area', event.target.value)}
              maxLength={60}
            />
          </Field>
          <Field label="门牌号">
            <Input value={form.door_no} onChange={(event) => set('door_no', event.target.value)} maxLength={40} />
          </Field>
          <Field label="老宅位置" hint="写「村口第二棵樟树后面」也行">
            <Input
              value={form.address_text}
              onChange={(event) => set('address_text', event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="现在住哪">
            <Input
              value={form.current_loc}
              onChange={(event) => set('current_loc', event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="搬离时间">
            <Input
              type="date"
              value={form.relocated_at}
              onChange={(event) => set('relocated_at', event.target.value)}
            />
          </Field>
        </div>

        <Field label="这户人家的故事" hint="院子、家什、做饭的味道，写下来就留住了。">
          <Textarea
            value={form.intro}
            onChange={(event) => set('intro', event.target.value)}
            rows={4}
            maxLength={2000}
          />
        </Field>
      </div>
    </Modal>
  )
}
