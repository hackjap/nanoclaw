# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- Vitest 4.0.18
- Config: `vitest.config.ts` at project root
- Includes test files matching `src/**/*.test.ts` and `setup/**/*.test.ts`

**Assertion Library:**
- Vitest's built-in `expect` (compatible with Jest)

**Run Commands:**
```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode for development
npm run test -- --coverage  # Coverage report (if configured)
```

## Test File Organization

**Location:**
- Co-located with implementation: `src/db.ts` has `src/db.test.ts` in same directory
- One test file per source module, with same base name

**Naming:**
- Pattern: `{module}.test.ts`
- Examples: `db.test.ts`, `container-runner.test.ts`, `group-queue.test.ts`, `slack.test.ts`

**Structure:**
```
src/
├── db.ts
├── db.test.ts
├── container-runner.ts
├── container-runner.test.ts
├── group-queue.ts
├── group-queue.test.ts
└── ... (other modules with .test.ts pairs)
```

## Test Structure

**Suite Organization:**
```typescript
// src/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { _initTestDatabase, storeMessage, getMessages } from './db.js';

beforeEach(() => {
  _initTestDatabase();
});

describe('storeMessage', () => {
  it('stores a message and retrieves it', () => {
    // arrange
    storeMessage({ ... });
    
    // act
    const messages = getMessages(...);
    
    // assert
    expect(messages).toHaveLength(1);
  });
});
```

**Patterns:**
- `describe()` blocks group related tests by function
- `beforeEach()` resets test database: `_initTestDatabase()` creates fresh in-memory SQLite
- `afterEach()` cleans up: `vi.useRealTimers()` after fake timers, mock reset
- One assertion per test (mostly); multiple related assertions ok in same test
- Test names describe behavior, not implementation: `'stores a message and retrieves it'` not `'calls storeMessage'`

**Setup/Teardown:**
- Database tests: `beforeEach(() => _initTestDatabase())`
- Timer tests: `beforeEach(() => vi.useFakeTimers())` and `afterEach(() => vi.useRealTimers())`
- Mock cleanup: `afterEach(() => vi.clearAllMocks())` implicitly done by Vitest between tests

## Mocking

**Framework:** Vitest's `vi` utility for all mocking

**Patterns:**
```typescript
// Mock a module entirely
vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test-data',
  MAX_CONCURRENT_CONTAINERS: 2,
}));

// Mock specific functions
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      writeFileSync: vi.fn(),
    },
  };
});

// Use fake timers
vi.useFakeTimers();
await vi.advanceTimersByTimeAsync(5000);
vi.useRealTimers();

// Create mock functions
const mockFn = vi.fn(async (arg) => arg + 1);
await mockFn('test');
expect(mockFn).toHaveBeenCalledWith('test');
```

**What to Mock:**
- External dependencies: `fs`, `child_process` (file I/O and subprocess control)
- Configuration modules: `config.js` (change test behavior)
- Cross-module dependencies: `logger.js`, `db.js` when testing in isolation
- Platform calls: Container runtime, file operations

**What NOT to Mock:**
- Types and interfaces (no mocking needed; they're compile-time only)
- Internal utility functions (e.g., `escapeXml`, `getTriggerPattern` — test the real implementation)
- Database operations in DB tests (use `_initTestDatabase()` with real in-memory DB instead)

## Fixtures and Factories

**Test Data:**
```typescript
// src/formatting.test.ts
function makeMsg(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: '1',
    chat_jid: 'group@g.us',
    sender: '123@s.whatsapp.net',
    sender_name: 'Alice',
    content: 'hello',
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Usage in tests
const msg = makeMsg({ content: 'custom' });
```

**Pattern:**
- Factory functions with overrides parameter
- Default values for all required fields
- Spread overrides to allow customization

**Location:**
- Defined in test file itself (top-level before tests)
- No separate fixture directory; factories inline with tests

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
npm run test -- --coverage  # If configured
```

**Current gaps (from code inspection):**
- Error paths in container process handling (captured but not extensively tested)
- Slack API error recovery paths have mocked tests but some edge cases untested
- Mount security validation has tests but permission edge cases not all covered

## Test Types

**Unit Tests:**
- Scope: Single function or class method
- Approach: Mock dependencies, test behavior in isolation
- Examples: `db.test.ts` tests `storeMessage`, `getMessages`, `createTask` individually
- Strategy: Use in-memory DB, mocked fs, mocked logger

**Integration Tests:**
- Scope: Multiple functions working together
- Approach: Real in-memory database, mocked external I/O
- Examples: `group-queue.test.ts` tests queue orchestration with real timers/concurrency
- Strategy: `vi.useFakeTimers()` to control timing, mock fs but real queue logic

**E2E Tests:**
- Framework: Not used in this codebase
- Reasoning: NanoClaw is an agent orchestrator; E2E would require running actual containers and messaging platforms

## Common Patterns

**Async Testing:**
```typescript
// From src/group-queue.test.ts
it('retries with exponential backoff on failure', async () => {
  let callCount = 0;
  const processMessages = vi.fn(async () => {
    callCount++;
    return false; // failure
  });

  queue.setProcessMessagesFn(processMessages);
  queue.enqueueMessageCheck('group1@g.us');

  // First call happens immediately
  await vi.advanceTimersByTimeAsync(10);
  expect(callCount).toBe(1);

  // First retry after 5000ms
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(10);
  expect(callCount).toBe(2);
});
```

**Error Testing:**
```typescript
// From src/db.test.ts
it('handles corrupted state gracefully', () => {
  // Set corrupted state in DB
  setRouterState('last_agent_timestamp', 'not-valid-json');
  
  // Attempt recovery
  const result = getRouterState('last_agent_timestamp');
  
  // Should return default or empty without throwing
  expect(result).toBeDefined();
});
```

**Mock Assertion:**
```typescript
// From src/group-queue.test.ts
const processMessages = vi.fn(async () => true);
queue.setProcessMessagesFn(processMessages);
queue.enqueueMessageCheck('group1@g.us');

expect(processMessages).toHaveBeenCalledWith('group1@g.us');
expect(processMessages).toHaveBeenCalledTimes(1);
```

**Timer Control (Fake Timers):**
```typescript
// From src/task-scheduler.test.ts
beforeEach(() => {
  _initTestDatabase();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('schedules task at correct time', async () => {
  createTask({ ... });
  
  // Advance 60 seconds
  await vi.advanceTimersByTimeAsync(60000);
  
  // Task should have run
  expect(taskExecuted).toBe(true);
});
```

## Key Test Files & Coverage

**Core database:** `src/db.test.ts` (80+ lines)
- Tests: message storage, retrieval, task CRUD, router state, sessions
- Approach: Fresh in-memory DB per test via `beforeEach`

**Group queue:** `src/group-queue.test.ts` (485 lines)
- Tests: Concurrency limits, task prioritization, idle preemption, retry backoff
- Approach: Fake timers + mock process I/O
- Coverage: Complex queuing logic, idempotency, state transitions

**Container runner:** `src/container-runner.test.ts` (60+ lines partial read)
- Tests: Output parsing, container lifecycle, mocks
- Approach: Mocked Docker/container runtime, mocked fs

**Formatting:** `src/formatting.test.ts` (80+ lines)
- Tests: XML escaping, message formatting, internal tag stripping
- Approach: Unit tests with simple assertions, no mocks

**Task scheduler:** `src/task-scheduler.test.ts` (80+ lines)
- Tests: Task scheduling, cron evaluation, next-run computation
- Approach: Fake timers, mocked DB

**Channels:** `src/channels/slack.test.ts` (85+ lines) + `src/channels/registry.test.ts`
- Tests: Slack API integration, message routing, event handling
- Approach: Mocked Slack SDK, mocked DB

---

*Testing analysis: 2026-04-02*
