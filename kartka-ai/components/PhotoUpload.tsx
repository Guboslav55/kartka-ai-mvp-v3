'use client'
import { useState, useRef, useCallback } from 'react'

interface PhotoUploadProps {
  onPhotoChange: (base64: string | null) => void
  photo: string | null
  label?: string
  hint?: string
  accept?: string
  maxSizeMb?: number
  showRemoveBg?: boolean
  onRemoveBg?: (base64: string) => Promise<string>
  className?: string
}

export default function PhotoUpload({
  onPhotoChange, photo, label = 'Фото товару', hint = 'PNG, JPG, WEBP до 10 МБ',
  accept = 'image/png,image/jpeg,image/webp', maxSizeMb = 10,
  showRemoveBg = false, onRemoveBg, className = ''
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [removingBg, setRemovingBg] = useState(false)

  const processFile = useCallback(async (file: File) => {
    setError('')
    if (!file.type.startsWith('image/')) { setError('Тільки зображення'); return }
    if (file.size > maxSizeMb * 1024 * 1024) { setError(`Файл більше ${maxSizeMb} МБ`); return }
    setProcessing(true)
    try {
      // Read file
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = rej
        r.readAsDataURL(file)
      })
      // Auto-crop via API
      try {
        const cropRes = await fetch('/api/crop-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: b64 })
        })
        if (cropRes.ok) {
          const { croppedBase64 } = await cropRes.json()
          onPhotoChange(croppedBase64 || b64)
        } else {
          onPhotoChange(b64)
        }
      } catch {
        onPhotoChange(b64)
      }
    } catch (e: any) { setError(e.message) }
    setProcessing(false)
  }, [maxSizeMb, onPhotoChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  async function handleRemoveBg() {
    if (!photo || !onRemoveBg) return
    setRemovingBg(true)
    try {
      const result = await onRemoveBg(photo)
      onPhotoChange(result)
    } catch (e: any) { setError('Помилка видалення фону') }
    setRemovingBg(false)
  }

  if (photo) {
    return (
      <div className={`space-y-3 ${className}`}>
        {label && <label className="text-white/60 text-xs font-bold uppercase tracking-wider block">{label}</label>}
        <div className="relative group rounded-2xl overflow-hidden border border-white/15 bg-white/5">
          <img src={photo} alt="product" className="w-full max-h-64 object-contain p-2"/>
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button onClick={() => inputRef.current?.click()}
              className="bg-white text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-100">
              🔄 Замінити
            </button>
            <button onClick={() => onPhotoChange(null)}
              className="bg-red-500/80 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-500">
              🗑 Видалити
            </button>
          </div>
        </div>
        {showRemoveBg && onRemoveBg && (
          <button onClick={handleRemoveBg} disabled={removingBg}
            className="w-full border border-white/15 text-white/60 py-2 rounded-xl text-xs font-semibold hover:border-indigo-500/50 hover:text-indigo-400 disabled:opacity-50 transition-all">
            {removingBg ? '⏳ Видаляю фон...' : '✂️ Видалити фон (Remove.bg)'}
          </button>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden"
          onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]) }} />
      </div>
    )
  }

  return (
    <div className={className}>
      {label && <label className="text-white/60 text-xs font-bold uppercase tracking-wider block mb-3">{label}</label>}
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]) }} />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          dragging ? 'border-gold bg-gold/10 scale-[1.02]' : 'border-white/20 hover:border-white/40 hover:bg-white/5'
        } ${processing ? 'opacity-70 pointer-events-none' : ''}`}
      >
        {processing ? (
          <div className="space-y-2">
            <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto"/>
            <p className="text-white/50 text-sm">Обробляю фото...</p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">{dragging ? '📂' : '📸'}</div>
            <p className="text-white/70 font-semibold text-sm mb-1">
              {dragging ? 'Відпусти щоб завантажити' : 'Перетягни або клікни'}
            </p>
            <p className="text-white/30 text-xs">{hint}</p>
          </>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-2">⚠️ {error}</p>}
    </div>
  )
}
