/**
 * Facebook Messenger & Instagram Channel Handler
 * 
 * Wired to the Agent Engine — every message gets an AI reply.
 */

const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');
const { normalizeIncoming } = require('../utils/normalizer');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');
const sender = require('../services/sender');

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0';

/**
 * Webhook verification (GET request from Meta)
 */
function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    logger.info('Meta webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Meta webhook verification failed', { mode, token });
  return res.status(403).send('Verification failed');
}

/**
 * Handle incoming webhook events
 */
async function handleWebhook(req, res) {
  // Verify signature
  const signature = req.headers['x-hub-signature-256'];
  if (signature && process.env.META_APP_SECRET) {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected = 'sha256=' +
      crypto.createHmac('sha256', process.env.META_APP_SECRET)
        .update(rawBody)
        .digest('hex');

    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        logger.warn('Invalid webhook signature from Meta');
        return res.status(401).send('Invalid signature');
      }
    } catch (e) {
      // Length mismatch — invalid
      return res.status(401).send('Invalid signature');
    }
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  res.status(200).send('EVENT_RECEIVED');

  try {
    if (body.object === 'page' || body.object === 'instagram') {
      const channel = body.object === 'page' ? 'messenger' : 'instagram';

      for (const entry of body.entry) {
        if (entry.messaging) {
          for (const event of entry.messaging) {
            await processMessagingEvent(channel, event, req.app.locals.db, req.app.locals.redis);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error processing Meta webhook:', error);
  }
}

/**
 * Process a single messaging event
 */
async function processMessagingEvent(channel, event, db, redis) {
  // Skip echo messages
  if (event.message?.is_echo) return;

  const normalized = normalizeIncoming(channel, event);
  const messageText = normalized.content?.text || normalized.content?.payload || '';

  if (!messageText) return;

  logger.info(`${channel} message received`, {
    senderId: normalized.senderId,
    type: normalized.messageType,
  });

  // Get profile info
  let profile = {};
  try {
    const { data } = await axios.get(`${GRAPH_API_URL}/${normalized.senderId}`, {
      params: {
        fields: 'first_name,last_name,profile_pic',
        access_token: process.env.META_PAGE_ACCESS_TOKEN,
      },
    });
    profile = data;
  } catch (error) {
    logger.warn(`Failed to get profile for ${normalized.senderId}:`, error.message);
  }

  // Upsert contact
  const contact = await contactService.upsertFromPlatform(db, {
    externalId: normalized.senderId,
    channel,
    firstName: profile.first_name,
    lastName: profile.last_name,
    profilePicUrl: profile.profile_pic,
  });

  // Process through agent engine
  const reply = await agent.processMessage({
    channel,
    senderId: normalized.senderId,
    messageText,
    senderName: profile.first_name || '',
    db,
    redis,
    contact,
  });

  // Send reply back
  await sender.sendMessenger(normalized.senderId, reply);
}

module.exports = { verify, handleWebhook };
