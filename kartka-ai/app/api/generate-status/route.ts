import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
    || new URL(req.url).searchParams.get('token')

  if (!token) {
    return new Response('Unauthorized', { status: 401 })
  }

  const jobId = new URL(req.url).searchParams.get('jobId')
  if (!jobId) return new Response('jobId required', { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return new Response('Unauthorized', { status: 401 })

  // SSE stream
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // Send initial status
      const { data: job } = await supabase.from('generation_jobs').select('*').eq('id', jobId).eq('user_id', user.id).single()
      if (!job) { send({ error: 'not_found' }); controller.close(); return }

      send({ status: job.status, progress: job.status === 'processing' ? 50 : job.status === 'done' ? 100 : 0 })
      if (job.status === 'done' || job.status === 'failed') { controller.close(); return }

      // Poll for updates
      let polls = 0
      const interval = setInterval(async () => {
        polls++
        if (polls > 60 || closed) { clearInterval(interval); controller.close(); return }

        try {
          const { data: updated } = await supabase.from('generation_jobs').select('status, result_urls, error_message').eq('id', jobId).single()
          if (!updated) return

          const progress = updated.status === 'processing' ? Math.min(30 + polls * 2, 90) : updated.status === 'done' ? 100 : 0

          send({ status: updated.status, progress, resultUrls: updated.result_urls, error: updated.error_message })

          if (updated.status === 'done' || updated.status === 'failed') {
            clearInterval(interval)
            setTimeout(() => { try { controller.close() } catch {} }, 500)
          }
        } catch { clearInterval(interval) }
      }, 2000)

      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        try { controller.close() } catch {}
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }
  })
}
