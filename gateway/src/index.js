/**
 * ChatraceClone — Agentic Omnichannel Chatbot Gateway
 * 
 * Central hub for 8 messaging channels powered by LLM + Knowledge Base.
 * Channels: Telegram, WhatsApp, Messenger, Instagram, LINE, Viber, Discord, Webchat
 * 
 * Every incoming message → Agent Engine → LLM → Reply
 * No contact limits. Self-hosted. Unlimited conversations.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');
const Redis = require('ioredis');
const logger = require('./utils/logger');

// Agent Engine (the brain)
const agent = require('./agent/engine');
const settingsService = require('./services/settings');

// Channel handlers
const messengerHandler = require('./channels/messenger');
const whatsappHandler = require('./channels/whatsapp');
const telegramHandler = require('./channels/telegram');
const viberHandler = require('./channels/viber');
const webchatHandler = require('./channels/webchat');
const lineHandler = require('./channels/line');
const discordHandler = require('./channels/discord');

// API Routes
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Database Connections ────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Make connections available to routes (both methods needed)
app.set('db', db);
app.set('redis', redis);
app.locals.db = db;
app.locals.redis = redis;

// ─── Middleware ───────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('short', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Raw body for webhook signature verification (must be before json parser)
app.use('/webhook/meta', express.raw({ type: 'application/json' }));
app.use('/webhook/whatsapp', express.raw({ type: 'application/json' }));
app.use('/webhook/line', express.raw({ type: 'application/json' }));

// JSON parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    const agentStatus = agent.getStatus();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0-agent',
      services: {
        database: 'connected',
        redis: 'connected',
      },
      agent: {
        providers: agentStatus.providers,
        defaultProvider: agentStatus.defaultProvider,
        knowledgeFiles: agentStatus.knowledgeFiles,
        knowledgeSize: `${agentStatus.knowledgeSize} chars`,
      },
      channels: {
        messenger: !!process.env.META_PAGE_ACCESS_TOKEN,
        instagram: !!process.env.META_PAGE_ACCESS_TOKEN,
        whatsapp: !!process.env.WHATSAPP_TOKEN,
        telegram: !!process.env.TELEGRAM_BOT_TOKEN,
        viber: !!process.env.VIBER_AUTH_TOKEN,
        line: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        discord: !!process.env.DISCORD_BOT_TOKEN,
        webchat: true,
      },
      limits: 'UNLIMITED — self-hosted, no contact limits',
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// ─── Admin API Routes ────────────────────────
app.use('/api', apiRoutes);

// ─── Agent API (test & manage) ───────────────
app.post('/api/agent/chat', async (req, res) => {
  try {
    const { message, provider } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const reply = await agent.testChat(message, provider);
    res.json({ reply, provider: agent.getStatus().defaultProvider });
  } catch (error) {
    logger.error('Agent test chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent/status', (req, res) => {
  res.json(agent.getStatus());
});

app.post('/api/agent/reload-knowledge', (req, res) => {
  const result = agent.reloadKnowledge();
  res.json({ success: true, files: result.fileCount, size: result.combined.length });
});

// ─── Channel Webhook Routes ──────────────────

// Facebook Messenger & Instagram
app.get('/webhook/meta', messengerHandler.verify);
app.post('/webhook/meta', messengerHandler.handleWebhook);

// WhatsApp (Cloud API)
app.get('/webhook/whatsapp', whatsappHandler.verify);
app.post('/webhook/whatsapp', whatsappHandler.handleWebhook);

// Telegram
app.post('/webhook/telegram', telegramHandler.handleWebhook);

// Viber
app.post('/webhook/viber', viberHandler.handleWebhook);

// LINE
app.post('/webhook/line', lineHandler.handleWebhook);

// Web Chat
app.post('/webhook/webchat/session', webchatHandler.createSession);
app.post('/webhook/webchat/send', webchatHandler.receiveMessage);
app.get('/webhook/webchat/messages/:sessionId', webchatHandler.getMessages);

// ─── 404 Handler ─────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    docs: '/health for status',
  });
});

// ─── Global Error Handler ────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// ─── Start Server ────────────────────────────
async function start() {
  try {
    // Test database connection
    await db.query('SELECT 1');
    logger.info('✅ PostgreSQL connected');

    await redis.ping();
    logger.info('✅ Redis connected');

    // Load settings from database → process.env (before agent init)
    await settingsService.loadToEnv(db);

    // Initialize the Agent Engine
    agent.init();

    // Initialize Discord bot (WebSocket-based, runs in background)
    await discordHandler.init(db, redis);

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info('');
      logger.info('╔══════════════════════════════════════════════════╗');
      logger.info('║   🤖 Agentic Omnichannel Chatbot Gateway v2.0   ║');
      logger.info('║   Self-Hosted · Unlimited Contacts · AI-Powered  ║');
      logger.info('╚══════════════════════════════════════════════════╝');
      logger.info('');
      logger.info(`🌐 Server running on port ${PORT}`);
      logger.info('');
      logger.info('📡 Webhook endpoints:');
      logger.info(`   Messenger/IG : /webhook/meta`);
      logger.info(`   WhatsApp     : /webhook/whatsapp`);
      logger.info(`   Telegram     : /webhook/telegram`);
      logger.info(`   Viber        : /webhook/viber`);
      logger.info(`   LINE         : /webhook/line`);
      logger.info(`   Discord      : WebSocket (auto-connected)`);
      logger.info(`   Web Chat     : /webhook/webchat/*`);
      logger.info('');
      logger.info('🏥 Health: /health');
      logger.info('⚙️  Agent: /api/agent/status');
      logger.info('');
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────
async function shutdown() {
  logger.info('Shutting down gracefully...');
  await discordHandler.shutdown();
  await db.end();
  redis.disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
start();

module.exports = app;
