import { useRef, useState } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BUCKET = 'workshop-assets'

interface UploadState {
  previewUrl: string | null
  publicUrl: string | null
  uploading: boolean
  error: string | null
}

interface ImageUploadFieldProps {
  label: string
  slot: 'cover' | 'room-map'
  workshopId: string
  initialUrl?: string
  onUploaded: (publicUrl: string) => void
}

function ImageUploadField({ label, slot, workshopId, initialUrl, onUploaded }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({
    previewUrl: initialUrl ?? null,
    publicUrl: initialUrl ?? null,
    uploading: false,
    error: null,
  })

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setState(s => ({ ...s, error: 'Chỉ chấp nhận JPEG, PNG, WebP' }))
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setState(s => ({ ...s, error: 'File tối đa 5 MB' }))
      return
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const storagePath = `${workshopId}/${slot}.${ext}`
    const localPreview = URL.createObjectURL(file)

    setState({ previewUrl: localPreview, publicUrl: null, uploading: true, error: null })

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      setState(s => ({ ...s, uploading: false, error: uploadErr.message }))
      return
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    setState(s => ({ ...s, uploading: false, publicUrl: data.publicUrl }))
    onUploaded(data.publicUrl)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleClear() {
    setState({ previewUrl: null, publicUrl: null, uploading: false, error: null })
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {state.previewUrl ? (
        <div className="relative w-full h-48 rounded-lg overflow-hidden border border-gray-200">
          <img
            src={state.previewUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
          {state.uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!state.uploading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-1 bg-white rounded-full shadow hover:bg-gray-100"
              aria-label="Xóa ảnh"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        >
          <ImageIcon size={32} className="text-gray-400 mb-2" />
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Upload size={14} />
            <span>Kéo thả hoặc bấm để chọn ảnh</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP — tối đa 5 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={handleChange}
      />

      {state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
    </div>
  )
}

interface WorkshopFormProps {
  workshopId: string
  initialCoverUrl?: string
  initialRoomMapUrl?: string
  onSave?: (urls: { cover_image_url?: string; room_map_url?: string }) => Promise<void>
}

export function WorkshopForm({
  workshopId,
  initialCoverUrl,
  initialRoomMapUrl,
  onSave,
}: WorkshopFormProps) {
  const [coverUrl, setCoverUrl] = useState<string | undefined>(initialCoverUrl)
  const [roomMapUrl, setRoomMapUrl] = useState<string | undefined>(initialRoomMapUrl)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!coverUrl && !roomMapUrl) return
    if (!onSave) return

    setSaving(true)
    setSaveError(null)
    setSaved(false)

    try {
      await onSave({ cover_image_url: coverUrl, room_map_url: roomMapUrl })
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ImageUploadField
        label="Ảnh bìa workshop"
        slot="cover"
        workshopId={workshopId}
        initialUrl={initialCoverUrl}
        onUploaded={url => { setCoverUrl(url); setSaved(false) }}
      />

      <ImageUploadField
        label="Sơ đồ phòng học"
        slot="room-map"
        workshopId={workshopId}
        initialUrl={initialRoomMapUrl}
        onUploaded={url => { setRoomMapUrl(url); setSaved(false) }}
      />

      {onSave && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || (!coverUrl && !roomMapUrl)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
          {saved && <span className="text-sm text-green-600">Đã lưu</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      )}
    </form>
  )
}
