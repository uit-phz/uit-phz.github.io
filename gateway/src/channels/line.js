/**
 * LINE Messaging API Channel Handler
 * 
 * Wired to the Agent Engine — every message gets an AI reply.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { normalizeIncoming } = require('../utils/normalizer');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');
const sender = require('../services/sender');

/**
 * Verify LINE webhook signature
 */
function verifySignature(body, signature) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) return true; // Skip if not configured

  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

/**
 * Handle LINE webhook
 */
async function handleWebhook(req, res) {
  const signature = req.headers['x-line-signature'];
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    logger.warn('Invalid LINE webhook signature');
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('OK');

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const db = req.app.locals.db;
  const redis = req.app.locals.redis;

  try {
    for (const event of body.events || []) {
      switch (event.type) {
        case 'message':
          await processMessage(event, db, redis);
          break;
        case 'follow':
          await handleFollow(event, db, redis);
          break;
        case 'unfollow':
          await handleUnfollow(event, db);
          break;
        case 'postback':
          await processPostback(event, db, redis);
          break;
        default:
          logger.info('LINE event type not handled:', event.type);
      }
    }
  } catch (error) {
    logger.error('Error processing LINE webhook:', error);
  }
}

/**
 * Process a LINE message event
 */
async function processMessage(event, db, redis) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;

  if (!userId) return;

  // Extract text from different message types
  let messageText = '';
  switch (event.message?.type) {
    case 'text':
      messageText = event.message.text;
      break;
    case 'sticker':
      messageText = '[Sticker received]';
      break;
    case 'image':
      messageText = '[Image received]';
      break;
    case 'video':
      messageText = '[Video received]';
      break;
    case 'audio':
      messageText = '[Audio received]';
      break;
    case 'location':
      messageText = `[Location: ${event.message.address || `${event.message.latitude},${event.message.longitude}`}]`;
      break;
    default:
      messageText = `[${event.message?.type || 'unknown'} message received]`;
  }

  logger.info('LINE message received', {
    from: userId,
    type: event.message?.type,
  });

  // Get user profile
  let profile = {};
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (res.ok) profile = await res.json();
  } catch (error) {
    logger.warn('Failed to get LINE profile:', error.message);
  }

  // Upsert contact
  const contact = await contactService.upsertFromPlatform(db, {
    externalId: userId,
    channel: 'line',
    firstName: profile.displayName || '',
    profilePicUrl: profile.pictureUrl || '',
  });

  // Process through agent engine
  const reply = await agent.processMessage({
    channel: 'line',
    senderId: userId,
    messageText,
    senderName: profile.displayName || '',
    db,
    redis,
    contact,
  });

  // Send reply back via LINE
  await sender.sendLine(replyToken, userId, reply);
}

/**
 * Process LINE postback event
 */
async function processPostback(event, db, redis) {
  const userId = event.source?.userId;
  const replyToken = event.replyToken;
  const postbackData = event.postback?.data || '';

  if (!userId || !postbackData) return;

  const contact = await contactService.upsertFromPlatform(db, {
    externalId: userId,
    channel: 'line',
  });

  const reply = await agent.processMessage({
    channel: 'line',
    senderId: userId,
    messageText: postbackData,
    senderName: '',
    db,
    redis,
    contact,
  });

  await sender.sendLine(replyToken, userId, reply);
}

/**
 * Handle user follow (subscribe)
 */
async function handleFollow(event, db, redis) {
  const userId = event.source?.userId;
  if (!userId) return;

  logger.info('LINE user followed', { userId });

  let profile = {};
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (res.ok) profile = await res.json();
  } catch (error) {
    logger.warn('Failed to get LINE profile:', error.message);
  }

  const contact = await contactService.upsertFromPlatform(db, {
    externalId: userId,
    channel: 'line',
    firstName: profile.displayName || '',
    profilePicUrl: profile.pictureUrl || '',
  });

  // Send welcome through agent
  const reply = await agent.processMessage({
    channel: 'line',
    senderId: userId,
    messageText: '/start',
    senderName: profile.displayName || '',
    db,
    redis,
    contact,
  });

  await sender.sendLine(event.replyToken, userId, reply);
}

/**
 * Handle user unfollow
 */
async function handleUnfollow(event, db) {
  const userId = event.source?.userId;
  if (!userId) return;

  logger.info('LINE user unfollowed', { userId });
  await db.query(
    "UPDATE contacts SET is_subscribed = FALSE WHERE external_id = $1 AND channel = 'line'",
    [userId]
  );
}

module.exports = { handleWebhook };
