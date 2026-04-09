/**
 * Broadcast Service
 * 
 * Send messages to segments of contacts (like Chatrace's "Growth Tools" / broadcasts).
 * Supports scheduling, audience segmentation, and delivery tracking.
 */

const logger = require('../utils/logger');

/**
 * Create a broadcast
 */
async function create(db, { name, channel, audienceFilter, messageTemplate, scheduledAt }) {
  try {
    const result = await db.query(
      `INSERT INTO broadcasts (name, channel, audience_filter, message_template, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name,
        channel,
        JSON.stringify(audienceFilter || {}),
        JSON.stringify(messageTemplate),
        scheduledAt || null,
        scheduledAt ? 'scheduled' : 'draft',
      ]
    );

    logger.info('Broadcast created', { id: result.rows[0].id, name, channel });
    return result.rows[0];
  } catch (error) {
    logger.error('Broadcast create error:', error);
    throw error;
  }
}

/**
 * Get contacts matching audience filter
 */
async function getAudience(db, { channel, filter }) {
  let query = 'SELECT * FROM contacts WHERE channel = $1 AND is_subscribed = TRUE';
  const params = [channel];
  let paramIndex = 2;

  if (filter?.tags?.length > 0) {
    query += ` AND tags && $${paramIndex++}`;
    params.push(filter.tags);
  }

  if (filter?.customFieldName && filter?.customFieldValue) {
    query += ` AND custom_fields->>$${paramIndex++} = $${paramIndex++}`;
    params.push(filter.customFieldName, filter.customFieldValue);
  }

  if (filter?.lastInteractionAfter) {
    query += ` AND last_interaction >= $${paramIndex++}`;
    params.push(filter.lastInteractionAfter);
  }

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Execute a broadcast (send to all matching contacts)
 */
async function execute(db, broadcastId, sendFn) {
  const broadcastResult = await db.query('SELECT * FROM broadcasts WHERE id = $1', [broadcastId]);

  if (broadcastResult.rows.length === 0) {
    throw new Error('Broadcast not found');
  }

  const broadcast = broadcastResult.rows[0];

  // Update status to sending
  await db.query("UPDATE broadcasts SET status = 'sending', started_at = NOW() WHERE id = $1", [broadcastId]);

  // Get audience
  const audienceFilter = typeof broadcast.audience_filter === 'string'
    ? JSON.parse(broadcast.audience_filter)
    : broadcast.audience_filter;

  const audience = await getAudience(db, {
    channel: broadcast.channel,
    filter: audienceFilter,
  });

  const messageTemplate = typeof broadcast.message_template === 'string'
    ? JSON.parse(broadcast.message_template)
    : broadcast.message_template;

  let sentCount = 0;
  let failedCount = 0;

  // Send to each contact with rate limiting
  for (const contact of audience) {
    try {
      // Personalize message
      const personalizedContent = personalizeMessage(messageTemplate, contact);

      await sendFn(contact, personalizedContent);
      sentCount++;

      // Rate limiting: 30 messages/second
      if (sentCount % 30 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      failedCount++;
      logger.warn('Broadcast send failed for contact', { contactId: contact.id, error: error.message });
    }
  }

  // Update broadcast stats
  await db.query(
    "UPDATE broadcasts SET status = 'completed', completed_at = NOW(), sent_count = $1, failed_count = $2, total_recipients = $3 WHERE id = $4",
    [sentCount, failedCount, audience.length, broadcastId]
  );

  logger.info('Broadcast completed', { broadcastId, sent: sentCount, failed: failedCount, total: audience.length });

  return { sent: sentCount, failed: failedCount, total: audience.length };
}

/**
 * Replace template variables with contact data
 */
function personalizeMessage(template, contact) {
  let text = template.text || '';

  text = text.replace(/\{\{first_name\}\}/g, contact.first_name || 'there');
  text = text.replace(/\{\{last_name\}\}/g, contact.last_name || '');
  text = text.replace(/\{\{full_name\}\}/g, `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'there');
  text = text.replace(/\{\{email\}\}/g, contact.email || '');
  text = text.replace(/\{\{phone\}\}/g, contact.phone || '');

  // Custom fields
  if (contact.custom_fields) {
    const fields = typeof contact.custom_fields === 'string'
      ? JSON.parse(contact.custom_fields)
      : contact.custom_fields;

    Object.entries(fields).forEach(([key, value]) => {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
  }

  return { ...template, text };
}

/**
 * List broadcasts
 */
async function list(db, { status, limit = 20, offset = 0 }) {
  let query = 'SELECT * FROM broadcasts WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Get broadcast by ID
 */
async function getById(db, id) {
  const result = await db.query('SELECT * FROM broadcasts WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = {
  create,
  execute,
  getAudience,
  personalizeMessage,
  list,
  getById,
};
