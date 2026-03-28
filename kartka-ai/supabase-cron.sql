-- ═══════════════════════════════════════════
-- Щомісячне скидання лімітів карточок
-- Виконай в Supabase → SQL Editor
-- ═══════════════════════════════════════════

-- Функція скидання лімітів
create or replace function public.reset_monthly_cards()
returns void as $$
begin
  -- Free план: скидаємо до 5
  update public.users
  set cards_left = 5
  where plan = 'free';

  -- Pro план: скидаємо до 200
  update public.users
  set cards_left = 200
  where plan = 'pro';

  -- Business план: залишаємо безліміт
  update public.users
  set cards_left = 99999
  where plan = 'business';
end;
$$ language plpgsql security definer;

-- ═══════════════════════════════════════════
-- Автоматичний запуск через pg_cron
-- Запускати 1-го числа кожного місяця о 00:00
-- ═══════════════════════════════════════════

-- Спочатку увімкни pg_cron в Supabase:
-- Database → Extensions → знайди "pg_cron" → Enable

select cron.schedule(
  'reset-monthly-cards',       -- назва задачі
  '0 0 1 * *',                 -- cron: 1-го числа о 00:00
  'select public.reset_monthly_cards()'
);

-- Перевірити заплановані задачі:
-- select * from cron.job;

-- Видалити задачу (якщо треба):
-- select cron.unschedule('reset-monthly-cards');
