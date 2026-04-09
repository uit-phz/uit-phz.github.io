-- ============================================
-- ChatraceClone — Database Initialization
-- ============================================
-- This script runs automatically on first PostgreSQL start

-- Create separate databases for each service
CREATE DATABASE n8n;
CREATE DATABASE chatwoot;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE n8n TO chatbot;
GRANT ALL PRIVILEGES ON DATABASE chatwoot TO chatbot;

-- ============================================
-- Core Tables for Channel Gateway
-- ============================================

-- Contacts: Unified contact store across all channels
CREATE TABLE IF NOT EXISTS contacts (
    id              SERIAL PRIMARY KEY,
    external_id     VARCHAR(255),           -- Platform-specific user ID
    channel         VARCHAR(50) NOT NULL,   -- messenger, whatsapp, telegram, viber, sms, webchat
    first_name      VARCHAR(255),
    last_name       VARCHAR(255),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    profile_pic_url TEXT,
    locale          VARCHAR(10),
    timezone        INTEGER,
    tags            TEXT[] DEFAULT '{}',
    custom_fields   JSONB DEFAULT '{}',
    is_subscribed   BOOLEAN DEFAULT TRUE,
    last_interaction TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(external_id, channel)
);

-- Conversations: Track conversation sessions
CREATE TABLE IF NOT EXISTS conversations (
    id              SERIAL PRIMARY KEY,
    contact_id      INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    channel         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) DEFAULT 'active',  -- active, paused, closed, bot, human
    assigned_agent  VARCHAR(255),
    current_flow_id VARCHAR(255),
    flow_state      JSONB DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ
);

-- Messages: Store all messages (inbound + outbound)
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id      INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    channel         VARCHAR(50) NOT NULL,
    direction       VARCHAR(10) NOT NULL,   -- inbound, outbound
    message_type    VARCHAR(20) NOT NULL,   -- text, image, video, audio, file, location, template, interactive
    content         JSONB NOT NULL,         -- { text, media_url, buttons, etc. }
    external_id     VARCHAR(255),           -- Platform message ID
    status          VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read, failed
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Flows: Store bot flow definitions
CREATE TABLE IF NOT EXISTS flows (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    trigger_type    VARCHAR(50),            -- keyword, webhook, button, comment, default
    trigger_value   VARCHAR(255),
    flow_data       JSONB NOT NULL,         -- The flow definition (nodes + edges)
    is_active       BOOLEAN DEFAULT TRUE,
    channels        TEXT[] DEFAULT '{messenger,whatsapp,telegram,viber,webchat}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcasts: Manage bulk message sends
CREATE TABLE IF NOT EXISTS broadcasts (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    channel         VARCHAR(50) NOT NULL,
    content         JSONB NOT NULL,
    target_tags     TEXT[] DEFAULT '{}',
    target_segments JSONB DEFAULT '{}',
    status          VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
    scheduled_at    TIMESTAMPTZ,
    sent_count      INTEGER DEFAULT 0,
    failed_count    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AI Agents: Store AI agent configurations
CREATE TABLE IF NOT EXISTS ai_agents (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    provider        VARCHAR(50) NOT NULL,   -- openai, gemini, claude, deepseek
    model           VARCHAR(100) NOT NULL,
    system_prompt   TEXT,
    temperature     DECIMAL(3,2) DEFAULT 0.7,
    max_tokens      INTEGER DEFAULT 1000,
    training_data   JSONB DEFAULT '{}',     -- References to training files
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics Events
CREATE TABLE IF NOT EXISTS analytics_events (
    id              SERIAL PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,   -- message_received, message_sent, flow_triggered, ai_response, etc.
    contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    channel         VARCHAR(50),
    flow_id         INTEGER REFERENCES flows(id) ON DELETE SET NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_contacts_channel ON contacts(channel);
CREATE INDEX idx_contacts_external ON contacts(external_id, channel);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_created ON analytics_events(created_at);
CREATE INDEX idx_flows_trigger ON flows(trigger_type, trigger_value);
