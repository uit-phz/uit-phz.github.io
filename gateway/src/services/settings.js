/**
 * Settings Service
 * 
 * Manages channel tokens, LLM API keys, and system config.
 * Stores in PostgreSQL, syncs to process.env for live use.
 * Secrets are masked when read via API (only last 4 chars shown).
 */

const logger = require('../utils/logger');

/**
 * Mask a secret value for display — show only last 4 chars
 */
function maskSecret(value) {
  if (!value || value.length < 8) return value ? '••••••••' : '';
  return '••••••••' + value.slice(-4);
}

/**
 * Load all settings from DB into process.env (called at startup)
 */
async function loadToEnv(db) {
  try {
    const result = await db.query(
      `SELECT key, value FROM settings WHERE value != '' AND value IS NOT NULL`
    );
    let loaded = 0;
    for (const row of result.rows) {
      // Only set env var if not already set (env takes priority)
      if (!process.env[row.key] || process.env[row.key] === '') {
        process.env[row.key] = row.value;
        loaded++;
      }
    }
    logger.info(`⚙️  Settings: loaded ${loaded} values from database (${result.rows.length} total in DB)`);
    return loaded;
  } catch (error) {
    logger.warn('Settings table not found — run migrate-settings.sql first');
    return 0;
  }
}

/**
 * Get all settings by category, masking secrets
 */
async function getByCategory(db, category) {
  try {
    const result = await db.query(
      `SELECT key, value, category, is_secret, updated_at 
       FROM settings 
       WHERE category = $1 
       ORDER BY key`,
      [category]
    );

    return result.rows.map(row => ({
      key: row.key,
      value: row.is_secret ? maskSecret(row.value) : row.value,
      category: row.category,
      isSecret: row.is_secret,
      configured: !!row.value && row.value.length > 0,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Settings getByCategory error:', error);
    return [];
  }
}

/**
 * Get all settings grouped by category
 */
async function getAll(db) {
  try {
    const result = await db.query(
      `SELECT key, value, category, is_secret, updated_at 
       FROM settings 
       ORDER BY category, key`
    );

    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push({
        key: row.key,
        value: row.is_secret ? maskSecret(row.value) : row.value,
        category: row.category,
        isSecret: row.is_secret,
        configured: !!row.value && row.value.length > 0,
        updatedAt: row.updated_at,
      });
    }

    return grouped;
  } catch (error) {
    logger.error('Settings getAll error:', error);
    return {};
  }
}

/**
 * Update one or more settings. Also sets process.env in-memory for live reload.
 */
async function update(db, updates) {
  const results = [];

  for (const { key, value } of updates) {
    try {
      // Upsert into DB
      await db.query(
        `INSERT INTO settings (key, value, category, is_secret)
         VALUES ($1, $2,
           COALESCE((SELECT category FROM settings WHERE key = $1), 'general'),
           COALESCE((SELECT is_secret FROM settings WHERE key = $1), false)
         )
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, value]
      );

      // Sync to process.env for live reload
      process.env[key] = value;
      results.push({ key, success: true });

      logger.info(`⚙️  Setting updated: ${key} → ${value ? '[set]' : '[cleared]'}`);
    } catch (error) {
      logger.error(`Settings update error for ${key}:`, error);
      results.push({ key, success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Get channel connection status summary
 */
async function getChannelStatus(db) {
  const channels = {
    messenger: {
      name: 'Facebook Messenger',
      icon: '💬',
      requiredKeys: ['META_PAGE_ACCESS_TOKEN'],
      optionalKeys: ['META_APP_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN'],
      webhookPath: '/webhook/meta',
    },
    instagram: {
      name: 'Instagram DM',
      icon: '📸',
      requiredKeys: ['META_PAGE_ACCESS_TOKEN'],
      optionalKeys: ['META_APP_ID', 'META_APP_SECRET'],
      webhookPath: '/webhook/meta',
    },
    whatsapp: {
      name: 'WhatsApp Business',
      icon: '📱',
      requiredKeys: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
      optionalKeys: ['WHATSAPP_VERIFY_TOKEN'],
      webhookPath: '/webhook/whatsapp',
    },
    telegram: {
      name: 'Telegram Bot',
      icon: '✈️',
      requiredKeys: ['TELEGRAM_BOT_TOKEN'],
      optionalKeys: ['TELEGRAM_WEBHOOK_SECRET'],
      webhookPath: '/webhook/telegram',
    },
    viber: {
      name: 'Viber Bot',
      icon: '💜',
      requiredKeys: ['VIBER_AUTH_TOKEN'],
      optionalKeys: ['VIBER_BOT_NAME'],
      webhookPath: '/webhook/viber',
    },
    line: {
      name: 'LINE Messaging',
      icon: '🟢',
      requiredKeys: ['LINE_CHANNEL_ACCESS_TOKEN'],
      optionalKeys: ['LINE_CHANNEL_SECRET'],
      webhookPath: '/webhook/line',
    },
    discord: {
      name: 'Discord Bot',
      icon: '🎮',
      requiredKeys: ['DISCORD_BOT_TOKEN'],
      optionalKeys: ['DISCORD_PREFIX'],
      webhookPath: 'WebSocket (auto)',
    },
    webchat: {
      name: 'Web Chat Widget',
      icon: '🌐',
      requiredKeys: [],
      optionalKeys: [],
      webhookPath: '/webhook/webchat/*',
      alwaysActive: true,
    },
  };

  // Check which keys are actually set
  for (const [channelId, channel] of Object.entries(channels)) {
    const allRequired = channel.requiredKeys.every(k => !!process.env[k]);
    channel.connected = channel.alwaysActive || allRequired;
    channel.requiredStatus = {};
    for (const k of channel.requiredKeys) {
      channel.requiredStatus[k] = !!process.env[k];
    }
  }

  return channels;
}

/**
 * Get AI provider status
 */
function getAIStatus() {
  return {
    default: process.env.AI_DEFAULT_PROVIDER || 'none',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
    providers: {
      openai: {
        configured: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
      gemini: {
        configured: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      },
      claude: {
        configured: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY),
        model: process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest',
      },
      deepseek: {
        configured: !!process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      },
    },
  };
}

module.exports = {
  loadToEnv,
  getByCategory,
  getAll,
  update,
  getChannelStatus,
  getAIStatus,
  maskSecret,
};
