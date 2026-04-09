# 🤖 ChatraceClone — Self-Hosted Omnichannel AI Chatbot Platform

A self-hosted alternative to Chatrace, built with open-source tools. Automate sales, marketing, and customer support across **Messenger, WhatsApp, Instagram, Telegram, Viber, SMS, and Web Chat** — all powered by AI.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                  │
│              (SSL termination, routing)                  │
├──────────┬──────────┬──────────┬────────────────────────┤
│ Botpress │   n8n    │ Chatwoot │   Channel Gateway      │
│  :3000   │  :5678   │  :3001   │       :4000            │
│ Flow     │ Workflow │  Team    │  Webhook handlers      │
│ Builder  │ Engine   │  Inbox   │  for all channels      │
├──────────┴──────────┴──────────┴────────────────────────┤
│              PostgreSQL  │  Redis  │  MinIO              │
│               :5432      │  :6379  │  :9000              │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- A VPS with 4GB+ RAM (or local machine for development)
- Domain name (for production with SSL)

### 1. Clone & Configure

```bash
cd /Users/thomas/HobbyProject/ChatraceClone
cp .env.example .env
# Edit .env with your API keys and settings
```

### 2. Start All Services

```bash
docker compose up -d
```

### 3. Access Dashboards

| Service | URL | Purpose |
|---------|-----|---------|
| **Botpress** | http://localhost:3000 | Flow builder & bot engine |
| **n8n** | http://localhost:5678 | Workflow automation |
| **Chatwoot** | http://localhost:3001 | Team inbox |
| **Channel Gateway** | http://localhost:4000 | Webhook status & health |
| **MinIO Console** | http://localhost:9001 | File storage management |

### 4. Connect Channels

See [docs/channel-setup.md](docs/channel-setup.md) for detailed instructions on connecting:
- Facebook Messenger
- Instagram
- WhatsApp Business API
- Telegram
- Viber
- SMS (Twilio)

## Project Structure

```
ChatraceClone/
├── docker-compose.yml          # All services orchestration
├── .env.example                # Environment template
├── .env                        # Your local config (gitignored)
├── gateway/                    # Custom channel webhook gateway
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Express server entry
│   │   ├── channels/           # Channel-specific handlers
│   │   │   ├── messenger.js
│   │   │   ├── whatsapp.js
│   │   │   ├── instagram.js
│   │   │   ├── telegram.js
│   │   │   ├── viber.js
│   │   │   └── webchat.js
│   │   ├── services/           # Shared services
│   │   │   ├── ai.js           # LLM gateway (OpenAI/Gemini/Claude)
│   │   │   ├── contacts.js     # Contact management
│   │   │   └── flows.js        # Flow execution bridge
│   │   └── utils/
│   │       ├── logger.js
│   │       └── normalizer.js   # Cross-channel message normalizer
│   └── tests/
├── nginx/                      # Reverse proxy config
│   ├── nginx.conf
│   └── ssl/                    # SSL certificates
├── docs/                       # Documentation
│   ├── channel-setup.md
│   ├── ai-setup.md
│   └── deployment.md
└── scripts/                    # Utility scripts
    ├── setup.sh
    └── backup.sh
```

## Tech Stack

| Component | Technology | Role |
|-----------|-----------|------|
| Bot Engine | Botpress | Visual flow builder, NLU, multi-channel |
| Automation | n8n | Workflow orchestration, integrations |
| Inbox | Chatwoot | Omnichannel team inbox |
| Gateway | Node.js + Express | Channel webhook handler |
| Database | PostgreSQL 16 | Primary data store |
| Cache | Redis 7 | Sessions, rate limiting |
| Storage | MinIO | S3-compatible file storage |
| Proxy | Nginx | SSL, routing, load balancing |

## License

MIT — Build anything you want with this.
