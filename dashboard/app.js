/**
 * ChatraceClone — Dashboard App
 * 
 * Client-side controller for the admin dashboard.
 * Handles navigation, data fetching, and UI interactions.
 */

const API_BASE = '/api';
const API_KEY = 'dev-key-change-me'; // Change in production

// ── Navigation ──────────────────────────────
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.page-section');
const pageTitle = document.getElementById('page-title');

const sectionTitles = {
  dashboard: 'Dashboard',
  conversations: 'Team Inbox',
  contacts: 'Contacts',
  broadcasts: 'Broadcasts',
  flows: 'Automation Flows',
  ai: 'AI Center',
  settings: 'Settings',
};

navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    setActiveSection(section);
  });
});

function setActiveSection(section) {
  navItems.forEach((n) => n.classList.remove('active'));
  sections.forEach((s) => s.classList.remove('active'));

  const navEl = document.querySelector(`[data-section="${section}"]`);
  const sectionEl = document.getElementById(`section-${section}`);

  if (navEl) navEl.classList.add('active');
  if (sectionEl) sectionEl.classList.add('active');
  if (pageTitle) pageTitle.textContent = sectionTitles[section] || section;

  // Auto-load data for settings section
  if (section === 'settings') {
    const activeTab = document.querySelector('.settings-tab.active');
    const tab = activeTab?.dataset?.tab || 'channels';
    if (tab === 'channels') loadChannelCards();
    else if (tab === 'ai') loadAISettings();
    else if (tab === 'webhooks') loadWebhookURLs();
  }

  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');
}

// Sidebar toggle (mobile)
document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// ── Clock ───────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ── API Helper ──────────────────────────────
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...options.headers,
      },
      ...options,
    });

    if (!res.ok) {
      throw new Error(`API ${res.status}: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.warn(`API call failed: ${path}`, error.message);
    return null;
  }
}

// ── Health Check ─────────────────────────────
async function checkHealth() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  try {
    const res = await fetch('/health');
    const data = await res.json();

    if (data.status === 'healthy') {
      statusDot?.classList.add('connected');
      statusDot?.classList.remove('error');
      if (statusText) statusText.textContent = 'Connected';

      // Update health grid
      updateHealthItem('health-gateway', 'Healthy', 'healthy');
      updateHealthItem('health-db', data.services?.database === 'connected' ? 'Connected' : 'Error',
        data.services?.database === 'connected' ? 'healthy' : 'error');
      updateHealthItem('health-redis', data.services?.redis === 'connected' ? 'Connected' : 'Error',
        data.services?.redis === 'connected' ? 'healthy' : 'error');
      updateHealthItem('health-n8n', 'Available', 'healthy');

      // Update channel statuses
      if (data.channels) {
        Object.entries(data.channels).forEach(([ch, configured]) => {
          const el = document.getElementById(`ch-${ch}`);
          if (el) {
            el.classList.toggle('active', configured);
            el.title = configured ? 'Configured' : 'Not configured';
          }
        });
      }

      // Update AI stat
      if (data.ai) {
        const aiEl = document.getElementById('stat-ai');
        if (aiEl) {
          const provider = data.ai.provider || 'None';
          aiEl.textContent = provider.charAt(0).toUpperCase() + provider.slice(1);
        }
      }

      return data;
    }
  } catch (error) {
    statusDot?.classList.add('error');
    statusDot?.classList.remove('connected');
    if (statusText) statusText.textContent = 'Disconnected';

    updateHealthItem('health-gateway', 'Offline', 'error');
    updateHealthItem('health-db', 'Unknown', 'checking');
    updateHealthItem('health-redis', 'Unknown', 'checking');
    updateHealthItem('health-n8n', 'Unknown', 'checking');
  }
}

function updateHealthItem(id, text, status) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    el.className = `health-status ${status}`;
  }
}

// ── Dashboard Stats ──────────────────────────
async function loadDashboardStats() {
  const data = await apiFetch('/stats');
  if (!data) return;

  // Update stat cards
  const contactsEl = document.getElementById('stat-contacts');
  const convsEl = document.getElementById('stat-conversations');
  const flowsEl = document.getElementById('stat-flows');

  if (contactsEl && data.contacts) {
    animateNumber(contactsEl, data.contacts.total);
  }
  if (convsEl && data.conversations) {
    animateNumber(convsEl, parseInt(data.conversations.open_count) || 0);
  }

  // Update channel list
  if (data.channels && data.channels.length > 0) {
    const listEl = document.getElementById('channel-list');
    if (listEl) {
      const maxCount = Math.max(...data.channels.map((c) => parseInt(c.count)));
      listEl.innerHTML = data.channels
        .map((ch) => {
          const pct = maxCount > 0 ? (parseInt(ch.count) / maxCount) * 100 : 0;
          return `
            <div class="channel-row">
              <span style="width:100px;font-weight:500;text-transform:capitalize">${ch.channel}</span>
              <div class="channel-bar-wrapper">
                <div class="channel-bar" style="width:${pct}%"></div>
              </div>
              <span style="font-variant-numeric:tabular-nums;font-weight:600">${ch.count}</span>
            </div>
          `;
        })
        .join('');
    }
  }

  // AI provider status
  if (data.ai) {
    updateProviders(data.ai);
  }
}

function updateProviders(ai) {
  const providers = ['openai', 'gemini', 'claude', 'deepseek'];
  providers.forEach((p) => {
    const statusEl = document.getElementById(`ai-${p}`);
    const modelEl = document.getElementById(`ai-${p}-model`);

    if (statusEl) {
      if (ai[p]?.configured) {
        statusEl.textContent = 'Active';
        statusEl.style.background = 'rgba(34, 197, 94, 0.1)';
        statusEl.style.color = '#22c55e';
      } else {
        statusEl.textContent = 'Inactive';
        statusEl.style.background = 'rgba(100, 116, 139, 0.1)';
        statusEl.style.color = '#64748b';
      }
    }

    if (modelEl && ai[p]?.model) {
      modelEl.textContent = ai[p].model;
    }
  });

  // Highlight default
  if (ai.default) {
    const defaultEl = document.getElementById(`ai-${ai.default}`);
    if (defaultEl && defaultEl.textContent === 'Active') {
      defaultEl.textContent = '★ Default';
    }
  }
}

// ── Animated Counter ─────────────────────────
function animateNumber(el, target) {
  const duration = 800;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(start + diff * eased).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ── Contacts ─────────────────────────────────
async function loadContacts(channel = '') {
  const data = await apiFetch(`/contacts?channel=${channel}&limit=50`);
  if (!data) return;

  const tbody = document.getElementById('contacts-table-body');
  if (!tbody) return;

  const contacts = data.contacts || [];

  if (contacts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No contacts yet</td></tr>';
    return;
  }

  tbody.innerHTML = contacts
    .map((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
      const tags = (c.tags || []).map((t) => `<span class="badge badge-info">${t}</span>`).join(' ');
      const lastActive = c.last_interaction
        ? new Date(c.last_interaction).toLocaleDateString()
        : '—';
      const status = c.is_subscribed
        ? '<span class="badge badge-success">Subscribed</span>'
        : '<span class="badge badge-warning">Unsubscribed</span>';

      return `
        <tr>
          <td style="font-weight:500;color:var(--text-primary)">${escapeHtml(name)}</td>
          <td><span class="badge badge-info" style="text-transform:capitalize">${c.channel}</span></td>
          <td>${escapeHtml(c.phone || '—')}</td>
          <td>${tags || '—'}</td>
          <td>${lastActive}</td>
          <td>${status}</td>
        </tr>
      `;
    })
    .join('');
}

// Filter contacts by channel
document.getElementById('contact-channel-filter')?.addEventListener('change', (e) => {
  loadContacts(e.target.value);
});

// ── AI Test Chat ─────────────────────────────
const aiInput = document.getElementById('ai-test-input');
const aiSendBtn = document.getElementById('ai-test-send');
const aiMessages = document.getElementById('ai-messages');

function addAiMessage(text, type) {
  if (!aiMessages) return;
  const div = document.createElement('div');
  div.className = `ai-msg ${type}`;
  div.textContent = text;
  aiMessages.appendChild(div);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

async function sendAiTestMessage() {
  const message = aiInput?.value?.trim();
  if (!message) return;

  addAiMessage(message, 'user');
  aiInput.value = '';
  aiSendBtn.disabled = true;
  aiSendBtn.textContent = '…';

  const data = await apiFetch('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

  aiSendBtn.disabled = false;
  aiSendBtn.textContent = 'Send';

  if (data?.reply) {
    addAiMessage(data.reply, 'bot');
  } else {
    addAiMessage('⚠️ AI not configured or unavailable. Check your API keys.', 'bot');
  }
}

aiSendBtn?.addEventListener('click', sendAiTestMessage);
aiInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendAiTestMessage();
});

// ── Conversation Filters ─────────────────────
document.querySelectorAll('.filter-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    // loadConversations(tab.dataset.filter);
  });
});

// ── Settings Tab Navigation ──────────────────
document.querySelectorAll('.settings-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.getElementById(`panel-${tab.dataset.tab}`);
    if (panel) panel.classList.add('active');

    // Load data when switching tabs
    if (tab.dataset.tab === 'channels') loadChannelCards();
    if (tab.dataset.tab === 'ai') loadAISettings();
    if (tab.dataset.tab === 'webhooks') loadWebhookURLs();
  });
});

// ── Channel Cards (BYO) ──────────────────────
const CHANNEL_FIELDS = {
  messenger: [
    { key: 'META_PAGE_ACCESS_TOKEN', label: 'Page Access Token', secret: true, placeholder: 'EAAG...' },
    { key: 'META_APP_ID', label: 'App ID', secret: false, placeholder: '1234567890' },
    { key: 'META_APP_SECRET', label: 'App Secret', secret: true, placeholder: '' },
    { key: 'META_VERIFY_TOKEN', label: 'Verify Token', secret: false, placeholder: 'my_custom_verify_token' },
    { key: 'META_WEBHOOK_SECRET', label: 'Webhook Secret', secret: true, placeholder: '' },
  ],
  instagram: [
    { key: 'META_PAGE_ACCESS_TOKEN', label: 'Page Access Token (shared with Messenger)', secret: true, placeholder: 'EAAG...' },
  ],
  whatsapp: [
    { key: 'WHATSAPP_TOKEN', label: 'Permanent Token', secret: true, placeholder: 'EAAG...' },
    { key: 'WHATSAPP_PHONE_ID', label: 'Phone Number ID', secret: false, placeholder: '1234567890' },
    { key: 'WHATSAPP_VERIFY_TOKEN', label: 'Verify Token', secret: false, placeholder: 'my_wa_verify_token' },
  ],
  telegram: [
    { key: 'TELEGRAM_BOT_TOKEN', label: 'Bot Token (from @BotFather)', secret: true, placeholder: '1234567890:ABCdefGHI...' },
    { key: 'TELEGRAM_WEBHOOK_SECRET', label: 'Webhook Secret (optional)', secret: true, placeholder: '' },
  ],
  viber: [
    { key: 'VIBER_AUTH_TOKEN', label: 'Auth Token', secret: true, placeholder: '' },
    { key: 'VIBER_BOT_NAME', label: 'Bot Display Name', secret: false, placeholder: 'MyBot' },
  ],
  line: [
    { key: 'LINE_CHANNEL_ACCESS_TOKEN', label: 'Channel Access Token', secret: true, placeholder: '' },
    { key: 'LINE_CHANNEL_SECRET', label: 'Channel Secret', secret: true, placeholder: '' },
  ],
  discord: [
    { key: 'DISCORD_BOT_TOKEN', label: 'Bot Token', secret: true, placeholder: '' },
    { key: 'DISCORD_PREFIX', label: 'Command Prefix', secret: false, placeholder: '!bot' },
  ],
  webchat: [],
};

async function loadChannelCards() {
  const container = document.getElementById('channel-cards');
  if (!container) return;

  const channelData = await apiFetch('/channels/status');
  if (!channelData) {
    container.innerHTML = '<div class="loading-channels">⚠️ Could not load channel status</div>';
    return;
  }

  let html = '';
  for (const [id, ch] of Object.entries(channelData)) {
    const isConnected = ch.connected;
    const fields = CHANNEL_FIELDS[id] || [];

    html += `
      <div class="byo-channel-card ${isConnected ? 'connected' : ''}" data-channel="${id}">
        <div class="byo-channel-header" onclick="toggleChannelCard(this)">
          <div class="byo-channel-icon">${ch.icon}</div>
          <div class="byo-channel-info">
            <h4>${ch.name}</h4>
            <div class="channel-webhook">${ch.webhookPath}</div>
          </div>
          <span class="byo-channel-status ${isConnected ? 'connected' : 'disconnected'}">
            ${isConnected ? 'Connected' : 'Not set'}
          </span>
          ${fields.length > 0 ? '<span class="byo-channel-toggle">▼</span>' : ''}
        </div>
        ${fields.length > 0 ? `
        <div class="byo-channel-body">
          ${fields.map(f => `
            <div class="form-group">
              <label>${f.label}</label>
              <input type="${f.secret ? 'password' : 'text'}"
                     class="form-input ${f.secret ? 'secret-input' : ''}"
                     id="ch-${f.key}"
                     placeholder="${f.placeholder}"
                     autocomplete="off" />
            </div>
          `).join('')}
          <div class="channel-save-row">
            <button class="btn btn-primary" onclick="saveChannelSettings('${id}')">
              💾 Save ${ch.name}
            </button>
            <span class="save-status" id="save-status-${id}"></span>
          </div>
        </div>
        ` : `
        <div class="byo-channel-body" style="display:block;padding:12px 20px 16px">
          <div class="form-hint" style="font-size:0.82rem;color:var(--color-success)">
            ✅ Always active — embedded in your site via the webchat widget.
          </div>
        </div>
        `}
      </div>
    `;
  }

  container.innerHTML = html;

  // Load existing masked values into fields
  const settings = await apiFetch('/settings');
  if (settings) {
    for (const [category, items] of Object.entries(settings)) {
      for (const item of items) {
        const el = document.getElementById(`ch-${item.key}`);
        if (el && item.configured) {
          el.placeholder = item.isSecret ? item.value : item.value;
          if (!item.isSecret && item.value) el.value = item.value;
        }
      }
    }
  }
}

function toggleChannelCard(header) {
  const card = header.closest('.byo-channel-card');
  if (card.querySelector('.byo-channel-toggle')) {
    card.classList.toggle('expanded');
  }
}

async function saveChannelSettings(channelId) {
  const fields = CHANNEL_FIELDS[channelId] || [];
  const updates = [];

  for (const f of fields) {
    const el = document.getElementById(`ch-${f.key}`);
    if (el && el.value.trim()) {
      updates.push({ key: f.key, value: el.value.trim() });
    }
  }

  if (updates.length === 0) {
    showToast('No changes to save', 'error');
    return;
  }

  const statusEl = document.getElementById(`save-status-${channelId}`);
  if (statusEl) {
    statusEl.textContent = 'Saving…';
    statusEl.className = 'save-status visible';
  }

  const result = await apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });

  if (result?.success) {
    if (statusEl) {
      statusEl.textContent = '✅ Saved!';
      statusEl.className = 'save-status visible success';
    }
    showToast(`${channelId} settings saved successfully!`, 'success');
    // Clear inputs after save (secrets are stored)
    for (const f of fields) {
      const el = document.getElementById(`ch-${f.key}`);
      if (el && f.secret) el.value = '';
    }
    // Refresh channel cards to show new status
    setTimeout(() => loadChannelCards(), 1000);
  } else {
    if (statusEl) {
      statusEl.textContent = '❌ Error';
      statusEl.className = 'save-status visible error';
    }
    showToast('Failed to save settings', 'error');
  }
}

// ── AI Settings ──────────────────────────────
async function loadAISettings() {
  const data = await apiFetch('/ai/providers');
  if (!data) return;

  // Set default provider
  const select = document.getElementById('ai-default-provider');
  if (select && data.default) select.value = data.default;

  const tempEl = document.getElementById('ai-temperature');
  const tokensEl = document.getElementById('ai-max-tokens');
  if (tempEl) tempEl.value = data.temperature || 0.7;
  if (tokensEl) tokensEl.value = data.maxTokens || 1000;

  // Update badges
  const providers = ['openai', 'gemini', 'claude', 'deepseek'];
  providers.forEach((p) => {
    const badge = document.getElementById(`badge-${p}`);
    if (badge && data.providers?.[p]) {
      if (data.providers[p].configured) {
        badge.textContent = p === data.default ? '★ Default' : 'Active';
        badge.className = p === data.default ? 'config-badge default' : 'config-badge active';
      } else {
        badge.textContent = 'Not configured';
        badge.className = 'config-badge';
      }
    }

    // Set model value
    const modelEl = document.getElementById(`input-${p.toUpperCase()}_MODEL`) ||
                    document.getElementById(`input-${p === 'gemini' ? 'GEMINI' : p.toUpperCase()}_MODEL`);
    if (modelEl && data.providers?.[p]?.model) {
      modelEl.value = data.providers[p].model;
    }
  });

  // Load masked key values
  const settings = await apiFetch('/settings/ai');
  if (settings) {
    for (const item of settings) {
      const el = document.getElementById(`input-${item.key}`);
      if (el && item.configured && item.isSecret) {
        el.placeholder = `${item.value} (saved)`;
      } else if (el && item.value && !item.isSecret) {
        el.value = item.value;
      }
    }
  }
}

async function saveAISettings() {
  const statusEl = document.getElementById('ai-save-status');
  const btn = document.getElementById('save-ai-settings');

  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  if (statusEl) statusEl.textContent = '';

  const updates = [];

  // Default provider
  const provider = document.getElementById('ai-default-provider')?.value;
  if (provider) updates.push({ key: 'AI_DEFAULT_PROVIDER', value: provider });

  // Temperature & tokens
  const temp = document.getElementById('ai-temperature')?.value;
  const tokens = document.getElementById('ai-max-tokens')?.value;
  if (temp) updates.push({ key: 'AI_TEMPERATURE', value: temp });
  if (tokens) updates.push({ key: 'AI_MAX_TOKENS', value: tokens });

  // API Keys (only if user entered a new value)
  const keyFields = [
    'OPENAI_API_KEY', 'OPENAI_MODEL',
    'GEMINI_API_KEY', 'GEMINI_MODEL',
    'CLAUDE_API_KEY', 'CLAUDE_MODEL',
    'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL',
  ];

  for (const key of keyFields) {
    const el = document.getElementById(`input-${key}`);
    if (el && el.value.trim()) {
      updates.push({ key, value: el.value.trim() });
    }
  }

  if (updates.length === 0) {
    btn.disabled = false;
    btn.textContent = '💾 Save AI Settings';
    showToast('No changes to save', 'error');
    return;
  }

  const result = await apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });

  btn.disabled = false;
  btn.textContent = '💾 Save AI Settings';

  if (result?.success) {
    if (statusEl) {
      statusEl.textContent = result.agentReloaded
        ? '✅ Saved & AI engine reloaded!'
        : '✅ Settings saved!';
      statusEl.className = 'save-status success';
    }
    showToast(result.message || 'AI settings saved!', 'success');
    // Clear secret inputs
    for (const key of keyFields) {
      const el = document.getElementById(`input-${key}`);
      if (el && key.includes('API_KEY')) el.value = '';
    }
    // Reload to show updated badges
    setTimeout(() => loadAISettings(), 500);
  } else {
    if (statusEl) {
      statusEl.textContent = '❌ Save failed';
      statusEl.className = 'save-status error';
    }
    showToast('Failed to save AI settings', 'error');
  }
}

// Expose to global scope for onclick
window.saveAISettings = saveAISettings;
window.toggleChannelCard = toggleChannelCard;
window.saveChannelSettings = saveChannelSettings;

// ── Webhook URLs ─────────────────────────────
async function loadWebhookURLs() {
  const data = await apiFetch('/settings/webhooks');
  if (!data) return;

  const mapping = {
    meta: 'wh-meta',
    whatsapp: 'wh-whatsapp',
    telegram: 'wh-telegram',
    viber: 'wh-viber',
    line: 'wh-line',
    discord: 'wh-discord',
    webchat: 'wh-webchat',
  };

  for (const [key, elId] of Object.entries(mapping)) {
    const el = document.getElementById(elId);
    if (el && data[key]) el.textContent = data[key];
  }
}

// Webhook URL copy (dynamically loaded elements)
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('webhook-url')) {
    navigator.clipboard?.writeText(e.target.textContent).then(() => {
      const original = e.target.textContent;
      e.target.textContent = '✓ Copied!';
      e.target.style.color = '#22c55e';
      setTimeout(() => {
        e.target.textContent = original;
        e.target.style.color = '';
      }, 1500);
    });
  }
});

// ── Toast Notifications ──────────────────────
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Create flow card → open n8n
document.getElementById('create-flow')?.addEventListener('click', () => {
  window.open('/n8n/', '_blank');
});

// ── Utility ──────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ── Init ─────────────────────────────────────
async function init() {
  await checkHealth();
  await loadDashboardStats();
  loadContacts();
  loadChannelCards();

  // Auto-refresh every 30s
  setInterval(() => {
    checkHealth();
    loadDashboardStats();
  }, 30000);
}

init();
