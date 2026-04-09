/**
 * Flow Execution Service
 * 
 * Bridges the channel gateway with n8n workflows.
 * Manages flow state and routes messages to the appropriate handler.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const N8N_BASE = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook';

/**
 * Trigger a flow by name/keyword
 */
async function triggerFlow(db, redis, { flowName, contact, message, channel }) {
  try {
    // Look up flow by trigger
    const flow = await db.query(
      "SELECT * FROM flows WHERE trigger_type = 'keyword' AND trigger_value = $1 AND is_active = TRUE AND $2 = ANY(channels)",
      [flowName, channel]
    );

    if (flow.rows.length === 0) {
      // Try default flow
      const defaultFlow = await db.query(
        "SELECT * FROM flows WHERE trigger_type = 'default' AND is_active = TRUE AND $1 = ANY(channels) LIMIT 1",
        [channel]
      );

      if (defaultFlow.rows.length === 0) {
        logger.info('No flow found for trigger', { flowName, channel });
        return null;
      }

      return await executeFlow(db, redis, defaultFlow.rows[0], contact, message);
    }

    return await executeFlow(db, redis, flow.rows[0], contact, message);
  } catch (error) {
    logger.error('Flow trigger error:', error);
    throw error;
  }
}

/**
 * Execute a flow by forwarding to n8n
 */
async function executeFlow(db, redis, flow, contact, message) {
  const sessionKey = `flow:${contact.id}:${flow.id}`;

  // Get or create flow state
  let state = await redis.get(sessionKey);
  state = state ? JSON.parse(state) : { step: 0, data: {} };

  try {
    // Forward to n8n webhook with flow context
    const { data: response } = await axios.post(`${N8N_BASE}/execute-flow`, {
      flowId: flow.id,
      flowName: flow.name,
      flowData: flow.flow_data,
      contact,
      message,
      state,
      channel: message.channel,
    });

    // Update state
    if (response.nextState) {
      await redis.set(sessionKey, JSON.stringify(response.nextState), 'EX', 3600);
    }

    // If flow is complete, clean up
    if (response.complete) {
      await redis.del(sessionKey);
    }

    return response;
  } catch (error) {
    logger.error('Flow execution error:', error.message);
    return null;
  }
}

/**
 * Check if a contact is currently in a flow
 */
async function getActiveFlow(redis, contactId) {
  const keys = await redis.keys(`flow:${contactId}:*`);
  if (keys.length === 0) return null;

  const state = await redis.get(keys[0]);
  return state ? JSON.parse(state) : null;
}

/**
 * Cancel an active flow for a contact
 */
async function cancelFlow(redis, contactId) {
  const keys = await redis.keys(`flow:${contactId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
    logger.info('Flow cancelled', { contactId });
  }
}

module.exports = {
  triggerFlow,
  executeFlow,
  getActiveFlow,
  cancelFlow,
};
