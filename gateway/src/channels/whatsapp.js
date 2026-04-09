/**
 * WhatsApp Business Cloud API Channel Handler
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

function verify(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('WhatsApp webhook verification failed');
  return res.status(403).send('Verification failed');
}

async function handleWebhook(req, res) {
  const signature = req.headers['x-hub-signature-256'];
  if (signature && process.env.META_APP_SECRET) {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected = 'sha256=' +
      crypto.createHmac('sha256', process.env.META_APP_SECRET)
        .update(rawBody)
        .digest('hex');

    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        logger.warn('Invalid WhatsApp webhook signature');
        return res.status(401).send('Invalid signature');
      }
    } catch (e) {
      return res.status(401).send('Invalid signature');
    }
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  res.status(200).send('OK');

  try {
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status, req.app.locals.db);
          }
        }

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            const contactProfile = value.contacts?.find(c => c.wa_id === message.from);
            message.profile = contactProfile?.profile;
            await processMessage(message, req.app.locals.db, req.app.locals.redis);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error processing WhatsApp webhook:', error);
  }
}

async function processMessage(message, db, redis) {
  const normalized = normalizeIncoming('whatsapp', message);
  const messageText = normalized.content?.text || normalized.content?.caption || '';

  if (!messageText) return;

  logger.info('WhatsApp message received', {
    from: normalized.senderId,
    type: normalized.messageType,
  });

  // Upsert contact
  const contact = await contactService.upsertFromPlatform(db, {
    externalId: normalized.senderId,
    channel: 'whatsapp',
    phone: normalized.senderId,
    firstName: normalized.contactName,
  });

  // Mark as read
  await markAsRead(normalized.externalMessageId);

  // Process through agent engine
  const reply = await agent.processMessage({
    channel: 'whatsapp',
    senderId: normalized.senderId,
    messageText,
    senderName: normalized.contactName || '',
    db,
    redis,
    contact,
  });

  // Send reply back
  await sender.sendWhatsApp(normalized.senderId, reply);
}

async function handleStatusUpdate(status, db) {
  const statusMap = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
  if (statusMap[status.status]) {
    await db.query('UPDATE messages SET status = $1 WHERE external_id = $2', [statusMap[status.status], status.id]);
  }
}

async function markAsRead(messageId) {
  try {
    await axios.post(
      `${GRAPH_API_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
    );
  } catch (error) {
    logger.warn('Failed to mark message as read:', error.message);
  }
}

module.exports = { verify, handleWebhook };
