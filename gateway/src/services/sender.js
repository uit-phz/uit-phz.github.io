/**
 * Unified Message Sender
 * 
 * Sends messages back to users across all supported channels.
 * Each channel has its own API format — this handles the translation.
 */

const logger = require('../utils/logger');

/**
 * Send a text message to a user on any channel
 * 
 * @param {string} channel - Channel name
 * @param {string} recipientId - Platform-specific recipient ID
 * @param {string} text - Message text to send
 * @param {object} options - Channel-specific options (chatId for Telegram, etc.)
 */
async function sendText(channel, recipientId, text, options = {}) {
  try {
    switch (channel) {
      case 'telegram':
        return await sendTelegram(options.chatId || recipientId, text);
      case 'messenger':
      case 'instagram':
        return await sendMessenger(recipientId, text);
      case 'whatsapp':
        return await sendWhatsApp(recipientId, text);
      case 'viber':
        return await sendViber(recipientId, text);
      case 'line':
        return await sendLine(options.replyToken, recipientId, text);
      case 'discord':
        // Discord is handled differently (via discord.js, not HTTP)
        // The discord channel handler sends directly
        return { success: true, note: 'discord_handled_by_client' };
      case 'webchat':
        // Webchat uses WebSocket — response is sent inline
        return { success: true, note: 'webchat_inline_response' };
      default:
        logger.warn(`Unknown channel for sending: ${channel}`);
        return { success: false, error: 'unknown_channel' };
    }
  } catch (error) {
    logger.error(`Failed to send message via ${channel}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Send message via Telegram Bot API
 */
async function sendTelegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    // Retry without Markdown if parsing fails
    if (data.description && data.description.includes("can't parse")) {
      const retryRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      return await retryRes.json();
    }
    throw new Error(`Telegram API error: ${data.description}`);
  }
  return data;
}

/**
 * Send message via Facebook Messenger / Instagram Send API
 */
async function sendMessenger(recipientId, text) {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('META_PAGE_ACCESS_TOKEN not configured');

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Messenger API error: ${data.error.message}`);
  return data;
}

/**
 * Send message via WhatsApp Cloud API
 */
async function sendWhatsApp(recipientId, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error('WhatsApp credentials not configured');

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientId,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`WhatsApp API error: ${data.error.message}`);
  return data;
}

/**
 * Send message via Viber REST API
 */
async function sendViber(recipientId, text) {
  const token = process.env.VIBER_AUTH_TOKEN;
  if (!token) throw new Error('VIBER_AUTH_TOKEN not configured');

  const fetch = (await import('node-fetch')).default;
  const res = await fetch('https://chatapi.viber.com/pa/send_message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': token,
    },
    body: JSON.stringify({
      receiver: recipientId,
      min_api_version: 1,
      sender: { name: process.env.VIBER_BOT_NAME || 'Assistant' },
      type: 'text',
      text,
    }),
  });

  const data = await res.json();
  if (data.status !== 0) throw new Error(`Viber API error: ${data.status_message}`);
  return data;
}

/**
 * Send message via LINE Messaging API
 */
async function sendLine(replyToken, recipientId, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');

  const fetch = (await import('node-fetch')).default;

  // Use reply API if we have a replyToken, otherwise use push
  const endpoint = replyToken
    ? 'https://api.line.me/v2/bot/message/reply'
    : 'https://api.line.me/v2/bot/message/push';

  const body = replyToken
    ? { replyToken, messages: [{ type: 'text', text }] }
    : { to: recipientId, messages: [{ type: 'text', text }] };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LINE API error ${res.status}: ${err}`);
  }

  return { success: true };
}

module.exports = {
  sendText,
  sendTelegram,
  sendMessenger,
  sendWhatsApp,
  sendViber,
  sendLine,
};
