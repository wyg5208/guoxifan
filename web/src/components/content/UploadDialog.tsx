import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Film, ImagePlus, Loader2, AlertCircle } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import type { AlbumItem } from '@/lib/types'
import { formatBytes } from '@/lib/utils'
import { describeError, toast } from '@/store/toast'

type Row = {
  id: string
  name: string
  size: number
  kind: 'image' | 'video'
  progress: number
  state: 'waiting' | 'uploading' | 'done' | 'error'
  message?: string
}

const IMAGE_DIRECT_LIMIT = 8 * 1024 * 1024

export function UploadDialog({
  open,
  onClose,
  albumId,
  albums,
  onDone,
}: {
  open: boolean
  onClose: () => void
  albumId?: string | null
  albums: AlbumItem[]
  onDone?: () => void
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const filesMap = useRef(new Map<string, File>())
  const [rows, setRows] = useState<Row[]>([])
  const [targetAlbum, setTargetAlbum] = useState(albumId ?? '')
  const [busy, setBusy] = useState(false)

  const quota = useQuery({ queryKey: ['uploads', 'quota'], queryFn: api.uploads.quota, enabled: open })

  const patch = (id: string, next: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)))

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const next: Row[] = []
    Array.from(files).forEach((file, index) => {
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isVideo && !isImage) {
        toast.error(`${file.name} 不是图片或视频`)
        return
      }
      const id = `${Date.now()}-${index}-${file.name}`
      next.push({
        id,
        name: file.name,
        size: file.size,
        kind: isVideo ? 'video' : 'image',
        progress: 0,
        state: 'waiting',
      })
      filesMap.current.set(id, file)
    })
    setRows((current) => [...current, ...next])
  }

  const start = async () => {
    const pending = rows.filter((row) => row.state === 'waiting' || row.state === 'error')
    if (pending.length === 0) return
    setBusy(true)
    let success = 0

    for (const row of pending) {
      const file = filesMap.current.get(row.id)
      if (!file) continue
      patch(row.id, { state: 'uploading', progress: 0, message: undefined })
      try {
        if (row.kind === 'image' && file.size <= IMAGE_DIRECT_LIMIT) {
          await api.uploads.image(file, targetAlbum || null)
          patch(row.id, { state: 'done', progress: 1 })
        } else {
          await api.uploads.large(
            file,
            targetAlbum || null,
            (ratio) => patch(row.id, { progress: ratio }),
          )
          patch(row.id, { state: 'done', progress: 1 })
        }
        success += 1
      } catch (error) {
        patch(row.id, { state: 'error', message: describeError(error, '上传失败') })
      }
    }

    setBusy(false)
    if (success > 0) {
      toast.success(`已上传 ${success} 个文件${targetAlbum ? '，正在整理进相册' : ''}`)
      queryClient.invalidateQueries({ queryKey: ['media'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      queryClient.invalidateQueries({ queryKey: ['uploads', 'quota'] })
      onDone?.()
    }
  }

  const close = () => {
    if (busy) return
    onClose()
    setRows([])
    filesMap.current.clear()
  }

  const totalSize = rows.reduce((sum, row) => sum + row.size, 0)

  return (
    <Modal
      open={open}
      onClose={close}
      title="往这儿放点东西"
      description="照片、录像都行。视频会自动转成手机上也能看的格式，可能需要等一会儿。"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
            关闭
          </Button>
          <Button size="sm" loading={busy} disabled={rows.length === 0} onClick={start}>
            开始上传
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="放进哪个相册" hint={albums.length === 0 ? '还没有相册，会先放到未归类里' : undefined}>
          <Select value={targetAlbum} onChange={(event) => setTargetAlbum(event.target.value)}>
            <option value="">未归类</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.title}
              </option>
            ))}
          </Select>
        </Field>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-paper-2/40 py-8 text-[13px] text-ink-mute transition-colors hover:border-clay hover:text-clay-deep"
        >
          <span className="flex gap-3">
            <ImagePlus className="size-5" />
            <Film className="size-5" />
          </span>
          点这里选文件，或者把文件拖进来
          {quota.data && (
            <span className="text-[11px] text-ink-mute">
              已用 {formatBytes(quota.data.used_bytes)} / {formatBytes(quota.data.total_bytes)}
            </span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />

        {rows.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-line/80 bg-white/60 px-3 py-2">
                <div className="flex items-center gap-2 text-[12.5px]">
                  {row.state === 'done' ? (
                    <CheckCircle2 className="size-3.5 text-moss" />
                  ) : row.state === 'error' ? (
                    <AlertCircle className="size-3.5 text-danger" />
                  ) : row.state === 'uploading' ? (
                    <Loader2 className="size-3.5 animate-spin text-clay" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-line" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-mute">{formatBytes(row.size)}</span>
                </div>
                {row.state === 'uploading' && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-3">
                    <div
                      className="h-full rounded-full bg-clay transition-all duration-300"
                      style={{ width: `${Math.round(row.progress * 100)}%` }}
                    />
                  </div>
                )}
                {row.message && <div className="mt-1 text-[11px] text-danger">{row.message}</div>}
              </div>
            ))}
            <div className="text-right text-[11px] text-ink-mute">共 {formatBytes(totalSize)}</div>
          </div>
        )}
      </div>
    </Modal>
  )
}
