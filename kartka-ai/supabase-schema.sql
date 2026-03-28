-- ═══════════════════════════════════════════
-- КарткаАІ — SQL схема для Supabase
-- Виконай це в Supabase → SQL Editor → New query
-- ═══════════════════════════════════════════

-- 1. Таблиця профілів користувачів
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'business')),
  cards_left  integer not null default 5,
  cards_total integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2. Таблиця збережених карточок
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  product_name text not null,
  platform     text not null default 'general',
  title        text not null,
  description  text not null,
  bullets      jsonb not null default '[]',
  keywords     jsonb not null default '[]',
  image_url    text,
  created_at   timestamptz not null default now()
);

-- 3. Індекси для швидкого пошуку
create index if not exists cards_user_id_idx on public.cards(user_id);
create index if not exists cards_created_at_idx on public.cards(created_at desc);

-- 4. Row Level Security (RLS) — кожен бачить тільки своє
alter table public.users enable row level security;
alter table public.cards enable row level security;

-- Policies для users
create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- Policies для cards
create policy "Users can read own cards"
  on public.cards for select
  using (auth.uid() = user_id);

create policy "Users can insert own cards"
  on public.cards for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own cards"
  on public.cards for delete
  using (auth.uid() = user_id);

-- 5. Автоматично створювати профіль при реєстрації
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, plan, cards_left, cards_total)
  values (new.id, new.email, 'free', 5, 0)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Готово! Таблиці та правила безпеки створено.
