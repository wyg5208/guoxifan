import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/ui/Display'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import type { FamilyBrief, MediaItem, VillagerCard } from '@/lib/types'
import { describeError, toast } from '@/store/toast'

interface FormState {
  name: string
  alias: string
  gender: string
  generation: string
  relation_to_head: string
  family_id: string
  occupation: string
  birth_date: string
  death_date: string
  is_deceased: boolean
  contact: string
  contact_visibility: string
  intro: string
  avatar_url: string
}

const EMPTY: FormState = {
  name: '',
  alias: '',
  gender: 'unknown',
  generation: '',
  relation_to_head: '',
  family_id: '',
  occupation: '',
  birth_date: '',
  death_date: '',
  is_deceased: false,
  contact: '',
  contact_visibility: 'member',
  intro: '',
  avatar_url: '',
}

function fromVillager(villager: VillagerCard | null, defaultFamilyId?: string | null): FormState {
  if (!villager) return { ...EMPTY, family_id: defaultFamilyId ?? '' }
  return {
    name: villager.name ?? '',
    alias: villager.alias ?? '',
    gender: villager.gender ?? 'unknown',
    generation: villager.generation ?? '',
    relation_to_head: villager.relation_to_head ?? '',
    family_id: villager.family_id ?? '',
    occupation: villager.occupation ?? '',
    birth_date: villager.birth_date ?? '',
    death_date: villager.death_date ?? '',
    is_deceased: Boolean(villager.is_deceased),
    contact: villager.contact ?? '',
    contact_visibility: villager.contact_visibility || 'member',
    intro: villager.intro ?? '',
    avatar_url: villager.avatar_url ?? '',
  }
}

const text = (value: string) => (value.trim() ? value.trim() : null)

/**
 * 村民名片录入/编辑。编辑模式只开放这里列出的字段，避免误改 user_id 之类。
 * 说明：后端新建村民要求 editor 及以上，编辑本人名片走的是同一个接口。
 */
export function VillagerFormDialog({
  open,
  onClose,
  villager = null,
  defaultFamilyId = null,
  families = [],
  onSaved,
}: {
  open: boolean
  onClose: () => void
  villager?: VillagerCard | null
  defaultFamilyId?: string | null
  families?: FamilyBrief[]
  onSaved?: (saved: VillagerCard) => void
}) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(() => fromVillager(villager, defaultFamilyId))
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (open) setForm(fromVillager(villager, defaultFamilyId))
  }, [open, villager, defaultFamilyId])

  // 调用方没传人家列表（比如详情页）时自己拉一份，保证下拉框里能看到当前归属
  const familiesQuery = useQuery({
    queryKey: ['families'],
    queryFn: () => api.families.list().then((result) => result.data),
    enabled: open && families.length === 0,
    staleTime: 120_000,
  })
  const familyOptions: FamilyBrief[] = families.length ? families : (familiesQuery.data ?? [])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const pickAvatar = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const media: MediaItem = await api.uploads.image(file)
      set('avatar_url', media.urls.small ?? media.urls.thumb ?? media.urls.original ?? '')
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
        alias: text(form.alias),
        gender: form.gender,
        generation: text(form.generation),
        relation_to_head: text(form.relation_to_head),
        family_id: form.family_id || null,
        occupation: text(form.occupation),
        birth_date: text(form.birth_date),
        death_date: text(form.death_date),
        is_deceased: form.is_deceased,
        contact: text(form.contact),
        contact_visibility: form.contact_visibility,
        intro: text(form.intro),
        avatar_url: form.avatar_url || null,
      }
      return villager ? api.villagers.update(villager.id, body) : api.villagers.create(body)
    },
    onSuccess: (saved) => {
      toast.success(villager ? '名片改好了' : '人已录进名录')
      queryClient.invalidateQueries({ queryKey: ['villagers'] })
      queryClient.invalidateQueries({ queryKey: ['villager', saved.id] })
      queryClient.invalidateQueries({ queryKey: ['families'] })
      for (const familyId of [villager?.family_id, saved.family_id]) {
        if (familyId) queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      }
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
      title={villager ? `编辑 ${villager.name} 的名片` : '录一位村民'}
      description="不知道的先空着，以后想起来再补。空着也比写错了强。"
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
            保存名片
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar src={mediaUrl(form.avatar_url) || null} name={form.name || '村民'} size="xl" ring />
          <div className="min-w-0">
            <Button
              variant="outline"
              size="sm"
              loading={uploading}
              icon={uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              onClick={() => fileInput.current?.click()}
            >
              换照片
            </Button>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-mute">
              一张能看清脸的旧照片就好，身份证照不用。
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => pickAvatar(event.target.files?.[0])}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="姓名" required>
            <Input
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={60}
              placeholder="按村里叫的写"
            />
          </Field>
          <Field label="别名 / 小名" hint="比如「阿三」「老木匠」">
            <Input value={form.alias} onChange={(event) => set('alias', event.target.value)} maxLength={60} />
          </Field>
          <Field label="性别">
            <Select value={form.gender} onChange={(event) => set('gender', event.target.value)}>
              <option value="unknown">不详</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </Select>
          </Field>
          <Field label="所属人家">
            <Select value={form.family_id} onChange={(event) => set('family_id', event.target.value)}>
              <option value="">未归属</option>
              {familyOptions.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                  {family.door_no ? `（${family.door_no}）` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="在户里的身份" hint="户主、长子、三女儿…">
            <Input
              value={form.relation_to_head}
              onChange={(event) => set('relation_to_head', event.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="辈分" hint="比如「第三十世」或「士字辈」">
            <Input value={form.generation} onChange={(event) => set('generation', event.target.value)} maxLength={40} />
          </Field>
          <Field label="营生">
            <Input
              value={form.occupation}
              onChange={(event) => set('occupation', event.target.value)}
              maxLength={80}
              placeholder="种田、木匠、在外教书…"
            />
          </Field>
          <Field label="联系方式" hint="按下面的可见范围决定谁能看到">
            <Input value={form.contact} onChange={(event) => set('contact', event.target.value)} maxLength={120} />
          </Field>
          <Field label="出生">
            <Input type="date" value={form.birth_date} onChange={(event) => set('birth_date', event.target.value)} />
          </Field>
          <Field label="离世">
            <Input type="date" value={form.death_date} onChange={(event) => set('death_date', event.target.value)} />
          </Field>
        </div>

        <Switch
          checked={form.is_deceased}
          onChange={(next) => set('is_deceased', next)}
          label="已经离世"
          description="名录里会标注「已故」，头像转成灰度。"
        />

        <Field label="谁能看到联系方式">
          <Select
            value={form.contact_visibility}
            onChange={(event) => set('contact_visibility', event.target.value)}
          >
            <option value="public">所有人可见</option>
            <option value="member">登录的村民可见</option>
            <option value="private">只有管理员可见</option>
          </Select>
        </Field>

        <Field label="小传" hint="他做过什么、爱说什么话、院子里有什么，随手写几句都好。">
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
