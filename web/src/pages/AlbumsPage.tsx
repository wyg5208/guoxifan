import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Images, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { UploadDialog } from '@/components/content/UploadDialog'
import { Button } from '@/components/ui/Button'
import { EmptyState, PageHeader, SectionTitle } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api, mediaUrl } from '@/lib/api'
import { useAuth } from '@/store/auth'
import { describeError, toast } from '@/store/toast'

const ERAS = ['1950年代', '1960年代', '1970年代', '1980年代', '1990年代', '2000年代', '2010年代', '拆迁前后']

export function AlbumsPage() {
  const user = useAuth((state) => state.user)
  const queryClient = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [era, setEra] = useState('')
  const [saving, setSaving] = useState(false)

  const albums = useQuery({
    queryKey: ['albums'],
    queryFn: () => api.albums.list().then((r) => r.data),
  })

  const createAlbum = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.albums.create({
        title: title.trim(),
        description: description.trim() || null,
        era: era || null,
      })
      toast.success('相册建好了')
      setCreateOpen(false)
      setTitle('')
      setDescription('')
      setEra('')
      queryClient.invalidateQueries({ queryKey: ['albums'] })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  const list = albums.data ?? []

  return (
    <div>
      <PageHeader
        title="照片墙"
        description="一张一张传上来，就是村子的样子。"
        action={
          <div className="flex gap-2">
            {user?.permissions.is_staff && (
              <Button variant="outline" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                建相册
              </Button>
            )}
            {user && (
              <Button size="sm" icon={<Images className="size-3.5" />} onClick={() => setUploadOpen(true)}>
                上传照片
              </Button>
            )}
          </div>
        }
      />

      {albums.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="aspect-[4/3] animate-pulse rounded-card bg-paper-3" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-paper-3" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="还是空的"
          description="你手机里那张村口的老照片，就是第一张。"
          icon={<Images className="size-6" />}
          action={
            user ? (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                传第一张
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((album) => (
              <Link
                key={album.id}
                to={`/albums/${album.id}`}
                className="group overflow-hidden rounded-card border border-line bg-[#fffdf9] shadow-soft transition-all duration-300 ease-soft hover:-translate-y-1 hover:shadow-lift"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-paper-3">
                  {album.cover_url ? (
                    <img
                      src={mediaUrl(album.cover_url)}
                      alt={album.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.05]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#f4e8d6,transparent_65%)]">
                      <Images className="size-7 text-clay/35" />
                    </div>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-full bg-ink/55 px-2 py-0.5 text-[10.5px] text-white/90 backdrop-blur-sm">
                    {album.media_count} 张
                  </span>
                </div>
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-[16px] text-ink">{album.title}</h3>
                    {album.era && <span className="text-[10.5px] text-clay">{album.era}</span>}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[12px] text-ink-mute">
                    {album.description || '还没有写说明'}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {(user?.permissions.is_staff || user) && (
            <SectionTitle
              eyebrow="Contribute"
              title="想起什么，就放进来"
              className="mt-14"
              action={
                user ? (
                  <Button variant="quiet" size="sm" onClick={() => setUploadOpen(true)}>
                    上传
                  </Button>
                ) : undefined
              }
            />
          )}
        </>
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        albums={list}
        onDone={() => albums.refetch()}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建一本相册"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button size="sm" loading={saving} onClick={createAlbum} disabled={!title.trim()}>
              建好
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="相册名" required>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="比如：打谷场的夏天" />
          </Field>
          <Field label="年份或时期">
            <Select value={era} onChange={(event) => setEra(event.target.value)}>
              <option value="">不指定</option>
              {ERAS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="说明">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="这本相册里都是什么？"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
