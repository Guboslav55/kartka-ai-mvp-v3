-- KarttaAI: Prom.ua product fields
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
alter table products
  add column if not exists name_ru        text,
  add column if not exists description_ru text,
  add column if not exists keywords_ua    text[],
  add column if not exists keywords_ru    text[],
  add column if not exists unit           text default 'шт.',
  add column if not exists stock          integer,
  add column if not exists width_cm       numeric,
  add column if not exists height_cm      numeric,
  add column if not exists length_cm      numeric,
  add column if not exists weight_kg      numeric,
  add column if not exists visibility     text default 'published';
