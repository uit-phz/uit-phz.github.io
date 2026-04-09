/**
 * Agent Engine — The Master Brain
 * 
 * This is the core orchestrator that:
 * 1. Loads knowledge from .md files
 * 2. Maintains conversation history per user (Redis)
 * 3. Sends context + history + message to LLM
 * 4. Parses actions from LLM response
 * 5. Executes actions (save data, create orders, tag contacts)
 * 6. Returns clean reply text to the channel handler
 * 
 * Supports: OpenAI, Gemini, Claude, DeepSeek
 */

const logger = require('../utils/logger');
const knowledge = require('./knowledge');
const memory = require('./memory');
const { parseActions, executeActions } = require('./actions');

// LLM Provider implementations
const providers = {};

/**
 * Initialize the agent engine
 */
function init() {
  // Initialize available providers based on env vars
  if (process.env.OPENAI_API_KEY) {
    providers.openai = createOpenAIProvider();
    logger.info('✅ OpenAI provider initialized');
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
    providers.gemini = createGeminiProvider();
    logger.info('✅ Gemini provider initialized');
  }
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) {
    providers.claude = createClaudeProvider();
    logger.info('✅ Claude provider initialized');
  }
  if (process.env.DEEPSEEK_API_KEY) {
    providers.deepseek = createDeepSeekProvider();
    logger.info('✅ DeepSeek provider initialized');
  }

  const providerCount = Object.keys(providers).length;
  if (providerCount === 0) {
    logger.warn('⚠️  No AI providers configured! Set at least one API key in .env');
  } else {
    logger.info(`🧠 Agent engine ready with ${providerCount} provider(s)`);
  }

  // Pre-load knowledge
  const kb = knowledge.loadKnowledge();
  logger.info(`📚 Knowledge base loaded: ${kb.fileCount} files, ${kb.combined.length} chars`);
}

/**
 * Process an incoming message and return the agent's reply
 * 
 * @param {object} params
 * @param {string} params.channel - Channel name (telegram, whatsapp, etc.)
 * @param {string} params.senderId - Platform-specific sender ID
 * @param {string} params.messageText - The user's message text
 * @param {string} params.senderName - Sender's display name (optional)
 * @param {object} params.db - PostgreSQL pool
 * @param {object} params.redis - Redis client
 * @param {object} params.contact - Contact record (optional)
 * @returns {string} Clean reply text for the user
 */
async function processMessage({
  channel,
  senderId,
  messageText,
  senderName,
  db,
  redis,
  contact,
}) {
  try {
    // 1. Get conversation state (history + collected data)
    const state = await memory.getConversationState(redis, channel, senderId);

    // 2. Load knowledge base
    const kb = knowledge.loadKnowledge();

    // 3. Build system prompt
    const systemPrompt = buildSystemPrompt(kb.combined, state.collectedData, senderName, contact);

    // 4. Build messages array for LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      ...state.history,
      { role: 'user', content: messageText },
    ];

    // 5. Call LLM
    const provider = getActiveProvider();
    const rawReply = await provider.chat(messages);

    if (!rawReply) {
      logger.error('LLM returned empty response');
      return "I'm sorry, I'm having trouble right now. Please try again in a moment! 🙏";
    }

    // 6. Parse actions from response
    const { cleanText, actions } = parseActions(rawReply);

    // 7. Execute actions
    if (actions.length > 0) {
      logger.info(`Executing ${actions.length} actions for ${channel}:${senderId}`);
      await executeActions(actions, { db, redis, channel, senderId, contact });
    }

    // 8. Save to conversation history (store the CLEAN text, not markers)
    await memory.addToHistory(redis, channel, senderId, messageText, cleanText);

    // 9. Store messages in database
    if (contact?.id) {
      await storeMessages(db, contact, channel, messageText, cleanText);
    }

    logger.info(`Agent reply for ${channel}:${senderId} (${cleanText.length} chars, ${actions.length} actions)`);
    return cleanText;

  } catch (error) {
    logger.error(`Agent processing error for ${channel}:${senderId}:`, error);
    return "I'm sorry, something went wrong. Please try again! 🙏";
  }
}

/**
 * Build the system prompt with knowledge context
 */
function buildSystemPrompt(knowledgeText, collectedData, senderName, contact) {
  let prompt = knowledgeText;

  // Add context about the current customer
  prompt += '\n\n=== CURRENT CONVERSATION CONTEXT ===\n\n';

  if (senderName) {
    prompt += `Customer name: ${senderName}\n`;
  }
  if (contact) {
    if (contact.first_name) prompt += `Known name: ${contact.first_name} ${contact.last_name || ''}\n`;
    if (contact.phone) prompt += `Known phone: ${contact.phone}\n`;
    if (contact.email) prompt += `Known email: ${contact.email}\n`;
    if (contact.tags && contact.tags.length > 0) {
      prompt += `Customer tags: ${contact.tags.join(', ')}\n`;
    }
  }

  // Show what data has been collected so far
  const dataKeys = Object.keys(collectedData);
  if (dataKeys.length > 0) {
    prompt += '\nData collected so far in this conversation:\n';
    for (const [key, value] of Object.entries(collectedData)) {
      prompt += `- ${key}: ${value}\n`;
    }
    prompt += '\nUse this data when creating the order summary. Do NOT re-ask for fields already collected.\n';
  } else {
    prompt += '\nNo data collected yet in this conversation.\n';
  }

  return prompt;
}

/**
 * Get the active LLM provider (uses default or falls back)
 */
function getActiveProvider() {
  const defaultProvider = process.env.AI_DEFAULT_PROVIDER || 'gemini';

  if (providers[defaultProvider]) {
    return providers[defaultProvider];
  }

  // Fallback to first available
  const available = Object.keys(providers);
  if (available.length > 0) {
    logger.warn(`Default provider '${defaultProvider}' not available, using '${available[0]}'`);
    return providers[available[0]];
  }

  // No providers — return a dummy that returns an error message
  return {
    chat: async () => "I'm sorry, the AI service is not configured yet. Please contact the administrator.",
  };
}

/**
 * Store messages in the database for analytics & history
 */
async function storeMessages(db, contact, channel, userMessage, botReply) {
  try {
    // Get or create conversation
    let convResult = await db.query(
      `SELECT id FROM conversations WHERE contact_id = $1 AND channel = $2 AND status IN ('active', 'bot')
       ORDER BY last_message_at DESC LIMIT 1`,
      [contact.id, channel]
    );

    let conversationId;
    if (convResult.rows.length > 0) {
      conversationId = convResult.rows[0].id;
      await db.query(
        'UPDATE conversations SET last_message_at = NOW() WHERE id = $1',
        [conversationId]
      );
    } else {
      const newConv = await db.query(
        `INSERT INTO conversations (contact_id, channel, status) VALUES ($1, $2, 'bot') RETURNING id`,
        [contact.id, channel]
      );
      conversationId = newConv.rows[0].id;
    }

    // Store user message
    await db.query(
      `INSERT INTO messages (conversation_id, contact_id, channel, direction, message_type, content)
       VALUES ($1, $2, $3, 'inbound', 'text', $4)`,
      [conversationId, contact.id, channel, JSON.stringify({ text: userMessage })]
    );

    // Store bot reply
    await db.query(
      `INSERT INTO messages (conversation_id, contact_id, channel, direction, message_type, content)
       VALUES ($1, $2, $3, 'outbound', 'text', $4)`,
      [conversationId, contact.id, channel, JSON.stringify({ text: botReply })]
    );

  } catch (error) {
    // Non-fatal — don't break the conversation for a DB error
    logger.error('Failed to store messages:', error);
  }
}


// ============================================================
// LLM Provider Implementations
// ============================================================

function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  return {
    name: 'openai',
    chat: async (messages) => {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

function createGeminiProvider() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  return {
    name: 'gemini',
    chat: async (messages) => {
      const fetch = (await import('node-fetch')).default;

      // Convert messages to Gemini format
      const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
              maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
  };
}

function createClaudeProvider() {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';

  return {
    name: 'claude',
    chat: async (messages) => {
      const fetch = (await import('node-fetch')).default;

      const systemMsg = messages.find(m => m.role === 'system')?.content || '';
      const chatMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          system: systemMsg,
          messages: chatMessages,
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
          temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.content?.[0]?.text || '';
    },
  };
}

function createDeepSeekProvider() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  return {
    name: 'deepseek',
    chat: async (messages) => {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
          max_tokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`DeepSeek API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}


// ============================================================
// Admin / Management Functions
// ============================================================

/**
 * Test the agent with a message (for dashboard testing)
 */
async function testChat(message, provider) {
  const kb = knowledge.loadKnowledge();
  const systemPrompt = buildSystemPrompt(kb.combined, {}, 'Test User', null);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  const p = provider && providers[provider] ? providers[provider] : getActiveProvider();
  return await p.chat(messages);
}

/**
 * Get agent status info
 */
function getStatus() {
  const kb = knowledge.loadKnowledge();
  return {
    providers: Object.keys(providers),
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
    knowledgeFiles: kb.fileCount,
    knowledgeSize: kb.combined.length,
    knowledgeFileList: knowledge.listKnowledgeFiles(),
  };
}

module.exports = {
  init,
  processMessage,
  testChat,
  getStatus,
  reloadKnowledge: knowledge.reloadKnowledge,
};
