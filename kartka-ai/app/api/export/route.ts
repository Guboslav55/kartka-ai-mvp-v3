import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function escapeCSV(val: string): string {
  if (!val) return ''
  const s = String(val).replace(/"/g, '""')
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s}"` : s
}

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
  const format = searchParams.get('format') ?? 'prom'
  const cardIds = searchParams.get('ids')?.split(',').filter(Boolean)

  let query = supabase.from('cards').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (cardIds && cardIds.length > 0) query = query.in('id', cardIds)

  const { data: cards, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!cards?.length) return NextResponse.json({ error: 'Карток немає' }, { status: 404 })

  const BOM = '\uFEFF'
  let csv = ''

  if (format === 'rozetka') {
    csv = BOM + 'name,description,price,currency,category,keywords,image,sku\n'
    for (const card of cards) {
      const kw = Array.isArray(card.keywords) ? card.keywords.join(', ') : ''
      csv += [card.title, card.description, '', 'UAH', '', kw, card.image_url || '', card.id?.slice(0,8) || ''].map(escapeCSV).join(',') + '\n'
    }
  } else {
    // Prom.ua format
    csv = BOM + 'Назва,Опис,Ціна,Валюта,Одиниця виміру,Кількість,Стан,Категорія,Ключові слова,URL зображення\n'
    for (const card of cards) {
      const bullets = Array.isArray(card.bullets) ? '\n\nПереваги:\n' + card.bullets.join('\n') : ''
      const desc = (card.description || '') + bullets
      const kw = Array.isArray(card.keywords) ? card.keywords.join(', ') : ''
      csv += [card.title, desc, '', 'UAH', 'шт', '1', 'Новий', '', kw, card.image_url || ''].map(escapeCSV).join(',') + '\n'
    }
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kartka-${format}-${new Date().toISOString().slice(0,10)}.csv"`,
    }
  })
}
