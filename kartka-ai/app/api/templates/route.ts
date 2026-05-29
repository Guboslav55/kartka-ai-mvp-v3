import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Built-in templates for infographic/card design
const BUILT_IN_TEMPLATES = [
  {
    id: 'minimal_white',
    name: 'Мінімал',
    category: 'studio',
    description: 'Чисте біле тло, мінімалістичний стиль',
    style: 'catalog',
    lighting: 'soft',
    cardStyle: 'classic',
    accent: '#6366f1',
    preview: null,
    isPro: false,
  },
  {
    id: 'dark_premium',
    name: 'Темний преміум',
    category: 'premium',
    description: 'Темне тло з золотими акцентами',
    style: 'dark',
    lighting: 'dramatic',
    cardStyle: 'premium',
    accent: '#c9a84c',
    preview: null,
    isPro: false,
  },
  {
    id: 'lifestyle_urban',
    name: 'Lifestyle міський',
    category: 'lifestyle',
    description: 'Міська атмосфера, природне освітлення',
    style: 'lifestyle',
    lighting: 'natural',
    cardStyle: 'classic',
    accent: '#10b981',
    preview: null,
    isPro: false,
  },
  {
    id: 'outdoor_nature',
    name: 'Природа',
    category: 'outdoor',
    description: 'Природне середовище, золоте освітлення',
    style: 'outdoor',
    lighting: 'golden',
    cardStyle: 'classic',
    accent: '#f59e0b',
    preview: null,
    isPro: false,
  },
  {
    id: 'studio_gradient',
    name: 'Градієнт',
    category: 'studio',
    description: 'Студійне градієнтне тло',
    style: 'studio',
    lighting: 'studio',
    cardStyle: 'premium',
    accent: '#8b5cf6',
    preview: null,
    isPro: false,
  },
  {
    id: 'flatlay_clean',
    name: 'Плоска раскладка',
    category: 'flatlay',
    description: 'Вид зверху на чистій поверхні',
    style: 'flatlay',
    lighting: 'soft',
    cardStyle: 'classic',
    accent: '#ec4899',
    preview: null,
    isPro: true,
  },
]

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  let templates = BUILT_IN_TEMPLATES
  if (category && category !== 'all') {
    templates = templates.filter(t => t.category === category)
  }

  // If user logged in, also get their custom templates
  if (token) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      )
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        const { data: userTemplates } = await supabase
          .from('templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (userTemplates?.length) {
          return NextResponse.json({ templates, userTemplates })
        }
      }
    } catch {}
  }

  return NextResponse.json({ templates, userTemplates: [] })
}

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

  const { name, settings, previewUrl } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Потрібна назва шаблону' }, { status: 400 })

  const { data: template, error } = await supabase
    .from('templates')
    .insert({ user_id: user.id, name, settings: settings || {}, preview_url: previewUrl || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template })
}
