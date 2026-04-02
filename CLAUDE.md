# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Secrets / Credentials / Proxy (OneCLI)

API keys, secret keys, OAuth tokens, and auth credentials are managed by the OneCLI gateway — which handles secret injection into containers at request time, so no keys or tokens are ever passed to containers directly. Run `onecli --help`.

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/init-onecli` | Install OneCLI Agent Vault and migrate `.env` credentials to it |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**DevOps Slack-to-Jira Agent**

NanoClaw 기반 Slack 봇 에이전트로, DevOps 작업 요청을 Slack 대화를 통해 Jira 이슈로 변환하는 워크플로우를 자동화한다. 요청자가 Slack 채널에서 봇을 멘션하면, 스레드에서 대화형으로 Jira 초안을 작성하고, 승인 버튼을 통해 Jira 이슈를 생성한다.

**Core Value:** 요청자가 Slack에서 자연어로 DevOps 작업을 요청하면, AI 대화를 통해 구조화된 Jira 이슈가 생성되어야 한다.

### Constraints

- **Tech stack**: NanoClaw 기존 아키텍처 (TypeScript, Node.js, Slack Bolt) 위에 구축
- **Auth**: 크리덴셜은 OneCLI/credential proxy를 통해 관리
- **Jira API**: Atlassian REST API v3 또는 MCP 도구 활용
- **Slack**: Socket Mode 유지, interactive components 추가 필요
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.0 - All source code in `src/`, compiled to ES2022
- JavaScript - Runtime execution via Node.js
- Bash - Container entrypoint and build scripts
## Runtime
- Node.js 22+ (specified in `package.json` engines)
- Docker/Container runtime (for agent execution)
- npm (lockfile: `package-lock.json` present)
## Frameworks
- Claude Agent SDK (`@anthropic-ai/claude-code`) - Agent execution in containers
- Node.js HTTP (`http`/`https` modules) - Credential proxy and internal APIs
- @slack/bolt 4.3.0 - Slack channel integration with Socket Mode
- @slack/types 2.15.0 - Type definitions for Slack
- better-sqlite3 11.10.0 - SQLite3 for message storage, sessions, tasks, groups (see `src/db.ts`)
- Migrations supported via `ALTER TABLE` in schema creation
- cron-parser 5.5.0 - Parse cron expressions for scheduled task scheduling
- vitest 4.0.18 - Test runner and framework
- @types/better-sqlite3 7.6.12 - Type definitions
- tsx 4.19.0 - TypeScript execution for development (`npm run dev`)
- tsc (TypeScript compiler) - Build to `dist/`
- ESLint 9.35.0 with typescript-eslint 8.35.0 - Linting
- eslint-plugin-no-catch-all 1.1.0 - Enforce specific error handling
- Prettier 3.8.1 - Code formatting
- Husky 9.1.7 - Git hooks (prepare hook)
## Key Dependencies
- @onecli-sh/sdk 0.2.0 - OneCLI credential proxy SDK (see `src/credential-proxy.ts`)
- better-sqlite3 11.10.0 - Required for state persistence
- cron-parser 5.5.0 - Required for task scheduling (see `src/task-scheduler.ts`)
## Configuration
- `.env` file for secrets (never mounted in containers)
- Environment variables read via `readEnvFile()` in `src/env.ts`
- Key env vars:
- `tsconfig.json` - ES2022 target, NodeNext module resolution
- Compiled output: `dist/`
- Source maps enabled for debugging
## Platform Requirements
- Node.js 22+
- npm
- Docker or container runtime (for agent execution)
- .env file with authentication credentials
- Node.js 22+
- Docker daemon (for spawning agent containers)
- Container image: `nanoclaw-agent:latest` (built from `container/Dockerfile`)
## Container Image
- chromium (for browser automation via agent-browser)
- libgtk-3-0, libnss3, libgbm1 (Chromium dependencies)
- curl, git (utilities)
- agent-browser - Browser automation
- @anthropic-ai/claude-code - Claude Agent SDK
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case with hyphens: `container-runner.ts`, `group-queue.ts`, `sender-allowlist.ts`
- Test files use `.test.ts` suffix alongside implementation: `db.test.ts`, `container-runner.test.ts`
- Barrel files (re-exports) use `index.ts`: `src/channels/index.ts`
- camelCase for all functions, both exported and internal: `getMessagesSince`, `storeMessage`, `validateAdditionalMounts`, `buildTriggerPattern`
- Private helper functions without leading underscore; only @internal JSDoc comment for test-only exports: `_initTestDatabase`, `_closeDatabase`, `_resetSchedulerLoopForTests`
- Predicate functions use `is`/`has`/`should` prefix: `isValidGroupFolder`, `isSenderAllowed`, `shouldDropMessage`, `isConnected`, `ownsJid`
- camelCase for all variable declarations: `lastTimestamp`, `registeredGroups`, `messageLoopRunning`, `maxConcurrent`
- Database column names use snake_case (in schema only): `chat_jid`, `sender_name`, `is_from_me`, `is_bot_message`, `created_at`
- Constants use UPPER_SNAKE_CASE: `ASSISTANT_NAME`, `GROUPS_DIR`, `POLL_INTERVAL`, `MAX_MESSAGES_PER_PROMPT`, `CONTAINER_IMAGE`, `DEFAULT_TRIGGER`
- Configuration exports from `config.ts` are UPPER_SNAKE_CASE: `TRIGGER_PATTERN`, `TIMEZONE`, `CREDENTIAL_PROXY_PORT`
- PascalCase for all types and interfaces: `Channel`, `NewMessage`, `RegisteredGroup`, `ScheduledTask`, `ContainerConfig`, `MountAllowlist`
- Type aliases use PascalCase: `ChannelFactory`, `OnInboundMessage`, `OnChatMetadata`
- Discriminated union types for status fields: `'active' | 'paused' | 'completed'` for task status, `'success' | 'error'` for task run status
- PascalCase: `SlackChannel`, `GroupQueue`
- Implement interfaces with explicit `implements Channel` declaration: `export class SlackChannel implements Channel`
## Code Style
- Prettier with `singleQuote: true` enforces single quotes throughout
- Run `npm run format` or `npm run format:fix` to auto-format all TypeScript files
- Check compliance with `npm run format:check`
- ESLint with TypeScript support enabled via `eslint.config.js`
- Key rules enforced:
- Run `npm run lint` or `npm run lint:fix` to check/fix issues
- Ordered by:
- Always include `.js` extension in relative imports (required for ES modules in Node.js): `from './db.js'`, `from '../router.js'`
- No path aliases configured; use relative imports
## Error Handling
- Most errors logged and caught, NOT re-thrown: `catch (err) { logger.error({ err }, 'message') }`
- JSON.parse failures caught with `catch (err: unknown)` and recovered: `{ ... } catch (err: unknown) { logger.warn(...); return {}; }`
- Database migration failures (ALTER TABLE) caught and silently ignored: `try { database.exec(...) } catch { /* column already exists */ }`
- Async operations use `.catch((err) => logger.error(...))` for fire-and-forget handler registration
- Container process failures logged but not propagated; errors written to logs/db instead
- No throw statements for expected conditions (validation errors, missing data); return empty results or null
- `src/db.ts` migrations use silent catch: lines 88-94 catch ALTER TABLE errors
- `src/index.ts` recovers from corrupted state: line 82-87 JSON.parse with fallback
- `src/group-queue.ts` catches process errors: lines 221, 249
- `src/container-runner.ts` captures process stderr/stdout and logs results
- `src/channels/slack.ts` wraps API calls: lines 140-144, 172-185, 219-243
## Logging
- `logger.debug(data | string, msg?)` - detailed diagnostics
- `logger.info(data | string, msg?)` - key events
- `logger.warn(data | string, msg?)` - recoverable issues
- `logger.error(data | string, msg?)` - errors (not fatal)
- `logger.fatal(data | string, msg?)` - unrecoverable; exits process
- String-only for simple messages: `logger.info('State loaded')`
- Object + message for structured data: `logger.info({ groupCount: 5 }, 'State loaded')`
- Pass errors as `err` field: `logger.error({ err }, 'Failed to start container')`
- All outputs include timestamp, level color, process ID, and location
- File: `src/logger.ts` lines 1-73
- Threshold controlled by `LOG_LEVEL` env var (default: 'info')
- stdout for debug/info, stderr for warn/error/fatal
## Comments
- JSDoc for public exports (functions, interfaces, classes)
- Inline comments for non-obvious logic, workarounds, or recovery paths
- Block comments (`/* */`) for migration/schema notes in db.ts
- `/** Public function description */` for exported functions
- `/** @internal - for tests only. */` for test-only exports like `_initTestDatabase`
- `/** Returns CLI args for ... */` for utility functions
- No `@param` or `@return` tags used; rely on TypeScript types for clarity
- `src/db.ts:162` - `@internal` marker for test function
- `src/container-runtime.ts:11-14` - JSDoc for exported constants
- `src/index.ts:96-99` - Multi-line comment explaining cursor recovery logic
- `src/db.ts:87-94` - Inline comment explaining migration strategy
## Function Design
- Most functions take 1-3 simple parameters (string, object, callback)
- Complex configurations passed as interfaces: `ContainerConfig`, `ScheduledTask`
- Callbacks registered at initialization: `queue.setProcessMessagesFn(fn)` rather than passed to every call
- Functions return data directly or null/undefined: `getTaskById(id)` returns `ScheduledTask | undefined`
- Async functions return `Promise<void>` for side-effects: `connect(): Promise<void>`
- Query functions return arrays: `getAllChats()` returns `ChatInfo[]` (never null)
- Predicates return boolean: `isSenderAllowed(jid, sender)` returns boolean
## Module Design
- Mix of function exports and class exports
- Constants exported at module level: `ASSISTANT_NAME`, `POLL_INTERVAL` from `config.ts`
- Interfaces exported alongside implementations: `NewMessage`, `Channel`, `RegisteredGroup` in `types.ts`
- Factory functions exported: `getChannelFactory()` returns `ChannelFactory | undefined`
- `src/channels/index.ts` re-exports nothing; only imports side-effect modules: `import './slack.js'`
- Forces explicit imports for actual usage: `import { SlackChannel } from './channels/slack.js'`
- One class per file: `SlackChannel` in `channels/slack.ts`, `GroupQueue` in `group-queue.ts`
- Utility functions grouped by domain: all DB operations in `db.ts`, all formatting in `router.ts`
- Types centralized in `types.ts` and imported everywhere needed
- Config centralized in `config.ts` and imported throughout
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single Node.js orchestrator process managing multiple concurrent containers
- Channel abstraction (WhatsApp, Slack, Telegram, Discord, Gmail) self-registering at startup
- Each group runs in an isolated Docker container with sandboxed filesystem and no direct credential access
- Asynchronous message queue managing concurrent container execution and task scheduling
- SQLite persistence for messages, group metadata, and scheduled tasks
- IPC-based message passing between orchestrator and container agents
- Credential proxy layer injecting secrets at runtime (never exposing to containers)
## Layers
- Purpose: Single source of truth for router state, message queue, task scheduling, container lifecycle
- Location: `src/index.ts` (main loop), `src/container-runner.ts` (invocation), `src/group-queue.ts` (concurrency)
- Contains: Channel management, router state, session management, group registration
- Depends on: SQLite database, file system, channel SDKs
- Used by: CLI, IPC watcher (agent messages), scheduler (cron tasks)
- Purpose: Unified interface for messaging platforms (WhatsApp, Slack, Telegram, Discord, Gmail)
- Location: `src/channels/` (registry), implementation files self-register
- Contains: Channel adapters implementing `Channel` interface, message formatting
- Depends on: Platform SDKs (Slack Bolt, etc.), router for outbound messages
- Used by: Orchestrator's message loop and metadata sync
- Purpose: Isolated execution environment for Claude Agent SDK and skills
- Location: `container/agent-runner/src/index.ts` (agent runner), `container/Dockerfile` (image)
- Contains: Agent SDK integration, IPC reader, session management, skill loading
- Depends on: Claude Agent SDK, Anthropic API (via credential proxy)
- Used by: Orchestrator spawns containers via `runContainerAgent()`
- Purpose: Inject credentials at request time without exposing them to containers
- Location: `src/credential-proxy.ts`
- Contains: HTTP reverse proxy, auth mode detection (API key vs OAuth)
- Depends on: HTTP/HTTPS for upstream Anthropic API
- Used by: Containers connect to proxy instead of API directly
- Purpose: Persistent storage of messages, sessions, groups, tasks
- Location: `src/db.ts`
- Contains: SQLite schema, queries for messages/sessions/groups/tasks/state
- Depends on: better-sqlite3
- Used by: All components (state recovery, message history, group discovery)
- Purpose: Cron and interval-based task execution
- Location: `src/task-scheduler.ts`
- Contains: Cron parsing, next-run computation, due-task detection, per-group queuing
- Depends on: Group queue, database for task definitions, container runner
- Used by: Main loop polling at SCHEDULER_POLL_INTERVAL (60s)
- Purpose: Fair scheduling across groups within MAX_CONCURRENT_CONTAINERS limit
- Location: `src/group-queue.ts`
- Contains: Per-group state (active, pending messages/tasks), retry logic with exponential backoff, drain strategy
- Depends on: Container runner, database
- Used by: Main message loop, task scheduler, IPC watcher
- Purpose: Process outbound messages and task creation from inside containers
- Location: `src/ipc.ts`
- Contains: File-based IPC reader for `/workspace/ipc/{groupFolder}/messages` and `/workspace/ipc/{groupFolder}/tasks`
- Depends on: Router (send messages), database (create tasks), container runner
- Used by: Background watcher polling at IPC_POLL_INTERVAL (1s)
- Purpose: Prevent containers from accessing sensitive host paths
- Location: `src/mount-security.ts`
- Contains: Allowlist validation, blocked pattern matching, external config loading
- Depends on: `~/.config/nanoclaw/mount-allowlist.json` (external to project)
- Used by: Container runner when building mount list
- Purpose: Validate group folder identities and resolve safe paths
- Location: `src/group-folder.ts`
- Contains: Folder name validation (alphanumeric + `-_`, max 64 chars), path traversal prevention
- Depends on: None (pure validation)
- Used by: All path resolution (group dirs, IPC dirs, sessions dirs)
## Data Flow
## Key Abstractions
- Purpose: Uniform API for platform integration
- Examples: `src/channels/slack.ts` (Slack Bolt implementation)
- Pattern: Self-registering factory via `registerChannel()`, instantiated in `channels/index.ts`
- Callbacks: `onMessage` (inbound), `onChatMetadata` (discovery)
- Purpose: Anchor all state to group folder (messages, sessions, IPC)
- Examples: `main`, `slack_main`, `global`
- Pattern: Validated via `isValidGroupFolder()`, resolved via `resolveGroupFolderPath()`
- Isolation: Each group has isolated `groups/{folder}`, `data/ipc/{folder}`, `data/sessions/{folder}`
- Purpose: Typed contract between orchestrator and container agent
- Pattern: Serialized as JSON via stdin, results via stdout markers
- Fields: prompt, sessionId, groupFolder, chatJid, isMain, containerConfig timeout
- Purpose: Track per-group lifecycle across concurrent execution
- States: `active`, `idleWaiting`, `isTaskContainer`, `pendingMessages`, `pendingTasks`
- Retry: Up to 5 retries with exponential backoff (5s, 10s, 20s, 40s, 80s)
- Purpose: Resume from last agent response on restart (handles crashes gracefully)
- Pattern: Store `lastAgentTimestamp` per group JID, recover from `getLastBotMessageTimestamp()` if missing
- Guarantee: Never re-processes messages; cursor only advances forward
## Entry Points
- Location: `src/index.ts` main module
- Triggers: `npm run dev` or `node dist/index.js`
- Responsibilities:
- Polls `getNewMessages()` every 2 seconds
- Groups messages by JID
- Checks trigger pattern or `requiresTrigger` flag
- Calls `runContainerAgent()` to execute agent
- Updates `lastAgentTimestamp` and routes response back
- Polls `getDueTasks()` every 60 seconds
- For each task, calls `enqueueTask()` (respects queue)
- Updates `next_run` via `computeNextRun()` after execution
- Logs results to `task_run_logs`
- Polls `/workspace/ipc/{groupFolder}/` every 1 second
- Processes messages: reads JSON, checks authorization, sends via channel
- Processes tasks: reads JSON, creates task via `createTask()`, triggers scheduler
- Removes files after processing
- One active session per orchestrator (singleton)
- Spawns `claude code` CLI in session to return URL to user
- Persists PID to disk for restoration on restart
- Optional: agents can request remote control via IPC
## Error Handling
- **Message processing:** On error, log and continue (don't block queue)
- **Container execution:** Retry up to 5 times with exponential backoff, then mark as failed
- **Database:** Transaction semantics (better-sqlite3 is synchronous, single-threaded)
- **Credentials:** Proxy startup failure is fatal (no credentials = no execution possible)
- **Mount validation:** Invalid mounts rejected at container spawn time with clear error
- **IPC authorization:** Unauthorized message attempts logged as warning, file removed to prevent retry loop
## Cross-Cutting Concerns
- Module: `src/logger.ts`
- Pattern: Contextual logs with `{ key: value }` objects
- Levels: debug, info, warn, error
- Group folders: `src/group-folder.ts` (name + path traversal)
- Mounts: `src/mount-security.ts` (allowlist + blocked patterns)
- Credentials: `src/credential-proxy.ts` (env file loading)
- Trigger patterns: `src/config.ts` (regex escaping)
- Host → Container: Credential proxy (no credentials passed)
- Container → Agent SDK: Proxy injects API key or OAuth token
- Main group vs others: IPC authorization check (main can send anywhere, others only to own JID)
- Sender allowlist: Optional per-chat/sender filtering via `src/sender-allowlist.ts`
- Module: `src/timezone.ts`
- Pattern: IANA timezone validation, used for cron parsing and message timestamps
- Default: System timezone or UTC
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
