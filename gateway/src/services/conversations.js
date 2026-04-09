/**
 * Conversation Management Service
 * 
 * Manages conversations across all channels. 
 * Handles assignment, status tracking, and message persistence.
 */

const logger = require('../utils/logger');

/**
 * Get or create a conversation for a contact
 */
async function getOrCreate(db, { contactId, channel, subject }) {
  try {
    // Find open conversation
    const existing = await db.query(
      "SELECT * FROM conversations WHERE contact_id = $1 AND channel = $2 AND status != 'closed' ORDER BY updated_at DESC LIMIT 1",
      [contactId, channel]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Create new conversation
    const result = await db.query(
      `INSERT INTO conversations (contact_id, channel, subject, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING *`,
      [contactId, channel, subject || `${channel} conversation`]
    );

    logger.info('New conversation created', { id: result.rows[0].id, channel, contactId });
    return result.rows[0];
  } catch (error) {
    logger.error('Conversation getOrCreate error:', error);
    throw error;
  }
}

/**
 * Save a message to a conversation
 */
async function saveMessage(db, { conversationId, contactId, channel, direction, messageType, content, externalMessageId, metadata }) {
  try {
    const result = await db.query(
      `INSERT INTO messages (conversation_id, contact_id, channel, direction, message_type, content, external_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        conversationId,
        contactId,
        channel,
        direction,
        messageType || 'text',
        JSON.stringify(content),
        externalMessageId || null,
        JSON.stringify(metadata || {}),
      ]
    );

    // Update conversation timestamp
    await db.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    // Update unread count if inbound
    if (direction === 'inbound') {
      await db.query('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = $1', [conversationId]);
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Save message error:', error);
    throw error;
  }
}

/**
 * List conversations with optional filters
 */
async function list(db, { status, channel, assignedTo, limit = 30, offset = 0 }) {
  let query = `
    SELECT c.*, 
           ct.first_name, ct.last_name, ct.external_id as contact_external_id, ct.profile_pic_url,
           (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (status) {
    query += ` AND c.status = $${paramIndex++}`;
    params.push(status);
  }
  if (channel) {
    query += ` AND c.channel = $${paramIndex++}`;
    params.push(channel);
  }
  if (assignedTo) {
    query += ` AND c.assigned_to = $${paramIndex++}`;
    params.push(assignedTo);
  }

  query += ` ORDER BY c.updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await db.query(query, params);

  return result.rows.map(row => ({
    ...row,
    last_message: typeof row.last_message === 'string' ? JSON.parse(row.last_message) : row.last_message,
  }));
}

/**
 * Get messages for a conversation
 */
async function getMessages(db, conversationId, { limit = 50, before }) {
  let query = 'SELECT * FROM messages WHERE conversation_id = $1';
  const params = [conversationId];
  let paramIndex = 2;

  if (before) {
    query += ` AND created_at < $${paramIndex++}`;
    params.push(before);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
  params.push(parseInt(limit));

  const result = await db.query(query, params);

  return result.rows.reverse().map(row => ({
    ...row,
    content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
  }));
}

/**
 * Update conversation status
 */
async function updateStatus(db, conversationId, status) {
  const validStatuses = ['open', 'pending', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
  }

  await db.query('UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2', [status, conversationId]);
  logger.info('Conversation status updated', { conversationId, status });
}

/**
 * Assign conversation to an agent
 */
async function assign(db, conversationId, agentId) {
  await db.query(
    'UPDATE conversations SET assigned_to = $1, status = $2, updated_at = NOW() WHERE id = $3',
    [agentId, 'pending', conversationId]
  );
  logger.info('Conversation assigned', { conversationId, agentId });
}

/**
 * Mark all messages in a conversation as read
 */
async function markRead(db, conversationId) {
  await db.query('UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND is_read = FALSE', [conversationId]);
  await db.query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [conversationId]);
}

/**
 * Get conversation statistics
 */
async function getStats(db) {
  const result = await db.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'open') as open_count,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
      COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
      COUNT(*) as total
    FROM conversations
  `);

  return result.rows[0];
}

module.exports = {
  getOrCreate,
  saveMessage,
  list,
  getMessages,
  updateStatus,
  assign,
  markRead,
  getStats,
};
