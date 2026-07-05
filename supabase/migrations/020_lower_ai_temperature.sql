-- ============================================
-- 020_lower_ai_temperature.sql
-- Lower the default chat temperature to a low-but-not-deterministic value.
-- ============================================

-- New default for schools created from here on.
ALTER TABLE public.settings
  ALTER COLUMN ai_temperature SET DEFAULT 0.2;

-- Migrate existing schools that are still on the old default (0.7) so they
-- pick up the new low temperature. Schools that deliberately chose a different
-- value are left untouched.
UPDATE public.settings
  SET ai_temperature = 0.2, updated_at = now()
  WHERE ai_temperature = 0.7;
