/**
 * Action Executor
 * 
 * Parses action markers from LLM responses and executes them.
 * Actions: save collected data, create orders, tag contacts, etc.
 */

const logger = require('../utils/logger');
const memory = require('./memory');

/**
 * Parse action markers from LLM response
 * Returns { cleanText, actions }
 * 
 * Markers:
 * <<COLLECT:field_name=value>>
 * <<ACTION:action_name>>
 * <<TAG:tag_name>>
 */
function parseActions(responseText) {
  const actions = [];
  let cleanText = responseText;

  // Parse COLLECT markers
  const collectPattern = /<<COLLECT:(\w+)=(.+?)>>/g;
  let match;
  while ((match = collectPattern.exec(responseText)) !== null) {
    actions.push({
      type: 'collect',
      field: match[1],
      value: match[2].trim(),
    });
  }

  // Parse ACTION markers
  const actionPattern = /<<ACTION:(\w+)>>/g;
  while ((match = actionPattern.exec(responseText)) !== null) {
    actions.push({
      type: 'action',
      name: match[1],
    });
  }

  // Parse TAG markers
  const tagPattern = /<<TAG:(\w+)>>/g;
  while ((match = tagPattern.exec(responseText)) !== null) {
    actions.push({
      type: 'tag',
      tag: match[1],
    });
  }

  // Remove all markers from the text shown to the user
  cleanText = cleanText
    .replace(/<<COLLECT:\w+=.+?>>/g, '')
    .replace(/<<ACTION:\w+>>/g, '')
    .replace(/<<TAG:\w+>>/g, '')
    .replace(/\n{3,}/g, '\n\n')  // Clean up extra blank lines
    .trim();

  return { cleanText, actions };
}

/**
 * Execute all parsed actions
 */
async function executeActions(actions, context) {
  const { db, redis, channel, senderId, contact } = context;
  const results = [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'collect':
          await handleCollect(action, redis, channel, senderId);
          results.push({ type: 'collect', field: action.field, success: true });
          break;

        case 'action':
          const result = await handleAction(action, context);
          results.push({ type: 'action', name: action.name, success: true, result });
          break;

        case 'tag':
          await handleTag(action, db, contact);
          results.push({ type: 'tag', tag: action.tag, success: true });
          break;

        default:
          logger.warn('Unknown action type:', action.type);
      }
    } catch (error) {
      logger.error(`Action execution failed: ${action.type}`, error);
      results.push({ type: action.type, success: false, error: error.message });
    }
  }

  return results;
}

/**
 * Handle COLLECT action — save a data field to Redis
 */
async function handleCollect(action, redis, channel, senderId) {
  await memory.setCollectedField(redis, channel, senderId, action.field, action.value);
  logger.info(`Collected ${action.field} = ${action.value} for ${channel}:${senderId}`);
}

/**
 * Handle ACTION — execute a named action
 */
async function handleAction(action, context) {
  const { db, redis, channel, senderId, contact } = context;

  switch (action.name) {
    case 'create_order':
      return await createOrder(db, redis, channel, senderId, contact);

    case 'request_human':
      return await requestHuman(db, contact, channel);

    case 'complete_conversation':
      return await completeConversation(db, redis, channel, senderId, contact);

    default:
      logger.warn('Unknown action:', action.name);
      return null;
  }
}

/**
 * Create an order from collected data
 */
async function createOrder(db, redis, channel, senderId, contact) {
  const data = await memory.getCollectedData(redis, channel, senderId);

  if (!data.customer_name || !data.phone || !data.address) {
    logger.warn('Cannot create order — missing required fields:', data);
    return { success: false, reason: 'missing_fields' };
  }

  try {
    const result = await db.query(
      `INSERT INTO orders (contact_id, channel, customer_name, phone, address, payment_method, items, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING id`,
      [
        contact?.id || null,
        channel,
        data.customer_name,
        data.phone,
        data.address,
        data.payment_method || 'pending',
        JSON.stringify(data.items || []),
        data.notes || null,
      ]
    );

    const orderId = result.rows[0].id;
    logger.info(`Order #${orderId} created for ${channel}:${senderId}`);

    // Clear collected data after successful order
    await memory.clearCollectedData(redis, channel, senderId);

    // Tag the contact as 'ordered'
    if (contact?.id) {
      await db.query(
        `UPDATE contacts SET tags = array_append(
          CASE WHEN NOT ('ordered' = ANY(tags)) THEN tags ELSE tags END, 'ordered'
        ), updated_at = NOW() WHERE id = $1 AND NOT ('ordered' = ANY(tags))`,
        [contact.id]
      );
    }

    return { success: true, orderId };

  } catch (error) {
    logger.error('Failed to create order:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Request human handoff
 */
async function requestHuman(db, contact, channel) {
  if (contact?.id) {
    await db.query(
      `UPDATE conversations SET status = 'human', updated_at = NOW()
       WHERE contact_id = $1 AND channel = $2 AND status = 'active'`,
      [contact.id, channel]
    );
  }
  logger.info(`Human handoff requested for ${channel}:${contact?.id}`);
  return { success: true };
}

/**
 * Complete/close a conversation
 */
async function completeConversation(db, redis, channel, senderId, contact) {
  // Clear conversation memory
  await memory.clearHistory(redis, channel, senderId);
  await memory.clearCollectedData(redis, channel, senderId);

  // Update conversation status
  if (contact?.id) {
    await db.query(
      `UPDATE conversations SET status = 'closed', closed_at = NOW()
       WHERE contact_id = $1 AND channel = $2 AND status = 'active'`,
      [contact.id, channel]
    );
  }

  logger.info(`Conversation completed for ${channel}:${senderId}`);
  return { success: true };
}

/**
 * Handle TAG action — tag a contact
 */
async function handleTag(action, db, contact) {
  if (!contact?.id) return;

  await db.query(
    `UPDATE contacts SET tags = array_append(
      CASE WHEN NOT ($1 = ANY(tags)) THEN tags ELSE tags END, $1
    ), updated_at = NOW() WHERE id = $2 AND NOT ($1 = ANY(tags))`,
    [action.tag, contact.id]
  );

  logger.info(`Tagged contact ${contact.id} with: ${action.tag}`);
}

module.exports = {
  parseActions,
  executeActions,
};
