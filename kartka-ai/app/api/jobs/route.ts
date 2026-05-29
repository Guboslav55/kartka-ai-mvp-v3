import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const COSTS: Record<string, number> = {
  scene: 4, infographic: 4, tryon: 6, model: 8,
  upscale: 2, video: 16, text: 2,
}

// Get user priority based on plan/balance
function getPriority(plan: string, balance: number): number {
  if (plan === 'business' || balance >= 500) return 3
  if (plan === 'pro' || balance >= 100) return 2
  return 1
}

// POST: Submit a new job
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, inputData } = body

  if (!type || !COSTS[type]) {
    return NextResponse.json({ error: 'Невідомий тип задачі' }, { status: 400 })
  }

  const cost = COSTS[type]
  const { data: profile } = await supabase.from('users').select('stars_balance, plan').eq('id', user.id).single()
  const balance = profile?.stars_balance ?? 0
  const plan = profile?.plan || 'free'

  if (balance < cost) {
    return NextResponse.json({ error: `Недостатньо зорь (${cost} ⭐)`, needStars: true, balance }, { status: 402 })
  }

  const priority = getPriority(plan, balance)

  // Check cache for same job
  if (inputData?.cacheKey) {
    const { data: cached } = await supabase
      .from('generation_cache')
      .select('result_urls')
      .eq('cache_key', inputData.cacheKey)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cached?.result_urls?.length) {
      // Increment hit count
      await supabase.from('generation_cache').update({ hit_count: supabase.rpc('', {}) }).eq('cache_key', inputData.cacheKey)
      return NextResponse.json({ cached: true, resultUrls: cached.result_urls, starsSpent: 0 })
    }
  }

  // Create job
  const { data: job, error } = await supabase.from('generation_jobs').insert({
    user_id: user.id,
    type,
    status: 'pending',
    priority,
    input_data: inputData || {},
    stars_cost: cost,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Process immediately if simple job (text/upscale)
  // For GPU-heavy tasks, they go to queue and get processed by worker
  if (type === 'text') {
    // Trigger immediate processing
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/jobs/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal': process.env.WEBHOOK_SECRET || 'internal' },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(() => {})
  }

  return NextResponse.json({
    jobId: job.id,
    status: 'pending',
    priority,
    estimatedWait: priority === 1 ? '30-60 сек' : priority === 2 ? '15-30 сек' : '5-15 сек',
    message: `Задача додана до черги (пріоритет ${priority})`,
  })
}

// GET: Check job status
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('id')

  if (jobId) {
    const { data: job } = await supabase.from('generation_jobs').select('*').eq('id', jobId).eq('user_id', user.id).single()
    if (!job) return NextResponse.json({ error: 'Задача не знайдена' }, { status: 404 })
    return NextResponse.json(job)
  }

  // List recent jobs
  const { data: jobs } = await supabase.from('generation_jobs').select('id, type, status, priority, created_at, result_urls, error_message, stars_cost').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
  return NextResponse.json({ jobs: jobs || [] })
}
