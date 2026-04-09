/**
 * Telegram Bot API Channel Handler
 * 
 * Wired to the Agent Engine — every message gets an AI reply.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { normalizeIncoming } = require('../utils/normalizer');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');
const sender = require('../services/sender');

const getTelegramUrl = (method) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function handleWebhook(req, res) {
  res.status(200).send('OK');

  try {
    const update = req.body;
    const db = req.app.locals.db;
    const redis = req.app.locals.redis;

    if (update.message) {
      await processMessage(update.message, db, redis);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query, db, redis);
    }
  } catch (error) {
    logger.error('Error processing Telegram webhook:', error);
  }
}

async function processMessage(message, db, redis) {
  const normalized = normalizeIncoming('telegram', message);
  const chatId = normalized.chatId;
  const messageText = normalized.content?.text || normalized.content?.caption || '';

  if (!messageText) {
    await sender.sendTelegram(chatId, "I can read text messages. Could you type your question? 😊");
    return;
  }

  logger.info('Telegram message received', {
    from: normalized.senderId,
    type: normalized.messageType,
    chatId,
  });

  // Upsert contact
  const contact = await contactService.upsertFromPlatform(db, {
    externalId: normalized.senderId,
    channel: 'telegram',
    firstName: normalized.senderFirstName,
    lastName: normalized.senderLastName,
  });

  // Process through agent engine
  const reply = await agent.processMessage({
    channel: 'telegram',
    senderId: normalized.senderId,
    messageText,
    senderName: normalized.senderFirstName || '',
    db,
    redis,
    contact,
  });

  // Send reply back to Telegram
  await sender.sendTelegram(chatId, reply);
}

async function processCallbackQuery(callbackQuery, db, redis) {
  const normalized = normalizeIncoming('telegram', callbackQuery);
  const chatId = String(callbackQuery.message?.chat?.id);
  const messageText = normalized.content?.payload || '';

  // Acknowledge the callback
  await answerCallbackQuery(callbackQuery.id);

  if (!messageText) return;

  const contact = await contactService.upsertFromPlatform(db, {
    externalId: normalized.senderId,
    channel: 'telegram',
    firstName: callbackQuery.from?.first_name,
    lastName: callbackQuery.from?.last_name,
  });

  const reply = await agent.processMessage({
    channel: 'telegram',
    senderId: normalized.senderId,
    messageText,
    senderName: callbackQuery.from?.first_name || '',
    db,
    redis,
    contact,
  });

  await sender.sendTelegram(chatId, reply);
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    await axios.post(getTelegramUrl('answerCallbackQuery'), {
      callback_query_id: callbackQueryId,
      text,
    });
  } catch (error) {
    logger.warn('Failed to answer callback query:', error.message);
  }
}

async function setWebhook(webhookUrl) {
  try {
    const { data } = await axios.post(getTelegramUrl('setWebhook'), {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
    });
    logger.info('Telegram webhook set:', data);
    return data;
  } catch (error) {
    logger.error('Failed to set Telegram webhook:', error.message);
    throw error;
  }
}

module.exports = { handleWebhook, setWebhook };
