-- Migration: add onboarding_done to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done boolean DEFAULT false;
