-- ============================================
-- Migration: Add Orders Table
-- ============================================
-- Run this on the gateway database to enable the order action workflow.
-- 
-- Usage: psql -U chatbot -d chatbot -f scripts/migrate-orders.sql

CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    channel         VARCHAR(50) NOT NULL,
    customer_name   VARCHAR(255),
    phone           VARCHAR(100),
    address         TEXT,
    payment_method  VARCHAR(100),
    items           JSONB DEFAULT '[]',
    total_amount    DECIMAL(12,2) DEFAULT 0,
    status          VARCHAR(50) DEFAULT 'pending',  -- pending, confirmed, processing, shipped, delivered, cancelled
    notes           TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- Update contacts channel support comment
COMMENT ON COLUMN contacts.channel IS 'messenger, whatsapp, telegram, viber, line, discord, webchat, instagram';
