# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```
nanoclaw/
├── src/                           # Main orchestrator (Node.js process)
│   ├── index.ts                   # Main loop: channels, message processing, task scheduling
│   ├── types.ts                   # Type definitions (Channel, NewMessage, RegisteredGroup, etc.)
│   ├── config.ts                  # Configuration loading (.env, defaults, paths)
│   ├── router.ts                  # Message formatting and routing
│   ├── logger.ts                  # Structured logging
│   ├── db.ts                      # SQLite operations (messages, sessions, tasks)
│   ├── container-runner.ts        # Spawn containers, parse output, manage IPC
│   ├── container-runtime.ts       # Docker abstraction (mount, stop, cleanup)
│   ├── credential-proxy.ts        # HTTP proxy for Anthropic API (secret injection)
│   ├── group-queue.ts             # Per-group concurrency control and retry logic
│   ├── group-folder.ts            # Group folder validation and path resolution
│   ├── ipc.ts                     # IPC watcher (process agent messages/tasks)
│   ├── task-scheduler.ts          # Cron/interval task execution
│   ├── timezone.ts                # IANA timezone validation
│   ├── mount-security.ts          # Mount allowlist validation
│   ├── sender-allowlist.ts        # Per-chat/sender message filtering
│   ├── remote-control.ts          # Claude Code CLI session management
│   ├── env.ts                     # Env file parsing utility
│   └── channels/                  # Platform integrations (self-registering)
│       ├── index.ts               # Channel loading/registration
│       ├── registry.ts            # ChannelFactory registry
│       ├── slack.ts               # Slack Bolt implementation
│       └── *.ts                   # Other channel implementations
├── container/                     # Container image and agent runner
│   ├── Dockerfile                 # Multi-layer build (Node 22, Chromium, dependencies)
│   ├── build.sh                   # Build script with Docker buildkit
│   ├── agent-runner/              # Agent execution in container
│   │   ├── src/
│   │   │   ├── index.ts           # Main: stdin→SDK→IPC loop
│   │   │   └── ipc-mcp-stdio.ts   # MCP stdio transport for agent communication
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── skills/                    # Skills loaded in container at runtime
│       ├── agent-browser/         # Browser automation skill
│       ├── capabilities/          # SDK capabilities/tools
│       └── slack-formatting/      # Slack-specific formatting
├── groups/                        # Per-group memory and configuration
│   ├── global/                    # Shared memory (read-only for non-main)
│   │   └── CLAUDE.md              # Global instructions template
│   ├── main/                      # Main control group
│   │   └── CLAUDE.md              # Main group instructions
│   └── {groupName}/               # Other groups (Slack, Telegram, etc.)
│       ├── CLAUDE.md              # Group-specific instructions
│       └── logs/                  # Group execution logs
├── data/                          # Runtime data (git-ignored)
│   ├── env/                       # Env file cache
│   ├── ipc/                       # IPC message exchange
│   │   └── {groupFolder}/         # Per-group IPC
│   │       ├── input/             # Messages from container
│   │       ├── messages/          # Inbound messages to send
│   │       └── tasks/             # Task creation from container
│   ├── sessions/                  # Claude session data
│   │   └── {groupFolder}/         # Per-group sessions
│   └── store.db                   # SQLite database (messages, state, tasks)
├── dist/                          # Compiled output (gitignore)
├── setup/                         # Installation scripts
│   └── index.ts                   # Setup wizard
├── .claude/                       # Claude Code configuration (OMC)
│   ├── skills/                    # Feature skills (branches)
│   ├── commands/gsd/              # Get-Shit-Done command defs
│   ├── projects/                  # Per-project memory
│   └── hooks/                     # Custom hooks
├── .planning/                     # Planning artifacts (OMC)
│   └── codebase/                  # This file + ARCHITECTURE.md
├── docs/                          # Documentation
├── config-examples/               # Example config files
├── repo-tokens/                   # Token examples for setup
├── tsconfig.json                  # TypeScript config
├── vitest.config.ts               # Vitest unit test config
├── eslint.config.js               # ESLint rules
├── package.json                   # Dependencies, scripts
└── CLAUDE.md                      # Project context for Claude

```

## Directory Purposes

**src/**
- Purpose: Orchestrator application code
- Contains: Channels, routing, database, container execution, scheduling
- Key files: `index.ts` (main), `db.ts` (persistence), `container-runner.ts` (execution)

**container/**
- Purpose: Docker image and isolated agent execution
- Contains: Dockerfile, agent-runner, container skills
- Key files: `Dockerfile` (build recipe), `agent-runner/src/index.ts` (in-container runner)

**groups/**
- Purpose: Per-group persistent memory and configuration
- Contains: CLAUDE.md templates, group logs
- Key files: `main/CLAUDE.md` (main group instructions), `global/CLAUDE.md` (shared defaults)

**data/**
- Purpose: Runtime ephemeral state (never committed)
- Contains: IPC, sessions, database
- Key files: `store.db` (SQLite), `ipc/{groupFolder}/` (message passing)

**dist/**
- Purpose: Compiled JavaScript (generated, git-ignored)
- Contains: Transpiled src/ files
- Generated by: `npm run build` (tsc)

**setup/**
- Purpose: First-time installation and configuration
- Contains: Interactive setup wizard
- Invoked by: `npm run setup`

**.claude/**
- Purpose: Oh-my-claudecode integration and skill management
- Contains: Skill definitions, project memory, custom hooks
- Key files: `skills/` (feature skills), `projects/` (per-project notes)

**.planning/**
- Purpose: OMC planning artifacts
- Contains: Codebase analysis documents
- Key files: This file (STRUCTURE.md), ARCHITECTURE.md

## Key File Locations

**Entry Points:**
- `src/index.ts`: Orchestrator main loop (startup, message processing, scheduling)
- `container/agent-runner/src/index.ts`: Agent execution in container
- `setup/index.ts`: Installation wizard

**Configuration:**
- `src/config.ts`: All config loading (env, defaults, paths)
- `.env`: Credentials and API keys (git-ignored, secret)
- `~/.config/nanoclaw/mount-allowlist.json`: Mount security config (external)
- `~/.config/nanoclaw/sender-allowlist.json`: Sender filtering (external)

**Core Logic:**
- `src/container-runner.ts`: Spawn containers, parse output, handle IPC
- `src/group-queue.ts`: Concurrency control and retry logic
- `src/router.ts`: Message formatting and outbound routing
- `src/ipc.ts`: IPC watcher (process agent messages)
- `src/task-scheduler.ts`: Cron/interval task execution

**Persistence:**
- `src/db.ts`: SQLite operations (schema, queries)
- `data/store.db`: SQLite database file
- `groups/{name}/CLAUDE.md`: Per-group instructions

**Testing:**
- `src/*.test.ts`: Unit tests (co-located with source)
- `vitest.config.ts`: Vitest runner config
- `vitest.skills.config.ts`: Skill-specific test config

## Naming Conventions

**Files:**
- `*.ts`: TypeScript source files
- `*.test.ts`: Vitest unit tests (co-located with source)
- `CLAUDE.md`: Group instructions and memory (per-group)
- `package.json`: Dependency manifests (project root, agent-runner/)
- `Dockerfile`: Container image recipe

**Directories:**
- `src/`: Orchestrator source (lowercase, no hyphens)
- `container/`: Container-related code (lowercase)
- `groups/{name}/`: Per-group folders (lowercase, alphanumeric + `-_`, max 64 chars)
- `data/{category}/`: Runtime data directories (lowercase)
- `.{name}/`: Dotfiles (`.claude`, `.github`, `.husky`, `.omc`, `.planning`)

**Functions:**
- `camelCase`: Regular functions and methods
- `PascalCase`: Classes, interfaces, types
- `SCREAMING_SNAKE_CASE`: Constants and enum values
- Prefix `is*` or `has*` for boolean checks (e.g., `isValidGroupFolder`)
- Prefix `get*` for data retrieval (e.g., `getNewMessages`)

**Types/Interfaces:**
- `Channel`: Platform integration interface
- `NewMessage`: Inbound message structure
- `RegisteredGroup`: Group metadata
- `ContainerInput/ContainerOutput`: Container IPC contract
- `ScheduledTask`: Task definition
- `GroupQueue`: Concurrency controller

## Where to Add New Code

**New Feature:**
- Primary code: `src/{feature}.ts` (create module)
- Tests: `src/{feature}.test.ts` (co-located)
- If it's a channel: `src/channels/{platform}.ts` + register in `src/channels/index.ts`
- If it's a task type: Add to `src/task-scheduler.ts`

**New Component/Module:**
- Implementation: `src/{component}.ts`
- Keep it focused on one responsibility
- Export types via `src/types.ts` if shared

**Utilities:**
- Shared helpers: `src/{utility}.ts` (e.g., `timezone.ts`, `logger.ts`)
- No circular imports (enforce with linter)

**Container Changes:**
- Agent runner logic: `container/agent-runner/src/index.ts`
- New skill: `container/skills/{skillName}/`
- Docker dependencies: Update `container/Dockerfile`

**Database Changes:**
- Schema migrations: Add to `createSchema()` in `src/db.ts`
- New queries: Add function to `src/db.ts` (keep all DB ops in one file)
- Backward compatibility: Ensure migrations handle existing rows

**Tests:**
- Unit tests: `src/*.test.ts` (vitest)
- Framework: Vitest v4 with no special runner config
- Async tests: Use `async/await` or explicit `Promise` return
- Run: `npm test` or `npm run test:watch`

## Special Directories

**data/:**
- Purpose: Runtime ephemeral state
- Generated: Yes (created on startup)
- Committed: No (git-ignored)
- Contents: SQLite database, IPC files, session data

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (by `npm run build`)
- Committed: No (git-ignored)
- Clean via: `rm -rf dist`

**node_modules/:**
- Purpose: NPM dependencies
- Generated: Yes (by `npm install`)
- Committed: No (git-ignored)
- Lockfile: `package-lock.json` (committed)

**groups/:**
- Purpose: Persistent per-group memory
- Generated: Partially (CLAUDE.md template copied on first registration)
- Committed: Yes (templates in global/main/, group data in {name}/)
- Structure: One directory per group, contains CLAUDE.md + logs/

**.claude/**
- Purpose: Oh-my-claudecode integration
- Generated: Partially (skill branches added via `/add-*` skills)
- Committed: Yes (skill defs, project memory)
- Managed by: OMC commands and agents

**.omc/**
- Purpose: OMC runtime state (sessions, notepad, plans)
- Generated: Yes (by OMC)
- Committed: No (git-ignored)
- Ephemeral: Cleared between user sessions

## File Dependency Patterns

**Imports should follow this order:**

1. Built-in Node.js modules (`fs`, `path`, `http`, etc.)
2. External packages (`@anthropic-ai/claude-agent-sdk`, `better-sqlite3`, etc.)
3. Relative imports from the same project (`./types.js`, `./config.js`)
4. Path aliases (`.js` extension required for ESM, configured in tsconfig.json)

**Example (from `src/index.ts`):**
```typescript
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, GROUPS_DIR } from './config.js';
import { startCredentialProxy } from './credential-proxy.js';
import { getChannelFactory } from './channels/registry.js';
```

**Circular dependency prevention:**
- `src/types.ts` is safe to import everywhere (no imports, only exports)
- `src/config.ts` is safe to import everywhere (no relative imports)
- `src/logger.ts` is safe to import everywhere (minimal dependencies)
- Avoid importing `src/index.ts` from elsewhere (main module, not a library)

---

*Structure analysis: 2026-04-02*
