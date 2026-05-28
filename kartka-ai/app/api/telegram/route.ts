/**
 * Telegram Bot Support Handler
 * Set webhook: https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://kartka-ai-mvp-v3.vercel.app/api/telegram
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''

async function sendMessage(chatId: string | number, text: string, parseMode = 'HTML') {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  }).catch(() => {})
}

async function sendToAdmin(text: string) {
  if (ADMIN_CHAT_ID) await sendMessage(ADMIN_CHAT_ID, text)
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true })

  const update = await req.json()
  const msg = update.message || update.edited_message
  if (!msg) return NextResponse.json({ ok: true })

  const chatId = msg.chat.id
  const text = msg.text || ''
  const from = msg.from
  const userName = from?.username ? `@${from.username}` : from?.first_name || 'User'

  // Commands
  if (text === '/start') {
    await sendMessage(chatId, `👋 Вітаємо в КарткаАІ!

🤖 Це бот підтримки. Напишіть своє запитання і ми відповімо.

📌 Корисні посилання:
• <a href="https://kartka-ai-mvp-v3.vercel.app">Сайт</a>
• <a href="https://kartka-ai-mvp-v3.vercel.app/pricing">Тарифи</a>
• <a href="https://kartka-ai-mvp-v3.vercel.app/dashboard">Кабінет</a>

💬 Команди:
/balance — перевірити баланс
/help — допомога
/start — головне меню`)
    return NextResponse.json({ ok: true })
  }

  if (text === '/help') {
    await sendMessage(chatId, `🆘 <b>Допомога КарткаАІ</b>

❓ <b>Часті питання:</b>

<b>Як генерувати картку?</b>
Відкрий /generate, введи назву товару і натисни "Згенерувати"

<b>Що таке Зорі ⭐?</b>
Внутрішня валюта. Текст = 2⭐, Фото = 4⭐, Відео = 16⭐

<b>Зорі не нараховані після оплати?</b>
Зачекай 1-2 хв і перевір /balance

<b>Потрібна допомога?</b>
Напиши питання тут — відповімо протягом дня`)
    return NextResponse.json({ ok: true })
  }

  if (text === '/balance') {
    // Check if user linked their account
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: user } = await supabase
      .from('users')
      .select('stars_balance, cards_total, email')
      .eq('telegram_chat_id', String(chatId))
      .single()

    if (user) {
      await sendMessage(chatId, `⭐ <b>Ваш баланс: ${user.stars_balance} зорь</b>

📦 Карток створено: ${user.cards_total}
📧 Акаунт: ${user.email}

<a href="https://kartka-ai-mvp-v3.vercel.app/pricing">Поповнити баланс →</a>`)
    } else {
      await sendMessage(chatId, `🔗 Для перевірки балансу прив'яжіть Telegram до акаунту.

Відкрийте <a href="https://kartka-ai-mvp-v3.vercel.app/profile">Профіль</a> і натисніть "Підключити Telegram"`)
    }
    return NextResponse.json({ ok: true })
  }

  // Forward user message to admin
  await sendToAdmin(`💬 <b>Повідомлення від користувача</b>
👤 ${userName} (chat: ${chatId})
📝 ${text}

<i>Відповісти: /reply_${chatId} текст</i>`)

  // Auto-reply to user
  await sendMessage(chatId, `✅ Ваше повідомлення отримано!

Ми відповімо найближчим часом (зазвичай протягом кількох годин).

Поки що можете переглянути:
• /help — відповіді на часті питання`)

  return NextResponse.json({ ok: true })
}

// GET: webhook info
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const setup = searchParams.get('setup')
  
  if (setup === '1' && BOT_TOKEN) {
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/telegram`
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}`)
    const data = await res.json()
    return NextResponse.json({ webhook: data, url: webhookUrl })
  }
  
  return NextResponse.json({
    status: 'Telegram Bot active',
    setup: 'GET /api/telegram?setup=1 to configure webhook',
    commands: ['/start', '/help', '/balance']
  })
}
