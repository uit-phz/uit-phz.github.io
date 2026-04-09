/**
 * Conversation Memory Manager
 * 
 * Stores conversation history per user in Redis for fast access.
 * Also handles collected data (order fields etc.) per conversation.
 */

const logger = require('../utils/logger');

const HISTORY_PREFIX = 'conv:history:';
const DATA_PREFIX = 'conv:data:';
const MAX_HISTORY = 40;       // Keep last 40 messages (20 exchanges)
const HISTORY_TTL = 86400;    // 24 hours TTL

/**
 * Build a unique key for a user across channels
 */
function userKey(channel, senderId) {
  return `${channel}:${senderId}`;
}

/**
 * Get conversation history for a user
 * Returns array of { role: 'user'|'assistant', content: string }
 */
async function getHistory(redis, channel, senderId) {
  try {
    const key = `${HISTORY_PREFIX}${userKey(channel, senderId)}`;
    const data = await redis.get(key);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to get conversation history:', error);
    return [];
  }
}

/**
 * Add a message exchange to history
 */
async function addToHistory(redis, channel, senderId, userMessage, assistantReply) {
  try {
    const key = `${HISTORY_PREFIX}${userKey(channel, senderId)}`;
    let history = await getHistory(redis, channel, senderId);

    // Add new exchange
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantReply });

    // Trim to max history
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    await redis.set(key, JSON.stringify(history), 'EX', HISTORY_TTL);
  } catch (error) {
    logger.error('Failed to save conversation history:', error);
  }
}

/**
 * Clear conversation history for a user
 */
async function clearHistory(redis, channel, senderId) {
  try {
    const key = `${HISTORY_PREFIX}${userKey(channel, senderId)}`;
    await redis.del(key);
  } catch (error) {
    logger.error('Failed to clear history:', error);
  }
}

/**
 * Get collected data for a user (order fields, etc.)
 */
async function getCollectedData(redis, channel, senderId) {
  try {
    const key = `${DATA_PREFIX}${userKey(channel, senderId)}`;
    const data = await redis.get(key);
    if (!data) return {};
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to get collected data:', error);
    return {};
  }
}

/**
 * Set a collected data field
 */
async function setCollectedField(redis, channel, senderId, fieldName, fieldValue) {
  try {
    const key = `${DATA_PREFIX}${userKey(channel, senderId)}`;
    const data = await getCollectedData(redis, channel, senderId);
    data[fieldName] = fieldValue;
    await redis.set(key, JSON.stringify(data), 'EX', HISTORY_TTL);
    return data;
  } catch (error) {
    logger.error('Failed to set collected field:', error);
    return {};
  }
}

/**
 * Clear collected data (after order is completed, etc.)
 */
async function clearCollectedData(redis, channel, senderId) {
  try {
    const key = `${DATA_PREFIX}${userKey(channel, senderId)}`;
    await redis.del(key);
  } catch (error) {
    logger.error('Failed to clear collected data:', error);
  }
}

/**
 * Get full conversation state (history + collected data)
 */
async function getConversationState(redis, channel, senderId) {
  const [history, collectedData] = await Promise.all([
    getHistory(redis, channel, senderId),
    getCollectedData(redis, channel, senderId),
  ]);
  return { history, collectedData };
}

module.exports = {
  getHistory,
  addToHistory,
  clearHistory,
  getCollectedData,
  setCollectedField,
  clearCollectedData,
  getConversationState,
};
