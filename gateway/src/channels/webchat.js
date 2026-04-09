/**
 * Web Chat Channel Handler
 * 
 * REST-based web chat with agent-powered AI replies.
 * Every message gets an instant AI response.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');

/**
 * Create a new web chat session
 */
async function createSession(req, res) {
  try {
    const { name, email, phone } = req.body;
    const sessionId = uuidv4();
    const db = req.app.locals.db;
    const redis = req.app.locals.redis;

    const contact = await contactService.upsertFromPlatform(db, {
      externalId: sessionId,
      channel: 'webchat',
      firstName: name || 'Visitor',
      email,
      phone,
    });

    // Generate a welcome through the agent
    const welcomeReply = await agent.processMessage({
      channel: 'webchat',
      senderId: sessionId,
      messageText: '/start',
      senderName: name || 'Visitor',
      db,
      redis,
      contact,
    });

    // Store session in Redis
    await redis.set(
      `webchat:session:${sessionId}`,
      JSON.stringify({ contactId: contact.id }),
      'EX', 86400
    );

    res.json({
      sessionId,
      welcome: welcomeReply,
      message: 'Session created successfully',
    });
  } catch (error) {
    logger.error('Webchat session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
}

/**
 * Receive a message and get an instant AI reply
 */
async function receiveMessage(req, res) {
  try {
    const { sessionId, text } = req.body;
    const db = req.app.locals.db;
    const redis = req.app.locals.redis;

    if (!sessionId || !text) {
      return res.status(400).json({ error: 'sessionId and text are required' });
    }

    const sessionData = await redis.get(`webchat:session:${sessionId}`);
    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    const { contactId } = JSON.parse(sessionData);
    const contact = await contactService.getById(db, contactId);

    // Process through agent engine
    const reply = await agent.processMessage({
      channel: 'webchat',
      senderId: sessionId,
      messageText: text,
      senderName: contact?.first_name || 'Visitor',
      db,
      redis,
      contact,
    });

    res.json({
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Webchat receive error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
}

/**
 * Get conversation history for a session
 */
async function getMessages(req, res) {
  try {
    const { sessionId } = req.params;
    const redis = req.app.locals.redis;
    const memory = require('../agent/memory');

    const history = await memory.getHistory(redis, 'webchat', sessionId);

    res.json({
      messages: history.map((msg, i) => ({
        id: i,
        direction: msg.role === 'user' ? 'inbound' : 'outbound',
        content: { text: msg.content },
        timestamp: new Date().toISOString(),
      })),
      sessionId,
    });
  } catch (error) {
    logger.error('Webchat get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

module.exports = { createSession, receiveMessage, getMessages };
