#!/bin/bash
# ═══════════════════════════════════════════════
# ChatraceClone — Native Server Deployment Script
# Target: Ubuntu 24.04, 1 vCPU, 1 GB RAM
# ═══════════════════════════════════════════════

set -euo pipefail

DEPLOY_DIR="$HOME/ChatraceClone"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   ChatraceClone — Server Setup Script     ║"
echo "║   Native Deployment for Low-RAM Server    ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# ── Step 1: Swap ──────────────────────────────
echo "━━━ Step 1: Configure Swap ━━━"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
  log "2 GB swap created and enabled"
else
  log "Swap already configured"
fi
free -h | grep Swap

# ── Step 2: Node.js 20 LTS ───────────────────
echo ""
echo "━━━ Step 2: Install Node.js 20 ━━━"
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  log "Node.js $(node --version) installed"
else
  log "Node.js $(node --version) already installed"
fi

# ── Step 3: Redis ─────────────────────────────
echo ""
echo "━━━ Step 3: Install Redis ━━━"
if ! command -v redis-server &> /dev/null; then
  sudo apt-get install -y redis-server
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
  log "Redis installed and started"
else
  log "Redis already installed"
fi
redis-cli ping || warn "Redis not responding"

# ── Step 4: PM2 ──────────────────────────────
echo ""
echo "━━━ Step 4: Install PM2 ━━━"
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
  log "PM2 installed"
else
  log "PM2 already installed"
fi

# ── Step 5: Database Setup ────────────────────
echo ""
echo "━━━ Step 5: Setup PostgreSQL Database ━━━"
DB_NAME="chatbot_platform"
DB_USER="chatbot"
DB_PASS="chatbot_secure_$(openssl rand -hex 8)"

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  log "Database '$DB_NAME' already exists"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  log "Database '$DB_NAME' created with user '$DB_USER'"
  warn "Database password: $DB_PASS (save this!)"
fi

# Run init SQL if exists
if [ -f "$DEPLOY_DIR/scripts/init-db.sql" ]; then
  sudo -u postgres psql -d "$DB_NAME" -f "$DEPLOY_DIR/scripts/init-db.sql" 2>/dev/null
  log "Database schema applied"
fi

# Run settings migration
if [ -f "$DEPLOY_DIR/scripts/migrate-settings.sql" ]; then
  sudo -u postgres psql -d "$DB_NAME" -f "$DEPLOY_DIR/scripts/migrate-settings.sql" 2>/dev/null
  log "Settings table migration applied"
fi

# Run orders migration
if [ -f "$DEPLOY_DIR/scripts/migrate-orders.sql" ]; then
  sudo -u postgres psql -d "$DB_NAME" -f "$DEPLOY_DIR/scripts/migrate-orders.sql" 2>/dev/null
  log "Orders table migration applied"
fi

# ── Step 6: Install Gateway Dependencies ──────
echo ""
echo "━━━ Step 6: Install Gateway Dependencies ━━━"
cd "$DEPLOY_DIR/gateway"
npm install --production
log "Gateway dependencies installed"

# ── Step 7: Environment File ──────────────────
echo ""
echo "━━━ Step 7: Configure Environment ━━━"
ENV_FILE="$DEPLOY_DIR/gateway/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << ENVEOF
# ChatraceClone Gateway Environment
NODE_ENV=production
PORT=4000

# Database (uses local PostgreSQL)
DATABASE_URL=postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME

# Redis (local)
REDIS_URL=redis://localhost:6379

# Admin API key (change this!)
ADMIN_API_KEY=$(openssl rand -hex 24)

# n8n webhook URL
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# AI Provider (configure your preferred provider)
AI_DEFAULT_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# GOOGLE_AI_API_KEY=...
# ANTHROPIC_API_KEY=...
# DEEPSEEK_API_KEY=...

# Channel tokens (fill in as you configure channels)
# META_PAGE_ACCESS_TOKEN=
# META_VERIFY_TOKEN=
# META_APP_SECRET=
# WHATSAPP_ACCESS_TOKEN=
# WHATSAPP_PHONE_NUMBER_ID=
# WHATSAPP_VERIFY_TOKEN=
# TELEGRAM_BOT_TOKEN=
# VIBER_AUTH_TOKEN=
# VIBER_BOT_NAME=
ENVEOF
  log "Environment file created at $ENV_FILE"
  warn "Edit $ENV_FILE to add your API keys!"
else
  log "Environment file already exists"
fi

# ── Step 8: PM2 Ecosystem Config ──────────────
echo ""
echo "━━━ Step 8: Configure PM2 ━━━"
cat > "$DEPLOY_DIR/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [
    {
      name: 'chatrace-gateway',
      cwd: './gateway',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: './gateway/.env',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '200M',
      error_file: './logs/gateway-error.log',
      out_file: './logs/gateway-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
PM2EOF
mkdir -p "$DEPLOY_DIR/logs"
log "PM2 ecosystem config created"

# ── Step 9: Nginx Configuration ───────────────
echo ""
echo "━━━ Step 9: Configure Nginx ━━━"
NGINX_CONF="/etc/nginx/sites-available/chatrace"

sudo tee "$NGINX_CONF" > /dev/null << 'NGXEOF'
# ChatraceClone — Nginx Site Config
# Access via server IP on port 80 (add domain + SSL later)

server {
    listen 8080;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 25M;

    # Dashboard (static files)
    location / {
        root /home/thomas/ChatraceClone/dashboard;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Gateway API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Webhook endpoints
    location /webhook/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_http_version 1.1;
    }

    # WebSocket for live chat
    location /ws {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # n8n (workflow editor)
    location /n8n/ {
        proxy_pass http://127.0.0.1:5678/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;
}
NGXEOF

# Enable site
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/chatrace

# Test nginx config
if sudo nginx -t; then
  sudo systemctl reload nginx
  log "Nginx configured and reloaded (port 8080)"
else
  err "Nginx config test failed!"
fi

# ── Step 10: Start Gateway ────────────────────
echo ""
echo "━━━ Step 10: Start Gateway with PM2 ━━━"
cd "$DEPLOY_DIR"

# Source env vars for PM2
set -a
source "$DEPLOY_DIR/gateway/.env" 2>/dev/null || true
set +a

pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u thomas --hp /home/thomas 2>/dev/null || true
log "Gateway started via PM2"

# ── Summary ───────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   ✅ Deployment Complete!                 ║"
echo "╠═══════════════════════════════════════════╣"
echo "║                                           ║"
echo "║  Dashboard:  http://152.42.224.175:8080    ║"
echo "║  Health:     http://152.42.224.175:8080/health║"
echo "║  Gateway:    http://localhost:4000          ║"
echo "║                                           ║"
echo "║  Next Steps:                              ║"
echo "║  1. Edit gateway/.env with API keys       ║"
echo "║  2. pm2 restart chatrace-gateway          ║"
echo "║  3. Point domain + add SSL via Certbot    ║"
echo "║                                           ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
pm2 status
