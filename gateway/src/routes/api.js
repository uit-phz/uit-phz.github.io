/**
 * Admin API Routes
 * 
 * REST API for the dashboard frontend.
 * Provides CRUD for contacts, conversations, broadcasts, and AI agents.
 */

const express = require('express');
const router = express.Router();
const contactService = require('../services/contacts');
const conversationService = require('../services/conversations');
const broadcastService = require('../services/broadcast');
const aiService = require('../services/ai');
const settingsService = require('../services/settings');
const logger = require('../utils/logger');

// Middleware to inject DB pool
router.use((req, res, next) => {
  req.db = req.app.get('db');
  req.redis = req.app.get('redis');
  next();
});

// Simple API key auth (for production, use proper auth)
router.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expected = process.env.ADMIN_API_KEY || 'dev-key-change-me';

  if (apiKey !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Dashboard Stats ──
router.get('/stats', async (req, res) => {
  try {
    const convStats = await conversationService.getStats(req.db);
    const contactCount = await req.db.query('SELECT COUNT(*) FROM contacts');
    const aiStatus = aiService.getProviderStatus();

    const channelStats = await req.db.query(`
      SELECT channel, COUNT(*) as count
      FROM contacts
      GROUP BY channel
      ORDER BY count DESC
    `);

    res.json({
      conversations: convStats,
      contacts: { total: parseInt(contactCount.rows[0].count) },
      channels: channelStats.rows,
      ai: aiStatus,
    });
  } catch (error) {
    logger.error('Stats error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Contacts ──
router.get('/contacts', async (req, res) => {
  try {
    const result = await contactService.list(req.db, req.query);
    res.json(result);
  } catch (error) {
    logger.error('Contacts list error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/contacts/:id', async (req, res) => {
  try {
    const contact = await contactService.getById(req.db, req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const linked = await contactService.findLinkedContacts(req.db, req.params.id);
    res.json({ ...contact, linkedContacts: linked });
  } catch (error) {
    logger.error('Contact get error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/contacts/:id/tags', async (req, res) => {
  try {
    await contactService.addTags(req.db, req.params.id, req.body.tags);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.delete('/contacts/:id/tags/:tag', async (req, res) => {
  try {
    await contactService.removeTag(req.db, req.params.id, req.params.tag);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/contacts/:id/fields', async (req, res) => {
  try {
    const { fieldName, fieldValue } = req.body;
    await contactService.setCustomField(req.db, req.params.id, fieldName, fieldValue);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Conversations ──
router.get('/conversations', async (req, res) => {
  try {
    const result = await conversationService.list(req.db, req.query);
    res.json(result);
  } catch (error) {
    logger.error('Conversations list error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await conversationService.getMessages(req.db, req.params.id, req.query);
    res.json(messages);
  } catch (error) {
    logger.error('Messages list error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/conversations/:id/status', async (req, res) => {
  try {
    await conversationService.updateStatus(req.db, req.params.id, req.body.status);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/conversations/:id/assign', async (req, res) => {
  try {
    await conversationService.assign(req.db, req.params.id, req.body.agentId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/conversations/:id/read', async (req, res) => {
  try {
    await conversationService.markRead(req.db, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Broadcasts ──
router.get('/broadcasts', async (req, res) => {
  try {
    const result = await broadcastService.list(req.db, req.query);
    res.json(result);
  } catch (error) {
    logger.error('Broadcasts list error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/broadcasts', async (req, res) => {
  try {
    const broadcast = await broadcastService.create(req.db, req.body);
    res.status(201).json(broadcast);
  } catch (error) {
    logger.error('Broadcast create error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/broadcasts/:id', async (req, res) => {
  try {
    const broadcast = await broadcastService.getById(req.db, req.params.id);
    if (!broadcast) return res.status(404).json({ error: 'Broadcast not found' });
    res.json(broadcast);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/broadcasts/:id/send', async (req, res) => {
  try {
    // This would integrate with the channel handlers to actually send messages
    res.json({ message: 'Broadcast queued for execution', broadcastId: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── AI Agents ──
router.get('/ai/status', async (req, res) => {
  res.json(aiService.getProviderStatus());
});

router.post('/ai/chat', async (req, res) => {
  try {
    const { message, agentId, conversationHistory } = req.body;
    const reply = await aiService.chat({
      message,
      agentId,
      conversationHistory: conversationHistory || [],
      db: req.db,
    });
    res.json({ reply });
  } catch (error) {
    logger.error('AI chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/agents', async (req, res) => {
  try {
    const result = await req.db.query('SELECT * FROM ai_agents ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/ai/agents', async (req, res) => {
  try {
    const { name, provider, model, systemPrompt, temperature, maxTokens } = req.body;
    const result = await req.db.query(
      `INSERT INTO ai_agents (name, provider, model, system_prompt, temperature, max_tokens)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, provider, model, systemPrompt, temperature || 0.7, maxTokens || 1000]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Analytics ──
router.get('/analytics/messages', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const result = await req.db.query(`
      SELECT 
        DATE(created_at) as date,
        channel,
        direction,
        COUNT(*) as count
      FROM messages
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at), channel, direction
      ORDER BY date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/analytics/contacts/growth', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await req.db.query(`
      SELECT 
        DATE(created_at) as date,
        channel,
        COUNT(*) as new_contacts
      FROM contacts
      WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(created_at), channel
      ORDER BY date ASC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Settings (BYO Credentials) ──
router.get('/settings', async (req, res) => {
  try {
    const all = await settingsService.getAll(req.db);
    res.json(all);
  } catch (error) {
    logger.error('Settings get error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/settings/:category', async (req, res) => {
  try {
    const settings = await settingsService.getByCategory(req.db, req.params.category);
    res.json(settings);
  } catch (error) {
    logger.error('Settings category error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates array is required' });
    }

    // Validate — no empty key names
    for (const u of updates) {
      if (!u.key) return res.status(400).json({ error: 'Each update needs a key' });
    }

    const results = await settingsService.update(req.db, updates);

    // Check if agent engine needs reload (AI key changed)
    const aiKeysChanged = updates.some(u =>
      u.key.includes('API_KEY') || u.key.includes('AI_DEFAULT') || u.key.includes('MODEL')
    );

    let agentReloaded = false;
    if (aiKeysChanged) {
      try {
        const agent = require('../agent/engine');
        agent.init();
        agentReloaded = true;
        logger.info('🔄 Agent engine reloaded after settings change');
      } catch (e) {
        logger.warn('Agent reload skipped:', e.message);
      }
    }

    res.json({
      success: true,
      results,
      agentReloaded,
      message: aiKeysChanged
        ? 'Settings saved & AI engine reloaded'
        : 'Settings saved successfully',
    });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── Channel Connection Status ──
router.get('/channels/status', async (req, res) => {
  try {
    const channels = await settingsService.getChannelStatus(req.db);
    res.json(channels);
  } catch (error) {
    logger.error('Channel status error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ── AI Provider Status ──
router.get('/ai/providers', (req, res) => {
  res.json(settingsService.getAIStatus());
});

// ── Webhook URLs (auto-generated) ──
router.get('/settings/webhooks', (req, res) => {
  const domain = process.env.DOMAIN || req.headers.host || 'your-domain.com';
  const protocol = process.env.PROTOCOL || 'https';
  const base = `${protocol}://${domain}`;

  res.json({
    meta: `${base}/webhook/meta`,
    whatsapp: `${base}/webhook/whatsapp`,
    telegram: `${base}/webhook/telegram`,
    viber: `${base}/webhook/viber`,
    line: `${base}/webhook/line`,
    discord: 'WebSocket — auto-connects with bot token',
    webchat: `${base}/webhook/webchat/*`,
  });
});

module.exports = router;
