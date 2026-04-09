/**
 * AI Service — Multi-Provider LLM Gateway
 * 
 * Supports: OpenAI, Google Gemini, Anthropic Claude, DeepSeek
 * Automatically routes to the configured default provider or per-agent provider.
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const logger = require('../utils/logger');

// Initialize clients lazily
let openaiClient = null;
let anthropicClient = null;
let geminiClient = null;

function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getAnthropic() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }
  return geminiClient;
}

/**
 * Chat with an AI model
 * @param {object} options
 * @param {string} options.message - User message
 * @param {string} options.agentId - AI agent ID (optional, loads config from DB)
 * @param {Array} options.conversationHistory - Previous messages
 * @param {object} options.db - Database pool
 * @returns {string} AI response text
 */
async function chat({ message, agentId, conversationHistory = [], db }) {
  let provider = process.env.AI_DEFAULT_PROVIDER || 'openai';
  let model = process.env.OPENAI_MODEL || 'gpt-4o';
  let systemPrompt = 'You are a helpful customer support assistant. Be concise, friendly, and professional.';
  let temperature = 0.7;
  let maxTokens = 1000;

  // Load agent config from database if agentId provided
  if (agentId && db) {
    try {
      const agentResult = await db.query('SELECT * FROM ai_agents WHERE id = $1 AND is_active = TRUE', [agentId]);
      if (agentResult.rows.length > 0) {
        const agent = agentResult.rows[0];
        provider = agent.provider;
        model = agent.model;
        systemPrompt = agent.system_prompt || systemPrompt;
        temperature = parseFloat(agent.temperature) || temperature;
        maxTokens = agent.max_tokens || maxTokens;
      }
    } catch (error) {
      logger.warn('Failed to load AI agent config:', error.message);
    }
  }

  // Route to the appropriate provider
  switch (provider) {
    case 'openai':
      return chatOpenAI({ message, conversationHistory, systemPrompt, model, temperature, maxTokens });
    case 'gemini':
      return chatGemini({ message, conversationHistory, systemPrompt, model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', temperature, maxTokens });
    case 'claude':
      return chatClaude({ message, conversationHistory, systemPrompt, model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514', temperature, maxTokens });
    case 'deepseek':
      return chatDeepSeek({ message, conversationHistory, systemPrompt, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', temperature, maxTokens });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * OpenAI Chat
 */
async function chatOpenAI({ message, conversationHistory, systemPrompt, model, temperature, maxTokens }) {
  const client = getOpenAI();
  if (!client) throw new Error('OpenAI not configured (missing OPENAI_API_KEY)');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content?.text || msg.text || '',
    })),
    { role: 'user', content: message },
  ];

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });

    const reply = response.choices[0]?.message?.content || '';
    logger.info('OpenAI response generated', { model, tokens: response.usage?.total_tokens });
    return reply;
  } catch (error) {
    logger.error('OpenAI error:', error.message);
    throw error;
  }
}

/**
 * Google Gemini Chat
 */
async function chatGemini({ message, conversationHistory, systemPrompt, model, temperature, maxTokens }) {
  const client = getGemini();
  if (!client) throw new Error('Gemini not configured (missing GOOGLE_AI_API_KEY)');

  try {
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    });

    const history = conversationHistory.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' : 'model',
      parts: [{ text: msg.content?.text || msg.text || '' }],
    }));

    const chat = genModel.startChat({ history });
    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    logger.info('Gemini response generated', { model });
    return reply;
  } catch (error) {
    logger.error('Gemini error:', error.message);
    throw error;
  }
}

/**
 * Anthropic Claude Chat
 */
async function chatClaude({ message, conversationHistory, systemPrompt, model, temperature, maxTokens }) {
  const client = getAnthropic();
  if (!client) throw new Error('Claude not configured (missing ANTHROPIC_API_KEY)');

  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content?.text || msg.text || '',
    })),
    { role: 'user', content: message },
  ];

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0]?.text || '';
    logger.info('Claude response generated', { model, tokens: response.usage?.output_tokens });
    return reply;
  } catch (error) {
    logger.error('Claude error:', error.message);
    throw error;
  }
}

/**
 * DeepSeek Chat (OpenAI-compatible API)
 */
async function chatDeepSeek({ message, conversationHistory, systemPrompt, model, temperature, maxTokens }) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DeepSeek not configured (missing DEEPSEEK_API_KEY)');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.content?.text || msg.text || '',
    })),
    { role: 'user', content: message },
  ];

  try {
    const { data } = await axios.post(
      'https://api.deepseek.com/chat/completions',
      { model, messages, temperature, max_tokens: maxTokens },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const reply = data.choices[0]?.message?.content || '';
    logger.info('DeepSeek response generated', { model });
    return reply;
  } catch (error) {
    logger.error('DeepSeek error:', error.message);
    throw error;
  }
}

/**
 * List available AI providers and their status
 */
function getProviderStatus() {
  return {
    openai: { configured: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
    gemini: { configured: !!process.env.GOOGLE_AI_API_KEY, model: process.env.GEMINI_MODEL },
    claude: { configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.CLAUDE_MODEL },
    deepseek: { configured: !!process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL },
    default: process.env.AI_DEFAULT_PROVIDER || 'openai',
  };
}

module.exports = {
  chat,
  chatOpenAI,
  chatGemini,
  chatClaude,
  chatDeepSeek,
  getProviderStatus,
};
