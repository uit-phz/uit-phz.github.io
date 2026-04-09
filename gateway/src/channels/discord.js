/**
 * Discord Bot Channel Handler
 * 
 * Uses discord.js WebSocket client (not webhooks).
 * Wired to the Agent Engine — every DM and mentioned message gets an AI reply.
 */

const logger = require('../utils/logger');
const contactService = require('../services/contacts');
const agent = require('../agent/engine');

let discordClient = null;

/**
 * Initialize the Discord bot
 * Called at startup — creates a persistent WebSocket connection
 */
async function init(db, redis) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.info('Discord: No bot token configured, skipping');
    return null;
  }

  try {
    const { Client, GatewayIntentBits, Partials } = require('discord.js');

    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    // Handle ready
    discordClient.once('ready', () => {
      logger.info(`🟣 Discord bot connected as: ${discordClient.user.tag}`);
      logger.info(`   Serving ${discordClient.guilds.cache.size} server(s)`);
    });

    // Handle incoming messages
    discordClient.on('messageCreate', async (message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      const isDM = !message.guild;
      const isMentioned = message.mentions.has(discordClient.user);
      const startsWithPrefix = message.content.startsWith(process.env.DISCORD_PREFIX || '!bot ');

      // Only respond to DMs, @mentions, or prefix commands
      if (!isDM && !isMentioned && !startsWithPrefix) return;

      try {
        // Clean the message text (remove mention/prefix)
        let messageText = message.content;
        if (isMentioned) {
          messageText = messageText.replace(/<@!?\d+>/g, '').trim();
        }
        if (startsWithPrefix) {
          const prefix = process.env.DISCORD_PREFIX || '!bot ';
          messageText = messageText.slice(prefix.length).trim();
        }

        if (!messageText) {
          await message.reply("Hi! How can I help you? 😊");
          return;
        }

        const senderId = message.author.id;
        const senderName = message.author.displayName || message.author.username;

        logger.info('Discord message received', {
          from: senderId,
          username: senderName,
          isDM,
          guild: message.guild?.name || 'DM',
        });

        // Show typing indicator
        await message.channel.sendTyping();

        // Upsert contact
        const contact = await contactService.upsertFromPlatform(db, {
          externalId: senderId,
          channel: 'discord',
          firstName: senderName,
          profilePicUrl: message.author.displayAvatarURL(),
        });

        // Process through agent engine
        const reply = await agent.processMessage({
          channel: 'discord',
          senderId,
          messageText,
          senderName,
          db,
          redis,
          contact,
        });

        // Send reply — split into chunks if too long (Discord 2000 char limit)
        const chunks = splitMessage(reply, 2000);
        for (const chunk of chunks) {
          if (isDM) {
            await message.channel.send(chunk);
          } else {
            await message.reply(chunk);
          }
        }

      } catch (error) {
        logger.error('Discord message processing error:', error);
        try {
          await message.reply("I'm sorry, something went wrong. Please try again! 🙏");
        } catch (e) {
          logger.error('Failed to send error reply:', e.message);
        }
      }
    });

    // Handle errors
    discordClient.on('error', (error) => {
      logger.error('Discord client error:', error);
    });

    // Login
    await discordClient.login(token);
    return discordClient;

  } catch (error) {
    logger.error('Failed to initialize Discord bot:', error);
    return null;
  }
}

/**
 * Split a message into chunks for Discord's 2000 char limit
 */
function splitMessage(text, maxLength = 2000) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Try space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

/**
 * Get the Discord client instance (for status checks etc.)
 */
function getClient() {
  return discordClient;
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (discordClient) {
    logger.info('Shutting down Discord bot...');
    discordClient.destroy();
    discordClient = null;
  }
}

module.exports = { init, getClient, shutdown };
