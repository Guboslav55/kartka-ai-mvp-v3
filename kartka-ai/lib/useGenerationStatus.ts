'use client'
import { useEffect, useState, useRef, useCallback } from 'react'

type Status = 'idle' | 'pending' | 'processing' | 'done' | 'failed'

interface GenerationStatus {
  status: Status
  progress: number
  resultUrls: string[]
  error: string | null
}

export function useGenerationStatus(jobId: string | null, token: string) {
  const [state, setState] = useState<GenerationStatus>({
    status: 'idle', progress: 0, resultUrls: [], error: null,
  })
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!jobId || !token) return
    eventSourceRef.current?.close()

    const url = `/api/generate-status?jobId=${jobId}&token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setState(prev => ({
          status: data.status || prev.status,
          progress: data.progress ?? prev.progress,
          resultUrls: data.resultUrls || prev.resultUrls,
          error: data.error || null,
        }))
        if (data.status === 'done' || data.status === 'failed') {
          es.close()
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      setState(prev => prev.status === 'done' || prev.status === 'failed' ? prev : { ...prev, status: 'failed', error: 'Connection lost' })
    }

    eventSourceRef.current = es
  }, [jobId, token])

  useEffect(() => {
    connect()
    return () => eventSourceRef.current?.close()
  }, [connect])

  return state
}

// Progress bar component data
export function getProgressLabel(status: Status, progress: number): string {
  if (status === 'pending') return `У черзі...`
  if (status === 'processing') return `Генерую... ${progress}%`
  if (status === 'done') return 'Готово!'
  if (status === 'failed') return 'Помилка'
  return ''
}
