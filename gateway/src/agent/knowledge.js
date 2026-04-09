/**
 * Knowledge Loader
 * 
 * Reads all .md files from the knowledge/ directory and caches them.
 * Files are reloaded on demand or at startup.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Cache for loaded knowledge
let knowledgeCache = null;
let lastLoadTime = 0;
const CACHE_TTL = 60 * 1000; // Reload every 60 seconds

const KNOWLEDGE_DIR = path.resolve(__dirname, '../../../knowledge');

/**
 * Load all .md files from the knowledge directory
 * Returns a combined string of all knowledge content
 */
function loadKnowledge(forceReload = false) {
  const now = Date.now();

  // Return cached if still fresh
  if (!forceReload && knowledgeCache && (now - lastLoadTime) < CACHE_TTL) {
    return knowledgeCache;
  }

  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) {
      logger.warn('Knowledge directory not found, creating:', KNOWLEDGE_DIR);
      fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
      return { combined: '', files: [], fileCount: 0 };
    }

    const files = fs.readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => {
        // system.md always first
        if (a === 'system.md') return -1;
        if (b === 'system.md') return 1;
        return a.localeCompare(b);
      });

    const fileContents = [];

    for (const file of files) {
      const filePath = path.join(KNOWLEDGE_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      const sectionName = file.replace('.md', '').toUpperCase().replace(/-/g, ' ');

      fileContents.push({
        name: file,
        section: sectionName,
        content,
      });
    }

    // Build combined knowledge string
    const combined = fileContents
      .map(f => `=== ${f.section} ===\n\n${f.content}`)
      .join('\n\n---\n\n');

    knowledgeCache = {
      combined,
      files: fileContents,
      fileCount: files.length,
    };
    lastLoadTime = now;

    logger.info(`Loaded ${files.length} knowledge files (${combined.length} chars)`);
    return knowledgeCache;

  } catch (error) {
    logger.error('Failed to load knowledge:', error);
    return { combined: '', files: [], fileCount: 0 };
  }
}

/**
 * Force reload knowledge (useful after updating files)
 */
function reloadKnowledge() {
  return loadKnowledge(true);
}

/**
 * Get a specific knowledge file content
 */
function getKnowledgeFile(filename) {
  const knowledge = loadKnowledge();
  return knowledge.files.find(f => f.name === filename);
}

/**
 * List all loaded knowledge files
 */
function listKnowledgeFiles() {
  const knowledge = loadKnowledge();
  return knowledge.files.map(f => ({
    name: f.name,
    section: f.section,
    size: f.content.length,
  }));
}

module.exports = {
  loadKnowledge,
  reloadKnowledge,
  getKnowledgeFile,
  listKnowledgeFiles,
};
