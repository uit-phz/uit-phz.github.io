-- ============================================
-- Settings Table Migration
-- Stores channel tokens, LLM keys, and system config
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(128) PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  category    VARCHAR(32) NOT NULL DEFAULT 'general',
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Seed default categories with empty values
-- AI / LLM
INSERT INTO settings (key, value, category, is_secret) VALUES
  ('AI_DEFAULT_PROVIDER', 'gemini', 'ai', false),
  ('AI_TEMPERATURE', '0.7', 'ai', false),
  ('AI_MAX_TOKENS', '1000', 'ai', false),
  ('OPENAI_API_KEY', '', 'ai', true),
  ('OPENAI_MODEL', 'gpt-4o-mini', 'ai', false),
  ('GEMINI_API_KEY', '', 'ai', true),
  ('GEMINI_MODEL', 'gemini-2.0-flash', 'ai', false),
  ('CLAUDE_API_KEY', '', 'ai', true),
  ('CLAUDE_MODEL', 'claude-3-5-haiku-latest', 'ai', false),
  ('DEEPSEEK_API_KEY', '', 'ai', true),
  ('DEEPSEEK_MODEL', 'deepseek-chat', 'ai', false),
  -- Meta (Messenger + Instagram)
  ('META_APP_ID', '', 'meta', false),
  ('META_APP_SECRET', '', 'meta', true),
  ('META_PAGE_ACCESS_TOKEN', '', 'meta', true),
  ('META_VERIFY_TOKEN', '', 'meta', false),
  ('META_WEBHOOK_SECRET', '', 'meta', true),
  -- WhatsApp
  ('WHATSAPP_PHONE_ID', '', 'whatsapp', false),
  ('WHATSAPP_TOKEN', '', 'whatsapp', true),
  ('WHATSAPP_VERIFY_TOKEN', '', 'whatsapp', false),
  -- Telegram
  ('TELEGRAM_BOT_TOKEN', '', 'telegram', true),
  ('TELEGRAM_WEBHOOK_SECRET', '', 'telegram', true),
  -- Viber
  ('VIBER_AUTH_TOKEN', '', 'viber', true),
  ('VIBER_BOT_NAME', 'MyBot', 'viber', false),
  -- LINE
  ('LINE_CHANNEL_ACCESS_TOKEN', '', 'line', true),
  ('LINE_CHANNEL_SECRET', '', 'line', true),
  -- Discord
  ('DISCORD_BOT_TOKEN', '', 'discord', true),
  ('DISCORD_PREFIX', '!bot', 'discord', false)
ON CONFLICT (key) DO NOTHING;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated ON settings;
CREATE TRIGGER trg_settings_updated
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_timestamp();
