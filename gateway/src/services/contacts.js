/**
 * Contact Management Service
 * 
 * Unified contact store with cross-channel merging.
 * Contacts can be linked across channels by phone number or email.
 */

const logger = require('../utils/logger');

/**
 * Create or update a contact from platform data
 */
async function upsertFromPlatform(db, { externalId, channel, firstName, lastName, phone, email, profilePicUrl }) {
  try {
    // Check if contact already exists for this channel
    const existing = await db.query(
      'SELECT * FROM contacts WHERE external_id = $1 AND channel = $2',
      [externalId, channel]
    );

    if (existing.rows.length > 0) {
      // Update existing contact
      const contact = existing.rows[0];
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (firstName && !contact.first_name) {
        updates.push(`first_name = $${paramIndex++}`);
        values.push(firstName);
      }
      if (lastName && !contact.last_name) {
        updates.push(`last_name = $${paramIndex++}`);
        values.push(lastName);
      }
      if (phone && !contact.phone) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(phone);
      }
      if (email && !contact.email) {
        updates.push(`email = $${paramIndex++}`);
        values.push(email);
      }
      if (profilePicUrl) {
        updates.push(`profile_pic_url = $${paramIndex++}`);
        values.push(profilePicUrl);
      }

      // Always update last_interaction
      updates.push(`last_interaction = NOW()`);
      updates.push(`updated_at = NOW()`);

      if (updates.length > 0) {
        values.push(contact.id);
        await db.query(
          `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );
      }

      return contact;
    }

    // Create new contact
    const result = await db.query(
      `INSERT INTO contacts (external_id, channel, first_name, last_name, phone, email, profile_pic_url, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [externalId, channel, firstName || null, lastName || null, phone || null, email || null, profilePicUrl || null]
    );

    logger.info('New contact created', { id: result.rows[0].id, channel, name: firstName });
    return result.rows[0];
  } catch (error) {
    logger.error('Contact upsert error:', error);
    throw error;
  }
}

/**
 * List contacts with optional filtering
 */
async function list(db, { channel, tag, limit = 50, offset = 0 }) {
  let query = 'SELECT * FROM contacts WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (channel) {
    query += ` AND channel = $${paramIndex++}`;
    params.push(channel);
  }

  if (tag) {
    query += ` AND $${paramIndex++} = ANY(tags)`;
    params.push(tag);
  }

  query += ` ORDER BY last_interaction DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), parseInt(offset));

  const result = await db.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) FROM contacts WHERE 1=1';
  const countParams = [];
  let countIndex = 1;

  if (channel) {
    countQuery += ` AND channel = $${countIndex++}`;
    countParams.push(channel);
  }
  if (tag) {
    countQuery += ` AND $${countIndex++} = ANY(tags)`;
    countParams.push(tag);
  }

  const countResult = await db.query(countQuery, countParams);

  return {
    contacts: result.rows,
    total: parseInt(countResult.rows[0].count),
    limit: parseInt(limit),
    offset: parseInt(offset),
  };
}

/**
 * Get a single contact by ID
 */
async function getById(db, id) {
  const result = await db.query('SELECT * FROM contacts WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Add tags to a contact
 */
async function addTags(db, contactId, tags) {
  await db.query(
    'UPDATE contacts SET tags = array_cat(tags, $1), updated_at = NOW() WHERE id = $2',
    [tags, contactId]
  );
}

/**
 * Remove a tag from a contact
 */
async function removeTag(db, contactId, tag) {
  await db.query(
    'UPDATE contacts SET tags = array_remove(tags, $1), updated_at = NOW() WHERE id = $2',
    [tag, contactId]
  );
}

/**
 * Set a custom field on a contact
 */
async function setCustomField(db, contactId, fieldName, fieldValue) {
  await db.query(
    `UPDATE contacts SET custom_fields = custom_fields || $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify({ [fieldName]: fieldValue }), contactId]
  );
}

/**
 * Find contacts that share the same phone or email across channels
 * (for contact merging / cross-channel identification)
 */
async function findLinkedContacts(db, contactId) {
  const contact = await getById(db, contactId);
  if (!contact) return [];

  const conditions = [];
  const params = [contactId]; // Exclude self
  let paramIndex = 2;

  if (contact.phone) {
    conditions.push(`phone = $${paramIndex++}`);
    params.push(contact.phone);
  }
  if (contact.email) {
    conditions.push(`email = $${paramIndex++}`);
    params.push(contact.email);
  }

  if (conditions.length === 0) return [];

  const result = await db.query(
    `SELECT * FROM contacts WHERE id != $1 AND (${conditions.join(' OR ')})`,
    params
  );

  return result.rows;
}

/**
 * Subscribe/unsubscribe a contact
 */
async function setSubscription(db, contactId, isSubscribed) {
  await db.query(
    'UPDATE contacts SET is_subscribed = $1, updated_at = NOW() WHERE id = $2',
    [isSubscribed, contactId]
  );
}

module.exports = {
  upsertFromPlatform,
  list,
  getById,
  addTags,
  removeTag,
  setCustomField,
  findLinkedContacts,
  setSubscription,
};
