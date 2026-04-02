# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Event-driven distributed system with isolated container execution and message-based coupling.

**Key Characteristics:**
- Single Node.js orchestrator process managing multiple concurrent containers
- Channel abstraction (WhatsApp, Slack, Telegram, Discord, Gmail) self-registering at startup
- Each group runs in an isolated Docker container with sandboxed filesystem and no direct credential access
- Asynchronous message queue managing concurrent container execution and task scheduling
- SQLite persistence for messages, group metadata, and scheduled tasks
- IPC-based message passing between orchestrator and container agents
- Credential proxy layer injecting secrets at runtime (never exposing to containers)

## Layers

**Orchestrator (Host):**
- Purpose: Single source of truth for router state, message queue, task scheduling, container lifecycle
- Location: `src/index.ts` (main loop), `src/container-runner.ts` (invocation), `src/group-queue.ts` (concurrency)
- Contains: Channel management, router state, session management, group registration
- Depends on: SQLite database, file system, channel SDKs
- Used by: CLI, IPC watcher (agent messages), scheduler (cron tasks)

**Channel Layer:**
- Purpose: Unified interface for messaging platforms (WhatsApp, Slack, Telegram, Discord, Gmail)
- Location: `src/channels/` (registry), implementation files self-register
- Contains: Channel adapters implementing `Channel` interface, message formatting
- Depends on: Platform SDKs (Slack Bolt, etc.), router for outbound messages
- Used by: Orchestrator's message loop and metadata sync

**Container Runtime:**
- Purpose: Isolated execution environment for Claude Agent SDK and skills
- Location: `container/agent-runner/src/index.ts` (agent runner), `container/Dockerfile` (image)
- Contains: Agent SDK integration, IPC reader, session management, skill loading
- Depends on: Claude Agent SDK, Anthropic API (via credential proxy)
- Used by: Orchestrator spawns containers via `runContainerAgent()`

**Credential Proxy:**
- Purpose: Inject credentials at request time without exposing them to containers
- Location: `src/credential-proxy.ts`
- Contains: HTTP reverse proxy, auth mode detection (API key vs OAuth)
- Depends on: HTTP/HTTPS for upstream Anthropic API
- Used by: Containers connect to proxy instead of API directly

**Database Layer:**
- Purpose: Persistent storage of messages, sessions, groups, tasks
- Location: `src/db.ts`
- Contains: SQLite schema, queries for messages/sessions/groups/tasks/state
- Depends on: better-sqlite3
- Used by: All components (state recovery, message history, group discovery)

**Task Scheduler:**
- Purpose: Cron and interval-based task execution
- Location: `src/task-scheduler.ts`
- Contains: Cron parsing, next-run computation, due-task detection, per-group queuing
- Depends on: Group queue, database for task definitions, container runner
- Used by: Main loop polling at SCHEDULER_POLL_INTERVAL (60s)

**Group Queue (Concurrency Control):**
- Purpose: Fair scheduling across groups within MAX_CONCURRENT_CONTAINERS limit
- Location: `src/group-queue.ts`
- Contains: Per-group state (active, pending messages/tasks), retry logic with exponential backoff, drain strategy
- Depends on: Container runner, database
- Used by: Main message loop, task scheduler, IPC watcher

**IPC Watcher:**
- Purpose: Process outbound messages and task creation from inside containers
- Location: `src/ipc.ts`
- Contains: File-based IPC reader for `/workspace/ipc/{groupFolder}/messages` and `/workspace/ipc/{groupFolder}/tasks`
- Depends on: Router (send messages), database (create tasks), container runner
- Used by: Background watcher polling at IPC_POLL_INTERVAL (1s)

**Mount Security:**
- Purpose: Prevent containers from accessing sensitive host paths
- Location: `src/mount-security.ts`
- Contains: Allowlist validation, blocked pattern matching, external config loading
- Depends on: `~/.config/nanoclaw/mount-allowlist.json` (external to project)
- Used by: Container runner when building mount list

**Group Folder Management:**
- Purpose: Validate group folder identities and resolve safe paths
- Location: `src/group-folder.ts`
- Contains: Folder name validation (alphanumeric + `-_`, max 64 chars), path traversal prevention
- Depends on: None (pure validation)
- Used by: All path resolution (group dirs, IPC dirs, sessions dirs)

## Data Flow

**Inbound Message Flow:**

1. Channel receives message from platform → calls `onMessage` callback
2. Message stored in SQLite via `storeMessage()`
3. `enqueueMessageCheck(groupJid)` adds group to queue if not active
4. When slot available, `runContainerAgent()` invokes container with latest messages
5. Container processes and calls agent SDK
6. Container outputs result via stdout (wrapped in markers)
7. Result parsed, extracted, stored in `last_agent_timestamp` for cursor recovery

**Outbound Message Flow (from Container):**

1. Container writes to `/workspace/ipc/{groupFolder}/messages/{timestamp}.json`
2. IPC watcher polls and reads file
3. Authorization check: main group can send anywhere, other groups only to their own JID
4. `router.routeOutbound()` sends via appropriate channel
5. Message stored in database marked as `is_bot_message=1`

**Task Scheduling Flow:**

1. Scheduler polls due tasks every 60 seconds via `getDueTasks()`
2. For each due task, `enqueueTask()` queues it (respecting concurrency limit)
3. When slot available, container runs with `isScheduledTask=true`
4. Task result logged via `logTaskRun()` and next run computed
5. Group can also create tasks via IPC (from containers calling `/claw`-style commands)

**State Management:**

1. **Router state:** Last message cursor (`last_timestamp`), per-group agent timestamps (`last_agent_timestamp`)
   - Saved to `router_state` table on every change
   - Recovered on startup via `loadState()`
   - Per-group cursor recovered from last bot message timestamp if missing

2. **Sessions:** One session ID per group folder
   - Stored in `sessions` table
   - Persisted in container data directory at `/workspace/sessions/{groupFolder}/`
   - Retrieved via `getSessions()` for container invocation

3. **Registered Groups:** Mapping of JID → metadata (name, folder, trigger, containerConfig)
   - Stored in `registered_groups` table
   - Validated on registration (folder must be valid)
   - Used for authorization (IPC auth, trigger matching)

## Key Abstractions

**Channel Interface (`src/types.ts`):**
- Purpose: Uniform API for platform integration
- Examples: `src/channels/slack.ts` (Slack Bolt implementation)
- Pattern: Self-registering factory via `registerChannel()`, instantiated in `channels/index.ts`
- Callbacks: `onMessage` (inbound), `onChatMetadata` (discovery)

**Group Identity:**
- Purpose: Anchor all state to group folder (messages, sessions, IPC)
- Examples: `main`, `slack_main`, `global`
- Pattern: Validated via `isValidGroupFolder()`, resolved via `resolveGroupFolderPath()`
- Isolation: Each group has isolated `groups/{folder}`, `data/ipc/{folder}`, `data/sessions/{folder}`

**ContainerInput/ContainerOutput:**
- Purpose: Typed contract between orchestrator and container agent
- Pattern: Serialized as JSON via stdin, results via stdout markers
- Fields: prompt, sessionId, groupFolder, chatJid, isMain, containerConfig timeout

**GroupQueue State Machine:**
- Purpose: Track per-group lifecycle across concurrent execution
- States: `active`, `idleWaiting`, `isTaskContainer`, `pendingMessages`, `pendingTasks`
- Retry: Up to 5 retries with exponential backoff (5s, 10s, 20s, 40s, 80s)

**Message Cursor Recovery:**
- Purpose: Resume from last agent response on restart (handles crashes gracefully)
- Pattern: Store `lastAgentTimestamp` per group JID, recover from `getLastBotMessageTimestamp()` if missing
- Guarantee: Never re-processes messages; cursor only advances forward

## Entry Points

**Startup (`src/index.ts`):**
- Location: `src/index.ts` main module
- Triggers: `npm run dev` or `node dist/index.js`
- Responsibilities:
  1. Initialize database schema
  2. Start credential proxy
  3. Ensure container runtime is running
  4. Load state from database
  5. Register and connect channels
  6. Start message loop polling at POLL_INTERVAL (2s)
  7. Start scheduler loop at SCHEDULER_POLL_INTERVAL (60s)
  8. Start IPC watcher polling at IPC_POLL_INTERVAL (1s)

**Message Loop (`src/index.ts` - `processMessages()`):**
- Polls `getNewMessages()` every 2 seconds
- Groups messages by JID
- Checks trigger pattern or `requiresTrigger` flag
- Calls `runContainerAgent()` to execute agent
- Updates `lastAgentTimestamp` and routes response back

**Scheduler Loop (`src/task-scheduler.ts` - `startSchedulerLoop()`):**
- Polls `getDueTasks()` every 60 seconds
- For each task, calls `enqueueTask()` (respects queue)
- Updates `next_run` via `computeNextRun()` after execution
- Logs results to `task_run_logs`

**IPC Watcher (`src/ipc.ts` - `startIpcWatcher()`):**
- Polls `/workspace/ipc/{groupFolder}/` every 1 second
- Processes messages: reads JSON, checks authorization, sends via channel
- Processes tasks: reads JSON, creates task via `createTask()`, triggers scheduler
- Removes files after processing

**Remote Control (`src/remote-control.ts`):**
- One active session per orchestrator (singleton)
- Spawns `claude code` CLI in session to return URL to user
- Persists PID to disk for restoration on restart
- Optional: agents can request remote control via IPC

## Error Handling

**Strategy:** Graceful degradation, structured logging, retry with backoff

**Patterns:**

- **Message processing:** On error, log and continue (don't block queue)
- **Container execution:** Retry up to 5 times with exponential backoff, then mark as failed
- **Database:** Transaction semantics (better-sqlite3 is synchronous, single-threaded)
- **Credentials:** Proxy startup failure is fatal (no credentials = no execution possible)
- **Mount validation:** Invalid mounts rejected at container spawn time with clear error
- **IPC authorization:** Unauthorized message attempts logged as warning, file removed to prevent retry loop

**Logging:** Structured logs to stderr with `logger` module (pino-style), includes context (JID, taskId, err)

## Cross-Cutting Concerns

**Logging:** 
- Module: `src/logger.ts`
- Pattern: Contextual logs with `{ key: value }` objects
- Levels: debug, info, warn, error

**Validation:**
- Group folders: `src/group-folder.ts` (name + path traversal)
- Mounts: `src/mount-security.ts` (allowlist + blocked patterns)
- Credentials: `src/credential-proxy.ts` (env file loading)
- Trigger patterns: `src/config.ts` (regex escaping)

**Authentication:**
- Host → Container: Credential proxy (no credentials passed)
- Container → Agent SDK: Proxy injects API key or OAuth token
- Main group vs others: IPC authorization check (main can send anywhere, others only to own JID)
- Sender allowlist: Optional per-chat/sender filtering via `src/sender-allowlist.ts`

**Timezone:**
- Module: `src/timezone.ts`
- Pattern: IANA timezone validation, used for cron parsing and message timestamps
- Default: System timezone or UTC

---

*Architecture analysis: 2026-04-02*
