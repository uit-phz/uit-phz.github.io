/**
 * Viber Bot API Channel Handler
 * 
 * Wired to the Agent Engine — every message gets an AI reply.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { normalizeIncoming } = require('../utils/normalizer');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');
const sender = require('../services/sender');

const VIBER_API_URL = 'https://chatapi.viber.com/pa';

async function handleWebhook(req, res) {
  res.status(200).send('OK');

  try {
    const event = req.body;
    const db = req.app.locals.db;
    const redis = req.app.locals.redis;

    switch (event.event) {
      case 'message':
        await processMessage(event, db, redis);
        break;
      case 'subscribed':
        await handleSubscribed(event, db);
        break;
      case 'unsubscribed':
        await handleUnsubscribed(event, db);
        break;
      case 'conversation_started':
        await handleConversationStarted(event, db, redis);
        break;
      case 'delivered':
      case 'seen':
        break;
      case 'failed':
        logger.error('Viber message failed', { desc: event.desc });
        break;
    }
  } catch (error) {
    logger.error('Error processing Viber webhook:', error);
  }
}

async function processMessage(event, db, redis) {
  const normalized = normalizeIncoming('viber', event);
  const messageText = normalized.content?.text || '';

  if (!messageText) return;

  logger.info('Viber message received', {
    from: normalized.senderId,
    type: normalized.messageType,
  });

  const contact = await contactService.upsertFromPlatform(db, {
    externalId: normalized.senderId,
    channel: 'viber',
    firstName: normalized.senderName,
    profilePicUrl: normalized.senderAvatar,
  });

  // Process through agent engine
  const reply = await agent.processMessage({
    channel: 'viber',
    senderId: normalized.senderId,
    messageText,
    senderName: normalized.senderName || '',
    db,
    redis,
    contact,
  });

  // Send reply back
  await sender.sendViber(normalized.senderId, reply);
}

async function handleSubscribed(event, db) {
  logger.info('Viber user subscribed', { userId: event.user?.id });
  await contactService.upsertFromPlatform(db, {
    externalId: event.user?.id,
    channel: 'viber',
    firstName: event.user?.name,
    profilePicUrl: event.user?.avatar,
  });
}

async function handleUnsubscribed(event, db) {
  logger.info('Viber user unsubscribed', { userId: event.user_id });
  await db.query(
    "UPDATE contacts SET is_subscribed = FALSE WHERE external_id = $1 AND channel = 'viber'",
    [event.user_id]
  );
}

async function handleConversationStarted(event, db, redis) {
  logger.info('Viber conversation started', { userId: event.user?.id });

  const contact = await contactService.upsertFromPlatform(db, {
    externalId: event.user?.id,
    channel: 'viber',
    firstName: event.user?.name,
    profilePicUrl: event.user?.avatar,
  });

  // Send personalized welcome through the agent
  const reply = await agent.processMessage({
    channel: 'viber',
    senderId: event.user?.id,
    messageText: '/start',
    senderName: event.user?.name || '',
    db,
    redis,
    contact,
  });

  await sender.sendViber(event.user?.id, reply);
}

async function setWebhook(webhookUrl) {
  try {
    const { data } = await axios.post(`${VIBER_API_URL}/set_webhook`, {
      url: webhookUrl,
      event_types: ['delivered', 'seen', 'failed', 'subscribed', 'unsubscribed', 'conversation_started'],
      send_name: true,
      send_photo: true,
    }, {
      headers: { 'X-Viber-Auth-Token': process.env.VIBER_AUTH_TOKEN },
    });
    logger.info('Viber webhook set:', data);
    return data;
  } catch (error) {
    logger.error('Failed to set Viber webhook:', error.message);
    throw error;
  }
}

module.exports = { handleWebhook, setWebhook };
