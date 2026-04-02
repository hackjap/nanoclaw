# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- kebab-case with hyphens: `container-runner.ts`, `group-queue.ts`, `sender-allowlist.ts`
- Test files use `.test.ts` suffix alongside implementation: `db.test.ts`, `container-runner.test.ts`
- Barrel files (re-exports) use `index.ts`: `src/channels/index.ts`

**Functions:**
- camelCase for all functions, both exported and internal: `getMessagesSince`, `storeMessage`, `validateAdditionalMounts`, `buildTriggerPattern`
- Private helper functions without leading underscore; only @internal JSDoc comment for test-only exports: `_initTestDatabase`, `_closeDatabase`, `_resetSchedulerLoopForTests`
- Predicate functions use `is`/`has`/`should` prefix: `isValidGroupFolder`, `isSenderAllowed`, `shouldDropMessage`, `isConnected`, `ownsJid`

**Variables:**
- camelCase for all variable declarations: `lastTimestamp`, `registeredGroups`, `messageLoopRunning`, `maxConcurrent`
- Database column names use snake_case (in schema only): `chat_jid`, `sender_name`, `is_from_me`, `is_bot_message`, `created_at`
- Constants use UPPER_SNAKE_CASE: `ASSISTANT_NAME`, `GROUPS_DIR`, `POLL_INTERVAL`, `MAX_MESSAGES_PER_PROMPT`, `CONTAINER_IMAGE`, `DEFAULT_TRIGGER`
- Configuration exports from `config.ts` are UPPER_SNAKE_CASE: `TRIGGER_PATTERN`, `TIMEZONE`, `CREDENTIAL_PROXY_PORT`

**Types & Interfaces:**
- PascalCase for all types and interfaces: `Channel`, `NewMessage`, `RegisteredGroup`, `ScheduledTask`, `ContainerConfig`, `MountAllowlist`
- Type aliases use PascalCase: `ChannelFactory`, `OnInboundMessage`, `OnChatMetadata`
- Discriminated union types for status fields: `'active' | 'paused' | 'completed'` for task status, `'success' | 'error'` for task run status

**Classes:**
- PascalCase: `SlackChannel`, `GroupQueue`
- Implement interfaces with explicit `implements Channel` declaration: `export class SlackChannel implements Channel`

## Code Style

**Formatting:**
- Prettier with `singleQuote: true` enforces single quotes throughout
- Run `npm run format` or `npm run format:fix` to auto-format all TypeScript files
- Check compliance with `npm run format:check`

**Linting:**
- ESLint with TypeScript support enabled via `eslint.config.js`
- Key rules enforced:
  - `@typescript-eslint/no-unused-vars` with strict settings: all unused args/errors trigger error; use `_` prefix to suppress
  - `@typescript-eslint/no-explicit-any` warns (not error) to allow gradual typing
  - `no-catch-all/no-catch-all` warns when catch-all error handlers exist (prefer specific error handling)
  - `preserve-caught-error` requires catch block to have explicit error parameter (no empty catches)
- Run `npm run lint` or `npm run lint:fix` to check/fix issues

**Imports:**
- Ordered by:
  1. Node.js built-ins: `import fs from 'fs'`, `import path from 'path'`
  2. External packages: `import Database from 'better-sqlite3'`, `import { App } from '@slack/bolt'`
  3. Local absolute imports with `.js` extension (ES modules): `import { ASSISTANT_NAME } from './config.js'`
  4. Empty line, then types: `import type { GenericMessageEvent } from '@slack/types'`
- Always include `.js` extension in relative imports (required for ES modules in Node.js): `from './db.js'`, `from '../router.js'`
- No path aliases configured; use relative imports

## Error Handling

**Patterns:**
- Most errors logged and caught, NOT re-thrown: `catch (err) { logger.error({ err }, 'message') }`
- JSON.parse failures caught with `catch (err: unknown)` and recovered: `{ ... } catch (err: unknown) { logger.warn(...); return {}; }`
- Database migration failures (ALTER TABLE) caught and silently ignored: `try { database.exec(...) } catch { /* column already exists */ }`
- Async operations use `.catch((err) => logger.error(...))` for fire-and-forget handler registration
- Container process failures logged but not propagated; errors written to logs/db instead
- No throw statements for expected conditions (validation errors, missing data); return empty results or null

**Specific patterns from codebase:**
- `src/db.ts` migrations use silent catch: lines 88-94 catch ALTER TABLE errors
- `src/index.ts` recovers from corrupted state: line 82-87 JSON.parse with fallback
- `src/group-queue.ts` catches process errors: lines 221, 249
- `src/container-runner.ts` captures process stderr/stdout and logs results
- `src/channels/slack.ts` wraps API calls: lines 140-144, 172-185, 219-243

## Logging

**Framework:** Custom logger in `src/logger.ts`

**API:**
- `logger.debug(data | string, msg?)` - detailed diagnostics
- `logger.info(data | string, msg?)` - key events
- `logger.warn(data | string, msg?)` - recoverable issues
- `logger.error(data | string, msg?)` - errors (not fatal)
- `logger.fatal(data | string, msg?)` - unrecoverable; exits process

**Usage patterns:**
- String-only for simple messages: `logger.info('State loaded')`
- Object + message for structured data: `logger.info({ groupCount: 5 }, 'State loaded')`
- Pass errors as `err` field: `logger.error({ err }, 'Failed to start container')`
- All outputs include timestamp, level color, process ID, and location

**Levels:**
- File: `src/logger.ts` lines 1-73
- Threshold controlled by `LOG_LEVEL` env var (default: 'info')
- stdout for debug/info, stderr for warn/error/fatal

## Comments

**When to Comment:**
- JSDoc for public exports (functions, interfaces, classes)
- Inline comments for non-obvious logic, workarounds, or recovery paths
- Block comments (`/* */`) for migration/schema notes in db.ts

**JSDoc/TSDoc patterns:**
- `/** Public function description */` for exported functions
- `/** @internal - for tests only. */` for test-only exports like `_initTestDatabase`
- `/** Returns CLI args for ... */` for utility functions
- No `@param` or `@return` tags used; rely on TypeScript types for clarity

**Examples from codebase:**
- `src/db.ts:162` - `@internal` marker for test function
- `src/container-runtime.ts:11-14` - JSDoc for exported constants
- `src/index.ts:96-99` - Multi-line comment explaining cursor recovery logic
- `src/db.ts:87-94` - Inline comment explaining migration strategy

## Function Design

**Size:** No hard limits; functions range from 10 to 200+ lines

**Parameters:**
- Most functions take 1-3 simple parameters (string, object, callback)
- Complex configurations passed as interfaces: `ContainerConfig`, `ScheduledTask`
- Callbacks registered at initialization: `queue.setProcessMessagesFn(fn)` rather than passed to every call

**Return Values:**
- Functions return data directly or null/undefined: `getTaskById(id)` returns `ScheduledTask | undefined`
- Async functions return `Promise<void>` for side-effects: `connect(): Promise<void>`
- Query functions return arrays: `getAllChats()` returns `ChatInfo[]` (never null)
- Predicates return boolean: `isSenderAllowed(jid, sender)` returns boolean

## Module Design

**Exports:**
- Mix of function exports and class exports
- Constants exported at module level: `ASSISTANT_NAME`, `POLL_INTERVAL` from `config.ts`
- Interfaces exported alongside implementations: `NewMessage`, `Channel`, `RegisteredGroup` in `types.ts`
- Factory functions exported: `getChannelFactory()` returns `ChannelFactory | undefined`

**Barrel Files:**
- `src/channels/index.ts` re-exports nothing; only imports side-effect modules: `import './slack.js'`
- Forces explicit imports for actual usage: `import { SlackChannel } from './channels/slack.js'`

**File Organization:**
- One class per file: `SlackChannel` in `channels/slack.ts`, `GroupQueue` in `group-queue.ts`
- Utility functions grouped by domain: all DB operations in `db.ts`, all formatting in `router.ts`
- Types centralized in `types.ts` and imported everywhere needed
- Config centralized in `config.ts` and imported throughout

---

*Convention analysis: 2026-04-02*
