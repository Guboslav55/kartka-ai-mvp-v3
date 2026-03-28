# КарткаАІ — Інструкція по запуску

## Що це?
AI-сервіс генерації карток товарів для Prom.ua, Rozetka, OLX.
Next.js + Supabase + Claude API + Wayforpay.

---

## КРОК 1 — Реєстрація на сервісах (20 хв)

### 1.1 GitHub (зберігання коду)
1. Зайди на **github.com** → Sign up
2. Підтверди email
3. Створи новий репозиторій: **New repository** → назва `kartka-ai` → Public → Create

### 1.2 Vercel (хостинг — безкоштовно)
1. Зайди на **vercel.com** → Continue with GitHub
2. Дай дозвіл — він підключиться до GitHub автоматично

### 1.3 Supabase (база даних — безкоштовно)
1. Зайди на **supabase.com** → Start your project → Continue with GitHub
2. New project → вкажи назву `kartka-ai` та пароль (збережи!) → Create new project
3. Дочекайся поки проект створюється (~2 хв)

### 1.4 Anthropic Claude API (AI для текстів)
1. Зайди на **console.anthropic.com** → Sign up
2. Поповни баланс на $5 (мінімум) карткою
3. API Keys → Create Key → скопіюй ключ (починається з `sk-ant-`)

### 1.5 OpenAI (AI для зображень)
1. Зайди на **platform.openai.com** → Sign up
2. Поповни баланс на $5
3. API Keys → Create new secret key → скопіюй (починається з `sk-`)

### 1.6 Wayforpay (приймання оплати)
1. Зайди на **wayforpay.com** → Реєстрація
2. Заповни дані ФОП або ТОВ
3. Після верифікації: Налаштування → Ключі → скопіюй Merchant Account та Secret Key

---

## КРОК 2 — Налаштування Supabase (10 хв)

1. Відкрий твій проект на supabase.com
2. Зліва: **SQL Editor** → New query
3. Відкрий файл `supabase-schema.sql` з цієї папки
4. Скопіюй весь вміст → встав у редактор → натисни **Run**
5. Має з'явитись "Success. No rows returned"

### Отримати ключі Supabase:
- Зліва: **Settings** → **API**
- Скопіюй **Project URL** та **anon public** key

---

## КРОК 3 — Завантаження коду на GitHub (5 хв)

### Якщо є Git на комп'ютері:
```bash
cd картка-ai  # перейди в папку проекту
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВІЙ_ЮЗЕРНЕЙМ/kartka-ai.git
git push -u origin main
```

### Якщо немає Git — завантаж GitHub Desktop:
1. **desktop.github.com** → завантаж та встанови
2. File → Add local repository → вибери папку проекту
3. Commit to main → Push origin

---

## КРОК 4 — Деплой на Vercel (5 хв)

1. Зайди на **vercel.com/dashboard**
2. **Add New Project** → вибери репозиторій `kartka-ai` → Import
3. Перед тим як натиснути Deploy — розгорни **Environment Variables**
4. Додай ці змінні (по одній):

```
NEXT_PUBLIC_SUPABASE_URL          = https://xxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJxxx...
SUPABASE_SERVICE_ROLE_KEY         = eyJxxx...  (Settings → API → service_role)
ANTHROPIC_API_KEY                 = sk-ant-xxx...
OPENAI_API_KEY                    = sk-xxx...
WAYFORPAY_MERCHANT_ACCOUNT        = твій_merchant_account
WAYFORPAY_MERCHANT_KEY            = твій_secret_key
NEXT_PUBLIC_WAYFORPAY_MERCHANT    = твій_merchant_account
NEXT_PUBLIC_SITE_URL              = https://kartka-ai.vercel.app
```

5. Натисни **Deploy** → чекай 2-3 хвилини
6. Vercel дасть тобі посилання типу `kartka-ai.vercel.app` — це твій сайт!

---

## КРОК 5 — Налаштування Wayforpay (5 хв)

1. У кабінеті Wayforpay: **Налаштування** → **URL повідомлень**
2. Встанови Service URL: `https://kartka-ai.vercel.app/api/payment`
3. Збережи

---

## КРОК 6 — Тест (5 хв)

1. Відкрий твій сайт
2. Зареєструйся як новий користувач
3. Спробуй згенерувати картку — має спрацювати!
4. Перевір в Supabase → Table Editor → cards — картка має з'явитись там

---

## Після запуску — перші клієнти

1. **Facebook групи**: шукай "Продавці Prom.ua", "Rozetka продавці", "OLX бізнес" — публікуй пост
2. **Telegram**: канали про e-commerce в Україні
3. **Персонально**: знайди 10 продавців на Prom.ua → напиши кожному особисто

---

## Часті проблеми

**Сайт не відкривається після деплою:**
→ Перевір Vercel → Deployments → подивись на помилки в логах

**Генерація не працює:**
→ Перевір що ANTHROPIC_API_KEY правильно вставлений у Vercel (без пробілів)

**Авторизація не працює:**
→ В Supabase: Authentication → URL Configuration → додай `https://картка-ai.vercel.app` в Redirect URLs

**Оплата не приходить:**
→ Переконайся що Service URL у Wayforpay вказаний правильно

---

## Структура проекту

```
kartka-ai/
├── app/
│   ├── page.tsx              ← Лендинг (головна)
│   ├── auth/page.tsx         ← Вхід / Реєстрація
│   ├── dashboard/page.tsx    ← Кабінет користувача
│   ├── generate/page.tsx     ← Генератор карточок
│   ├── pricing/page.tsx      ← Сторінка тарифів
│   └── api/
│       ├── generate/         ← Claude API + DALL-E
│       └── payment/          ← Wayforpay webhook
├── lib/
│   ├── supabase.ts           ← Клієнт Supabase (браузер)
│   ├── supabase-server.ts    ← Клієнт Supabase (сервер)
│   └── wayforpay.ts          ← Генерація платіжних форм
├── types/index.ts            ← TypeScript типи
├── supabase-schema.sql       ← SQL для бази даних
└── .env.example              ← Шаблон змінних середовища
```
