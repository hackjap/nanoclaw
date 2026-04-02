# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

**Silent Error Handling in Async Operations:**
- Issue: Multiple `.catch()` handlers log errors but don't prevent retry attempts or halt execution. Failed operations silently suppress errors while state may be partially updated.
- Files: `src/group-queue.ts` (lines 85, 127, 294-299, 305-310, 329-334, 336-340), `src/index.ts` (lines 482-484, 597-599)
- Impact: Silently dropped errors could mask critical failures (e.g., failed message sends, container launch failures). Retry logic may not trigger properly if errors aren't propagated.
- Fix approach: Convert error-logging `.catch()` handlers to proper error propagation. Use `throw` or return error status codes instead of silent suppression. Consider error severity levels to determine retry vs. fail-fast behavior.

**In-Memory State Without Persistence Guarantees:**
- Issue: `lastAgentTimestamp` and `sessions` are loaded from database at startup, modified in-memory, and saved via `setRouterState()`/`setSession()`. Race conditions exist between cursor advancement and error handling.
- Files: `src/index.ts` (lines 70-73, 80-90, 232-235, 301, 476-478)
- Impact: If process crashes between advancing cursor and saving, messages could be re-processed, causing duplicates. If error occurs after save but before user notification, cursor may be too far ahead.
- Fix approach: Use transactional database writes to guarantee cursor and state atomicity. Consider write-ahead logging for cursor positions before processing starts.

**Shallow Error Handling in Task Processing:**
- Issue: IPC task processing catches JSON parse errors but still renames files to error directory. No retry mechanism for malformed tasks.
- Files: `src/ipc.ts` (lines 75-108, 126-142)
- Impact: Malformed task files are moved to `errors/` directory but never retried. If a legitimate task fails to parse due to temporary corruption, it's lost.
- Fix approach: Implement a separate "quarantine" directory with timestamp metadata. Periodically scan quarantine for parseable tasks before discarding.

**Missing Error Logging in File Operations:**
- Issue: `src/group-queue.ts` sendMessage and closeStdin use try-catch with silent failure (`return false`, `catch { // ignore }`).
- Files: `src/group-queue.ts` (lines 175-177, 190-193)
- Impact: File write failures (permissions, disk full, path issues) are silently dropped. No visibility into why messages fail to pipe to containers.
- Fix approach: Log all file operation failures with context (path, errno, group info). Consider exponential backoff retry for transient errors.

## Known Bugs

**Container Timeout Logic Race Condition:**
- Symptoms: Container may exit cleanly but `timedOut` flag causes timeout behavior to be applied. Conversely, timeout may fire before graceful shutdown completes.
- Files: `src/container-runner.ts` (lines 413-443, 445-494)
- Trigger: Containers that finish exactly at the timeout boundary, or when `stopContainer()` call takes longer than expected
- Details: The `timedOut` flag is set by `killOnTimeout()` closure. The `container.on('close')` handler checks this flag, but there's no synchronization between the timeout firing and the container actually closing. If timeout fires at 30s and graceful shutdown takes 2s, the handler might still see `timedOut=true` even though the container exited normally.
- Workaround: Disable custom timeout config for groups that need longer runs; use CONTAINER_TIMEOUT constant instead
- Fix approach: Record timeout firing timestamp and compare actual exit time; only treat as true timeout if exit occurs significantly after the timeout threshold

**Message Cursor Rollback Race with Streaming Output:**
- Symptoms: Agent sends output, then errors. Cursor is not rolled back (as intended). But if a second agent run starts before output is fully processed by channels, duplicate messages could be sent.
- Files: `src/index.ts` (lines 290-308)
- Trigger: High-latency channel send operations (e.g., WhatsApp API delays) combined with rapid re-triggering of message processing
- Details: The check for `outputSentToUser` is a boolean flag set when `channel.sendMessage()` is called. But `channel.sendMessage()` is async and may not complete before error occurs. If the channel buffer is still writing when error processing happens, the flag is true but data hasn't reached the user yet.
- Workaround: Monitor logs for "Agent error after output was sent" warnings; if duplicates appear, manually advance cursor in database
- Fix approach: Track sent message promises and await them before treating output as "sent to user"

**IPC File Parse Errors Not Distinguished from Unauthorized Access:**
- Symptoms: Tasks that fail authorization and tasks that fail to parse both end up in the same `errors/` directory
- Files: `src/ipc.ts` (lines 97-108, 131-142)
- Trigger: Inspect `ipc/errors/` directory; see mix of intentionally-blocked and truly-corrupted files
- Impact: Difficult to debug authorization issues; corrupted data mixes with security events
- Fix approach: Create separate `errors/auth/` and `errors/corrupt/` subdirectories; log authorization failures with different severity

## Security Considerations

**Mount Allowlist File Caching Without Reload:**
- Risk: Mount allowlist is cached at process startup and never reloaded. Operator cannot add new mounts without restarting the process.
- Files: `src/mount-security.ts` (lines 16-18, 48-114)
- Current mitigation: Allowlist is stored outside project root (prevents agent modification). Temporary caching warning is logged once.
- Recommendations: Implement periodic reload (e.g., every 5 min or on-demand via IPC). Add file watcher to detect changes. Store reload timestamp in cache for debugging.

**Credential Proxy OAuth Token Replacement Logic:**
- Risk: OAuth token is injected into Authorization header only when container sends one. Post-exchange requests use x-api-key. But if container has stale OAuth token in cache, it could send both headers, and proxy logic may not handle it correctly.
- Files: `src/credential-proxy.ts` (lines 65-80)
- Current mitigation: Headers are explicitly deleted (`delete headers['authorization']`) before injecting real token. x-api-key mode doesn't send Authorization header.
- Recommendations: Add validation that Authorization and x-api-key are never both present in the same request. Log mismatched auth modes. Consider a token versioning scheme to prevent mixing old and new credentials.

**Container Path Validation Allows Relative Paths:**
- Risk: `containerPath` validation in `validateMount()` allows relative paths like `../../../etc/passwd` because it only checks for `..` at the top level, not after path normalization.
- Files: `src/mount-security.ts` (lines 197-219, 248)
- Current mitigation: Container paths are prefixed with `/workspace/extra/`, preventing escape to root. Read-only mode enforced for non-main groups.
- Recommendations: Normalize paths with `path.normalize()` before checking; reject any path containing `..` after normalization. Add unit tests for path traversal attempts.

**Group Folder Validation Insufficient for Special Filenames:**
- Risk: `isValidGroupFolder()` may not block certain dangerous names that could cause issues on different OSes or with symlink attacks.
- Files: `src/ipc.ts` (lines 437-442), group folder validation in `src/group-folder.ts` (not fully examined)
- Current mitigation: Folder path is resolved and must be under `groups/` directory.
- Recommendations: Whitelist alphanumeric + hyphen + underscore. Reject `.`, `..`, and special OS names (`CON`, `PRN`, etc. on Windows). Validate after symlink resolution.

**Sender Allowlist Silently Falls Back to Defaults:**
- Risk: If sender allowlist config is corrupted, system falls back to `allow: '*'` mode, allowing any sender. No alert is triggered.
- Files: `src/sender-allowlist.ts` (lines 33-89)
- Current mitigation: Warning is logged to application logger (not user-facing).
- Recommendations: Add a critical security flag to indicate fallback mode. Consider blocking all messages if config is corrupt (fail-closed instead of fail-open). Send an IPC alert to main group.

## Performance Bottlenecks

**Unbounded Message History in Memory:**
- Problem: `getMessagesSince()` retrieves all messages from `MAX_MESSAGES_PER_PROMPT` cap, but if that cap is set high or messages accumulate quickly, memory usage could spike.
- Files: `src/index.ts` (lines 207-212, 461-466), `src/db.ts` (message queries)
- Cause: No streaming/pagination for message retrieval; all rows are loaded into memory at once
- Current limit: `MAX_MESSAGES_PER_PROMPT` (defined in `src/config.ts`, default likely 100-500)
- Improvement path: Implement lazy-loaded message iterator. Process messages in chunks to database instead of all-in-memory concat. Add metrics to track largest payloads.

**IPC File System Polling:**
- Problem: `IPC_POLL_INTERVAL` (line 6, 50, 150) uses polling with `fs.readdirSync()` for every group folder on every interval. N groups = N directory scans + file reads.
- Files: `src/ipc.ts` (lines 40-151)
- Cause: No file system watcher; relies on interval-based polling
- Current impact: At 2000ms interval with 20 groups = 20 scans/10 sec. Scales poorly beyond 50+ groups
- Improvement path: Use `fs.watch()` or native file watchers (FSEvents on macOS, inotify on Linux). Fall back to polling if watchers are unavailable.

**Database Indices Missing for Common Queries:**
- Problem: `getMessagesSince()`, `getNewMessages()` filter by timestamp and chat_jid but only `timestamp` has an index.
- Files: `src/db.ts` (lines 38), message query functions
- Cause: Schema created in `createSchema()` only adds `idx_timestamp`; no composite index for (chat_jid, timestamp)
- Improvement path: Add composite index `CREATE INDEX idx_chat_timestamp ON messages(chat_jid, timestamp)`. Measure query times before/after.

**Mount Validation Symlink Resolution on Every Container Spawn:**
- Problem: `getRealPath()` (line 134-140) is called for every additional mount during every container spawn, potentially resolving symlinks multiple times.
- Files: `src/mount-security.ts` (lines 171-192, 233-329)
- Cause: No caching of resolved paths; allowlist itself is cached but mount paths aren't
- Improvement path: Cache resolved paths in the allowlist loader. TTL-based invalidation (5-10 min) to handle dynamic mounts.

## Fragile Areas

**Message Loop State Synchronization:**
- Files: `src/index.ts` (lines 70-120, 395-496)
- Why fragile: `lastTimestamp`, `lastAgentTimestamp`, and `sessions` are in-memory global state. Multiple concurrent message loop iterations could race. The message loop is a single `while(true)` that polls at `POLL_INTERVAL`. If polling is slow or database queries block, multiple iterations could advance the same cursor twice.
- Safe modification: Refactor into a proper state machine with explicit state transitions. Use database transactions for cursor updates. Add logging of state transitions for debugging.
- Test coverage: `src/index.test.ts` not found in file list; message loop logic is not tested
- Risk level: **HIGH** — corruption of message cursors leads to duplicates or missed messages

**Container Output Streaming Parser:**
- Files: `src/container-runner.ts` (lines 339-389)
- Why fragile: Parses JSON from unbounded stream buffer using string slicing and marker search. If markers appear in user output or JSON escaping is incorrect, parser state becomes invalid.
- Safe modification: Use a proper streaming JSON parser library (e.g., `JSONStream`, `ndjson`). Add length prefix instead of markers. Validate JSON before adding to parse buffer.
- Test coverage: `src/container-runner.test.ts` exists (224 lines); unclear if streaming parser is tested
- Risk level: **MEDIUM** — malformed output causes container to timeout instead of failing cleanly

**Task Scheduling with Cron Expression Parsing:**
- Files: `src/task-scheduler.ts` (lines 217-250, 373-391), `src/ipc.ts` (lines 217-250)
- Why fragile: Cron expressions are parsed and stored as strings. If cron-parser library version changes or timezone config changes, next_run calculations diverge.
- Safe modification: Add schema migration to recompute next_run for all cron tasks when timezone changes. Store cron parsing version in database. Add unit tests for cron edge cases (DST transitions, leap seconds).
- Test coverage: `src/task-scheduler.ts` has tests (284 lines in test file mentioned). Cron-specific tests unclear.
- Risk level: **MEDIUM** — tasks drift in schedule, causing missed runs or bunching

**Group Folder Path Resolution with Symlinks:**
- Files: `src/group-folder.ts` (not fully examined), `src/container-runner.ts` (lines 65-67), `src/mount-security.ts` (lines 119-140)
- Why fragile: Folder paths can be symlinks. Real path resolution happens at container spawn time but IPC directory is created based on `group.folder` string. If symlink is removed/changed, IPC files may be written to wrong location.
- Safe modification: Resolve group folder paths at registration time, store resolved path in database. Use resolved path for all filesystem operations.
- Test coverage: `src/group-folder.test.ts` (141 lines). Mount-security has tests (419 lines).
- Risk level: **MEDIUM** — IPC messages lost if symlinks change mid-operation

## Scaling Limits

**Concurrent Container Limit:**
- Current capacity: `MAX_CONCURRENT_CONTAINERS` (defined in `src/config.ts`, default likely 4-10)
- Limit: Beyond this, messages and tasks queue indefinitely. No backpressure or user notification.
- Files: `src/group-queue.ts` (lines 5, 73-83, 114-124, 321-322), `src/config.ts`
- Scaling path: Make limit configurable per deployment. Add metrics for queue depth. Implement priority queue for tasks vs. messages. Consider load-shedding strategy (drop old messages vs. delay tasks).

**Single SQLite Database:**
- Current capacity: SQLite is single-writer, multiple-reader. Concurrent writes block. With 100+ groups, database lock contention becomes significant.
- Limit: Transaction throughput plateaus around 100-200 writes/sec depending on disk speed
- Files: `src/db.ts`, `src/index.ts` (saveState calls)
- Scaling path: (Long-term) Migrate to PostgreSQL or use SQLite with WAL mode and statement queuing. (Short-term) Batch state updates; call `saveState()` less frequently.

**IPC File System Polling:**
- Current capacity: Scales with number of groups × number of files. At 50 groups with 10 pending messages each = 500 files polled every 2 sec
- Limit: File system scan time grows linearly; at 1000+ files, polling becomes a bottleneck
- Files: `src/ipc.ts` (lines 40-151)
- Scaling path: Replace polling with file system watchers (see Performance Bottlenecks section)

**Container Session Storage:**
- Current capacity: Each group's `.claude/` session directory stores agent state. Large conversations accumulate on disk.
- Limit: No cleanup; session directories can grow to GB+ with long-running groups
- Files: `src/container-runner.ts` (lines 117-165)
- Scaling path: Implement session archiving. Prune old session files after N days or Z MB. Add telemetry for session directory sizes.

## Dependencies at Risk

**CronExpressionParser (cron-parser):**
- Risk: Single library for all cron scheduling. No fallback if parsing fails at schedule time.
- Impact: Invalid cron expressions block task execution and can cause cascading errors
- Current mitigation: Try-catch blocks return default 60-second interval on parse failure (line 46-51 in task-scheduler.ts)
- Migration plan: Add configuration for allowed cron expressions (whitelist). Fall back to simple interval-based scheduling if cron is unavailable. Document supported cron syntax.

**better-sqlite3:**
- Risk: Native module; breaks on Node version upgrades or during cross-platform builds
- Impact: Database initialization fails; entire system cannot start
- Current mitigation: Pre-compiled bindings in npm package; requires rebuild on platform change
- Migration plan: Consider SQL.js (pure JS) as fallback for platforms without native support. Add startup check for database connectivity with fallback mode.

**OneCLI Credential Proxy:**
- Risk: Credentials are managed by external OneCLI gateway. If OneCLI is misconfigured or unavailable, credential injection fails silently.
- Impact: Containers get placeholder credentials and fail with unhelpful errors
- Current mitigation: Credential proxy locally validates auth mode and injects placeholders
- Migration plan: Add health check endpoint for credential proxy. Fail fast at startup if proxy unreachable. Implement in-process credential cache as emergency fallback (with warnings).

## Missing Critical Features

**No Built-In Message Deduplication:**
- Problem: If cursor rollback and network delays collide, duplicates are sent to user. Only manual detection post-hoc.
- Blocks: Reliable message delivery; audit trails; compliance requirements
- Suggested approach: Add message ID cache with TTL (24 hours). Check before sending to channel. Log suppressed duplicates.

**No Automatic Crash Recovery for Running Containers:**
- Problem: If host process crashes while containers are running, containers are orphaned. They're cleaned up by `--rm` flag, but context is lost.
- Blocks: High-availability deployments; long-running tasks
- Suggested approach: Persist container name + group mapping before spawn. On startup, query for orphaned containers. Resume or gracefully terminate them.

**No Rate Limiting or Backpressure Mechanism:**
- Problem: If a channel floods messages (e.g., bot loop), all containers are consumed immediately. No way to throttle.
- Blocks: Protection against DoS; stable under load
- Suggested approach: Per-group and per-channel rate limiters. Drop messages exceeding threshold. Alert operator.

**No Message Encryption at Rest:**
- Problem: Messages are stored in plain SQLite. Sensitive user data is readable by file access.
- Blocks: Privacy; compliance (GDPR, CCPA)
- Suggested approach: Use SQLCipher or encrypt message content column. Store encryption key in environment (managed by OneCLI). Add migration script.

## Test Coverage Gaps

**Message Loop Core Logic Not Tested:**
- What's not tested: `startMessageLoop()`, `processGroupMessages()`, cursor recovery, retry logic with backoff
- Files: `src/index.ts` (lines 195-311, 395-496)
- Risk: Regressions in core message handling go undetected until production
- Priority: **CRITICAL** — This is the most complex state machine in the codebase

**Container Output Streaming Parser:**
- What's not tested: Partial JSON chunks, markers embedded in output, missing END marker, large outputs
- Files: `src/container-runner.ts` (lines 339-389)
- Risk: Parser silently fails; output is lost or malformed
- Priority: **HIGH** — Affects all agent communication

**IPC Authorization and Task Validation:**
- What's not tested: Cross-group task submission blocking, malformed task files, concurrent task processing
- Files: `src/ipc.ts` (lines 157-467)
- Risk: Privilege escalation; data corruption
- Priority: **HIGH** — Security-critical

**Mount Allowlist Validation:**
- What's not tested: Symlink attacks, path traversal with `../` patterns, relative paths escaping `/workspace/extra/`
- Files: `src/mount-security.ts` (lines 196-219, 232-329)
- Risk: Container breakout; host file system access
- Priority: **CRITICAL** — Security boundary

**Concurrent Container Queue Logic:**
- What's not tested: Race conditions in `drainGroup()`, task + message interleaving, queue saturation behavior
- Files: `src/group-queue.ts` (lines 286-345)
- Risk: Deadlocks, stuck tasks, message loss
- Priority: **HIGH** — Complex concurrent state machine

---

*Concerns audit: 2026-04-02*
