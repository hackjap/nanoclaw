# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**AI/Agent Platform:**
- Claude API (Anthropic)
  - SDK: @anthropic-ai/claude-code
  - Auth: `ANTHROPIC_API_KEY` (API key mode) or `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_AUTH_TOKEN` (OAuth mode)
  - Base URL: `ANTHROPIC_BASE_URL` (default: https://api.anthropic.com)
  - Accessed via credential proxy at `localhost:3001` from containers

**Messaging Channels:**
- Slack ([@slack/bolt](https://github.com/slackapi/bolt-js))
  - Integration: `src/channels/slack.ts`
  - Auth: `SLACK_BOT_TOKEN` (bot token), `SLACK_APP_TOKEN` (app-level token for Socket Mode)
  - Features:
    - Socket Mode connection (long-lived WebSocket)
    - Automatic channel metadata sync via `conversations.list()`
    - User name caching and resolution
    - Message length splitting (4000 char limit)
    - No typing indicator support (Slack Bot API limitation)
  - Stores: Channel names, user names, message metadata in SQLite

- WhatsApp (separate skill - not bundled in core)
  - Framework: baileys
  - Status: Available via `/add-whatsapp` skill

- Telegram (separate skill - not bundled in core)
  - Framework: grammy
  - Status: Available via `/add-telegram` skill

- Discord (separate skill - not bundled in core)
  - Framework: discord.js
  - Status: Available via `/add-discord` skill

- Gmail (separate skill - not bundled in core)
  - Framework: googleapis
  - Status: Available via `/add-gmail` skill

## Data Storage

**Databases:**
- SQLite (better-sqlite3 11.10.0)
  - Connection: `store/messages.db`
  - Location: Relative to project root in `STORE_DIR` (`store/`)
  - Tables:
    - `chats` - Group/chat metadata (jid, name, channel, is_group)
    - `messages` - Message history with sender, content, timestamp
    - `scheduled_tasks` - Recurring/one-time jobs with cron/interval scheduling
    - `task_run_logs` - Task execution history with duration and results
    - `router_state` - Last message timestamps for polling
    - `sessions` - Claude Agent SDK session IDs per group
    - `registered_groups` - Group configuration (folder, trigger pattern, container config)
  - Client: Synchronous API via better-sqlite3

**File Storage:**
- Local filesystem only
  - Group folders: `groups/{name}/` - Per-group memory files (CLAUDE.md, logs)
  - Global folder: `groups/global/` - Shared memory (read-only to non-main groups)
  - Session data: `data/sessions/{group_folder}/.claude/` - Claude SDK session files
  - Store: `store/messages.db` - SQLite database

**Caching:**
- In-memory user name cache in SlackChannel (map-based)
- SQLite provides query result caching

## Authentication & Identity

**Auth Provider:**
- Custom hybrid approach:
  - API Key: Direct `ANTHROPIC_API_KEY` injection via credential proxy
  - OAuth: `CLAUDE_CODE_OAUTH_TOKEN` → temporary API key exchange via `/api/oauth/claude_cli/create_api_key`
  - Detection: `detectAuthMode()` in `src/credential-proxy.ts`

**Implementation:**
- Credential proxy runs at `localhost:CREDENTIAL_PROXY_PORT` (default 3001)
- Listens on local loopback only (containers connect locally)
- Intercepts all outbound requests from containers
- Injects real credentials on-the-fly (containers never see raw keys)
- See `src/credential-proxy.ts` for proxy implementation

**Multi-Channel Auth:**
- Each channel reads its own credential env vars
- Slack: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`
- Other channels: Token-based or OAuth (implementation varies by skill)
- Missing credentials → channel skipped with warning (see `src/channels/slack.ts:293-300`)

## Monitoring & Observability

**Error Tracking:**
- None detected - No Sentry, Rollbar, or similar

**Logs:**
- Custom logger via `src/logger.ts`
- Structured logging with pino or similar (implementation in logger.ts)
- Log files: `groups/{name}/logs/` per group
- Container output: Streamed to stdout with markers `---NANOCLAW_OUTPUT_START---` / `---NANOCLAW_OUTPUT_END---`

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker containers
- Runs as systemd service (Linux) or launchd service (macOS)
- macOS: `~/Library/LaunchAgents/com.nanoclaw.plist`
- Linux: systemctl user service

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or similar configured

**Container Build:**
- `./container/build.sh` - Builds `nanoclaw-agent:latest` image
- Base: node:22-slim with Chromium and dependencies
- No registry push - local build only

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` OR `CLAUDE_CODE_OAUTH_TOKEN` - Agent authentication (at least one)
- `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` - Slack integration (optional, channel skipped if missing)
- `ASSISTANT_NAME` - Bot display name (default: "Andy")

**Optional env vars:**
- `CREDENTIAL_PROXY_PORT` - Proxy listen port (default: 3001)
- `CONTAINER_IMAGE` - Docker image (default: nanoclaw-agent:latest)
- `CONTAINER_TIMEOUT` - Agent timeout in ms (default: 1800000)
- `CONTAINER_MAX_OUTPUT_SIZE` - Output size limit (default: 10485760 = 10MB)
- `IDLE_TIMEOUT` - Container idle shutdown (default: 1800000 = 30min)
- `MAX_CONCURRENT_CONTAINERS` - Parallel containers (default: 5)
- `MAX_MESSAGES_PER_PROMPT` - Messages to include per invocation (default: 10)
- `POLL_INTERVAL` - Message check frequency (default: 2000ms, hardcoded)
- `TZ` - Timezone (default: system timezone or UTC)

**Secrets location:**
- `.env` file in project root (never mounted to containers)
- OneCLI Agent Vault (optional, for credential management)

## Webhooks & Callbacks

**Incoming:**
- Message polling from Slack (via Socket Mode)
- Local IPC file monitoring for streaming messages

**Outgoing:**
- Slack `chat.postMessage` API for message delivery
- stdout/IPC for container agent output
- No outbound webhooks to other services

## Additional Integration Points

**Channel Self-Registration:**
- Channel registry pattern (see `src/channels/registry.ts`)
- Each channel implements `Channel` interface
- Registered via `registerChannel()` call at import time
- Channels loaded from barrel import in `src/channels/index.ts`
- Unconfigured channels skipped at startup

**Scheduled Task Execution:**
- Task scheduler spawns agents via container runner
- Cron expressions parsed by cron-parser
- Task tools available inside container via MCP (nanoclaw server)
- Can send messages back to originating group

**IPC System:**
- File-based message passing for streaming outputs
- Watch path: `groups/{folder}/ipc/`
- Input/output JSON with structured markers
- Used for: Agent result streaming, follow-up messages, task status

---

*Integration audit: 2026-04-02*
