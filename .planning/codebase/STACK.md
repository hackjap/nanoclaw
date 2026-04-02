# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5.7.0 - All source code in `src/`, compiled to ES2022
- JavaScript - Runtime execution via Node.js

**Secondary:**
- Bash - Container entrypoint and build scripts

## Runtime

**Environment:**
- Node.js 22+ (specified in `package.json` engines)
- Docker/Container runtime (for agent execution)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Claude Agent SDK (`@anthropic-ai/claude-code`) - Agent execution in containers
- Node.js HTTP (`http`/`https` modules) - Credential proxy and internal APIs

**Messaging & Channels:**
- @slack/bolt 4.3.0 - Slack channel integration with Socket Mode
- @slack/types 2.15.0 - Type definitions for Slack

**Database & State:**
- better-sqlite3 11.10.0 - SQLite3 for message storage, sessions, tasks, groups (see `src/db.ts`)
- Migrations supported via `ALTER TABLE` in schema creation

**Task Scheduling:**
- cron-parser 5.5.0 - Parse cron expressions for scheduled task scheduling

**Testing:**
- vitest 4.0.18 - Test runner and framework
- @types/better-sqlite3 7.6.12 - Type definitions

**Build & Dev:**
- tsx 4.19.0 - TypeScript execution for development (`npm run dev`)
- tsc (TypeScript compiler) - Build to `dist/`

**Code Quality:**
- ESLint 9.35.0 with typescript-eslint 8.35.0 - Linting
- eslint-plugin-no-catch-all 1.1.0 - Enforce specific error handling
- Prettier 3.8.1 - Code formatting
- Husky 9.1.7 - Git hooks (prepare hook)

## Key Dependencies

**Critical:**
- @onecli-sh/sdk 0.2.0 - OneCLI credential proxy SDK (see `src/credential-proxy.ts`)
  - Handles secure credential injection for Anthropic API, OAuth tokens
  - Prevents API keys from being exposed to containers
  - Two auth modes: API-key and OAuth

**Infrastructure:**
- better-sqlite3 11.10.0 - Required for state persistence
  - Messages table with 38 columns and indexes
  - Scheduled tasks with run logs
  - Router state and sessions
  - Registered groups configuration
- cron-parser 5.5.0 - Required for task scheduling (see `src/task-scheduler.ts`)

## Configuration

**Environment:**
- `.env` file for secrets (never mounted in containers)
- Environment variables read via `readEnvFile()` in `src/env.ts`
- Key env vars:
  - `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` - Agent authentication
  - `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` - Slack integration
  - `ASSISTANT_NAME` - Bot name (default: "Andy")
  - `CREDENTIAL_PROXY_PORT` - Port for credential injection (default: 3001)
  - `CONTAINER_IMAGE` - Docker image name (default: "nanoclaw-agent:latest")
  - `CONTAINER_TIMEOUT` - Max execution time in ms (default: 1800000 = 30min)
  - `IDLE_TIMEOUT` - Container shutdown delay (default: 1800000 = 30min)
  - `MAX_CONCURRENT_CONTAINERS` - Parallel agent limit (default: 5)
  - `MAX_MESSAGES_PER_PROMPT` - Messages per agent invocation (default: 10)
  - `TZ` - Timezone for scheduling (validates against IANA list)

**Build:**
- `tsconfig.json` - ES2022 target, NodeNext module resolution
- Compiled output: `dist/`
- Source maps enabled for debugging

## Platform Requirements

**Development:**
- Node.js 22+
- npm
- Docker or container runtime (for agent execution)
- .env file with authentication credentials

**Production:**
- Node.js 22+
- Docker daemon (for spawning agent containers)
- Container image: `nanoclaw-agent:latest` (built from `container/Dockerfile`)

## Container Image

**Base:** node:22-slim

**System Dependencies:**
- chromium (for browser automation via agent-browser)
- libgtk-3-0, libnss3, libgbm1 (Chromium dependencies)
- curl, git (utilities)

**NPM Packages in Container:**
- agent-browser - Browser automation
- @anthropic-ai/claude-code - Claude Agent SDK

**Container Workflow:**
1. Entrypoint reads JSON from stdin (prompt, session ID, group context)
2. Compiles source to `/tmp/dist`
3. Executes agent via Claude Agent SDK
4. Outputs JSON to stdout with results
5. IPC files in `/workspace/ipc/` for streaming follow-up messages

---

*Stack analysis: 2026-04-02*
