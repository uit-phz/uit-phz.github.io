/**
 * Message Normalizer
 * 
 * Converts platform-specific message formats into a unified
 * internal format that the flow engine can process.
 */

/**
 * Normalize an incoming message from any channel to a standard format
 * @param {string} channel - Source channel (messenger, whatsapp, telegram, viber, webchat)
 * @param {object} rawMessage - Raw platform-specific message data
 * @returns {object} Normalized message
 */
function normalizeIncoming(channel, rawMessage) {
  const base = {
    channel,
    direction: 'inbound',
    timestamp: new Date().toISOString(),
    raw: rawMessage,
  };

  switch (channel) {
    case 'messenger':
      return normalizeMessenger(base, rawMessage);
    case 'instagram':
      return normalizeInstagram(base, rawMessage);
    case 'whatsapp':
      return normalizeWhatsApp(base, rawMessage);
    case 'telegram':
      return normalizeTelegram(base, rawMessage);
    case 'viber':
      return normalizeViber(base, rawMessage);
    case 'line':
      return normalizeLine(base, rawMessage);
    case 'discord':
      return normalizeDiscord(base, rawMessage);
    case 'webchat':
      return normalizeWebchat(base, rawMessage);
    default:
      return { ...base, senderId: 'unknown', messageType: 'text', content: { text: '' } };
  }
}

function normalizeMessenger(base, msg) {
  const senderId = msg.sender?.id;
  let messageType = 'text';
  const content = {};

  if (msg.message?.text) {
    messageType = 'text';
    content.text = msg.message.text;
  } else if (msg.message?.attachments) {
    const att = msg.message.attachments[0];
    messageType = att.type; // image, video, audio, file
    content.mediaUrl = att.payload?.url;
    if (att.type === 'location') {
      messageType = 'location';
      content.latitude = att.payload?.coordinates?.lat;
      content.longitude = att.payload?.coordinates?.long;
    }
  } else if (msg.postback) {
    messageType = 'postback';
    content.payload = msg.postback.payload;
    content.title = msg.postback.title;
  } else if (msg.referral) {
    messageType = 'referral';
    content.ref = msg.referral.ref;
    content.source = msg.referral.source;
  }

  return {
    ...base,
    senderId,
    externalMessageId: msg.message?.mid,
    messageType,
    content,
    quickReply: msg.message?.quick_reply?.payload,
  };
}

function normalizeInstagram(base, msg) {
  // Instagram uses same format as Messenger with minor differences
  return normalizeMessenger({ ...base, channel: 'instagram' }, msg);
}

function normalizeWhatsApp(base, msg) {
  const senderId = msg.from;
  let messageType = 'text';
  const content = {};

  switch (msg.type) {
    case 'text':
      content.text = msg.text?.body;
      break;
    case 'image':
      messageType = 'image';
      content.mediaId = msg.image?.id;
      content.caption = msg.image?.caption;
      content.mimeType = msg.image?.mime_type;
      break;
    case 'video':
      messageType = 'video';
      content.mediaId = msg.video?.id;
      content.caption = msg.video?.caption;
      break;
    case 'audio':
      messageType = 'audio';
      content.mediaId = msg.audio?.id;
      break;
    case 'document':
      messageType = 'file';
      content.mediaId = msg.document?.id;
      content.filename = msg.document?.filename;
      break;
    case 'location':
      messageType = 'location';
      content.latitude = msg.location?.latitude;
      content.longitude = msg.location?.longitude;
      content.name = msg.location?.name;
      break;
    case 'interactive':
      messageType = 'interactive';
      content.type = msg.interactive?.type;
      content.payload = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
      content.title = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title;
      break;
    case 'button':
      messageType = 'postback';
      content.payload = msg.button?.payload;
      content.text = msg.button?.text;
      break;
    default:
      content.text = `[Unsupported message type: ${msg.type}]`;
  }

  return {
    ...base,
    senderId,
    externalMessageId: msg.id,
    messageType,
    content,
    contactName: msg.profile?.name,
  };
}

function normalizeTelegram(base, msg) {
  const senderId = String(msg.from?.id);
  let messageType = 'text';
  const content = {};

  if (msg.text) {
    content.text = msg.text;
    // Check for commands
    if (msg.text.startsWith('/')) {
      messageType = 'command';
      content.command = msg.text.split(' ')[0];
      content.args = msg.text.split(' ').slice(1).join(' ');
    }
  } else if (msg.photo) {
    messageType = 'image';
    content.fileId = msg.photo[msg.photo.length - 1].file_id; // Largest photo
    content.caption = msg.caption;
  } else if (msg.video) {
    messageType = 'video';
    content.fileId = msg.video.file_id;
    content.caption = msg.caption;
  } else if (msg.voice || msg.audio) {
    messageType = 'audio';
    content.fileId = (msg.voice || msg.audio).file_id;
  } else if (msg.document) {
    messageType = 'file';
    content.fileId = msg.document.file_id;
    content.filename = msg.document.file_name;
  } else if (msg.location) {
    messageType = 'location';
    content.latitude = msg.location.latitude;
    content.longitude = msg.location.longitude;
  } else if (msg.contact) {
    messageType = 'contact';
    content.phone = msg.contact.phone_number;
    content.firstName = msg.contact.first_name;
    content.lastName = msg.contact.last_name;
  }

  // Handle callback queries (button presses)
  if (msg.data) {
    messageType = 'postback';
    content.payload = msg.data;
  }

  return {
    ...base,
    senderId,
    externalMessageId: String(msg.message_id || msg.id),
    messageType,
    content,
    senderFirstName: msg.from?.first_name,
    senderLastName: msg.from?.last_name,
    senderUsername: msg.from?.username,
    chatId: String(msg.chat?.id || msg.message?.chat?.id),
  };
}

function normalizeViber(base, msg) {
  const senderId = msg.sender?.id;
  let messageType = 'text';
  const content = {};

  switch (msg.message?.type) {
    case 'text':
      content.text = msg.message.text;
      break;
    case 'picture':
      messageType = 'image';
      content.mediaUrl = msg.message.media;
      content.caption = msg.message.text;
      break;
    case 'video':
      messageType = 'video';
      content.mediaUrl = msg.message.media;
      content.size = msg.message.size;
      break;
    case 'file':
      messageType = 'file';
      content.mediaUrl = msg.message.media;
      content.filename = msg.message.file_name;
      break;
    case 'location':
      messageType = 'location';
      content.latitude = msg.message.location?.lat;
      content.longitude = msg.message.location?.lon;
      break;
    case 'contact':
      messageType = 'contact';
      content.phone = msg.message.contact?.phone_number;
      content.name = msg.message.contact?.name;
      break;
    default:
      content.text = msg.message?.text || '';
  }

  return {
    ...base,
    senderId,
    externalMessageId: msg.message_token?.toString(),
    messageType,
    content,
    senderName: msg.sender?.name,
    senderAvatar: msg.sender?.avatar,
  };
}

function normalizeWebchat(base, msg) {
  return {
    ...base,
    senderId: msg.sessionId,
    externalMessageId: msg.messageId,
    messageType: msg.type || 'text',
    content: {
      text: msg.text,
      mediaUrl: msg.mediaUrl,
    },
    senderName: msg.name || 'Visitor',
  };
}

function normalizeLine(base, event) {
  const senderId = event.source?.userId || '';
  let messageType = 'text';
  const content = {};

  switch (event.message?.type) {
    case 'text':
      content.text = event.message.text;
      break;
    case 'image':
      messageType = 'image';
      content.messageId = event.message.id;
      break;
    case 'video':
      messageType = 'video';
      content.messageId = event.message.id;
      break;
    case 'audio':
      messageType = 'audio';
      content.messageId = event.message.id;
      break;
    case 'location':
      messageType = 'location';
      content.latitude = event.message.latitude;
      content.longitude = event.message.longitude;
      content.address = event.message.address;
      break;
    case 'sticker':
      messageType = 'sticker';
      content.stickerId = event.message.stickerId;
      content.packageId = event.message.packageId;
      break;
    default:
      content.text = `[${event.message?.type || 'unknown'}]`;
  }

  return {
    ...base,
    senderId,
    externalMessageId: event.message?.id,
    messageType,
    content,
    replyToken: event.replyToken,
  };
}

function normalizeDiscord(base, msg) {
  return {
    ...base,
    senderId: msg.authorId || msg.author?.id || '',
    externalMessageId: msg.id,
    messageType: 'text',
    content: { text: msg.content || msg.text || '' },
    senderName: msg.authorName || msg.author?.username || '',
  };
}

/**
 * Build platform-specific outgoing message from normalized format
 */
function buildOutgoing(channel, normalizedMsg) {
  switch (channel) {
    case 'messenger':
    case 'instagram':
      return buildMessengerMessage(normalizedMsg);
    case 'whatsapp':
      return buildWhatsAppMessage(normalizedMsg);
    case 'telegram':
      return buildTelegramMessage(normalizedMsg);
    case 'viber':
      return buildViberMessage(normalizedMsg);
    case 'line':
      return buildLineMessage(normalizedMsg);
    case 'discord':
      return normalizedMsg; // Discord uses discord.js client directly
    default:
      return normalizedMsg;
  }
}

function buildMessengerMessage(msg) {
  const payload = {
    recipient: { id: msg.recipientId },
    message: {},
  };

  if (msg.messageType === 'text') {
    payload.message.text = msg.content.text;
    if (msg.quickReplies) {
      payload.message.quick_replies = msg.quickReplies.map((qr) => ({
        content_type: 'text',
        title: qr.title,
        payload: qr.payload,
      }));
    }
  } else if (msg.messageType === 'image' || msg.messageType === 'video') {
    payload.message.attachment = {
      type: msg.messageType,
      payload: { url: msg.content.mediaUrl, is_reusable: true },
    };
  } else if (msg.buttons) {
    payload.message.attachment = {
      type: 'template',
      payload: {
        template_type: 'button',
        text: msg.content.text,
        buttons: msg.buttons.map((b) => ({
          type: b.url ? 'web_url' : 'postback',
          title: b.title,
          ...(b.url ? { url: b.url } : { payload: b.payload }),
        })),
      },
    };
  }

  return payload;
}

function buildWhatsAppMessage(msg) {
  const payload = {
    messaging_product: 'whatsapp',
    to: msg.recipientId,
  };

  if (msg.messageType === 'text') {
    payload.type = 'text';
    payload.text = { body: msg.content.text };
  } else if (msg.messageType === 'image') {
    payload.type = 'image';
    payload.image = { link: msg.content.mediaUrl, caption: msg.content.caption };
  } else if (msg.buttons) {
    payload.type = 'interactive';
    payload.interactive = {
      type: 'button',
      body: { text: msg.content.text },
      action: {
        buttons: msg.buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: b.payload || `btn_${i}`, title: b.title },
        })),
      },
    };
  }

  return payload;
}

function buildTelegramMessage(msg) {
  const payload = {
    chat_id: msg.recipientId,
  };

  if (msg.messageType === 'text') {
    payload.text = msg.content.text;
    payload.parse_mode = 'HTML';

    if (msg.buttons) {
      payload.reply_markup = {
        inline_keyboard: [
          msg.buttons.map((b) => ({
            text: b.title,
            ...(b.url ? { url: b.url } : { callback_data: b.payload }),
          })),
        ],
      };
    }
  } else if (msg.messageType === 'image') {
    payload.photo = msg.content.mediaUrl;
    payload.caption = msg.content.caption;
  }

  return payload;
}

function buildViberMessage(msg) {
  const payload = {
    receiver: msg.recipientId,
    min_api_version: 1,
    sender: { name: process.env.VIBER_BOT_NAME || 'ChatBot' },
  };

  if (msg.messageType === 'text') {
    payload.type = 'text';
    payload.text = msg.content.text;
  } else if (msg.messageType === 'image') {
    payload.type = 'picture';
    payload.media = msg.content.mediaUrl;
    payload.text = msg.content.caption || '';
  }

  if (msg.buttons) {
    payload.keyboard = {
      Type: 'keyboard',
      Buttons: msg.buttons.map((b) => ({
        ActionType: 'reply',
        ActionBody: b.payload,
        Text: b.title,
        TextSize: 'regular',
      })),
    };
  }

  return payload;
}

function buildLineMessage(msg) {
  const messages = [];

  if (msg.messageType === 'text') {
    messages.push({ type: 'text', text: msg.content.text });
  } else if (msg.messageType === 'image') {
    messages.push({
      type: 'image',
      originalContentUrl: msg.content.mediaUrl,
      previewImageUrl: msg.content.mediaUrl,
    });
  }

  return {
    replyToken: msg.replyToken,
    messages,
  };
}

module.exports = {
  normalizeIncoming,
  buildOutgoing,
};
