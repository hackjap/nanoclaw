# Phase 3: Jira Client & Draft Persistence - Research

**Researched:** 2026-04-02
**Domain:** Jira REST API v3 integration, SQLite draft persistence, ADF format, credential management
**Confidence:** HIGH

## Summary

This phase adds two core capabilities: (1) a Jira client module that creates issues via the Jira REST API v3 using the `jira.js` library, and (2) SQLite-based draft persistence so that draft data from containers survives process restarts and is available for asynchronous button clicks in Phase 4.

The codebase already has well-established patterns for every integration point. The credential proxy (`credential-proxy.ts`) reads secrets from `.env` via `readEnvFile()`. The database (`db.ts`) uses `CREATE TABLE IF NOT EXISTS` with `ALTER TABLE` migration guards. The IPC watcher (`ipc.ts`) already polls `actions/` directories and currently logs-then-deletes files -- Phase 3 replaces that stub with actual draft persistence. The container agent already emits `jira_draft` JSON via `submit_jira_draft` MCP tool.

**Primary recommendation:** Follow existing module patterns exactly. Create `src/jira-client.ts` as a self-contained module (like `credential-proxy.ts`), add `jira_drafts` table in `db.ts` with standard migration pattern, and wire the IPC actions handler to persist drafts. Keep Jira credential management in the orchestrator only -- containers never touch Jira directly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** jira.js library for Jira REST API v3 calls. Type safety and ADF support built in.
- **D-02:** Jira credentials (host, email, API token) managed through credential proxy extension. Same pattern as Anthropic API proxy -- read from .env.
- **D-03:** Project key via `JIRA_PROJECT_KEY` env var. v1 fixed project, simplest approach.
- **D-04:** Jira client code in `src/jira-client.ts` single module. Consistent with db.ts, credential-proxy.ts pattern.
- **D-05:** ADF conversion via manual builder function. Simple paragraph node wrapping, no external dependency.
- **D-06:** Simple text-to-paragraph ADF conversion. Agent collects plain text, no complex formatting needed.
- **D-07:** ADF builder as internal helper in jira-client.ts. ADF is only used for Jira issue creation.
- **D-08:** `jira_drafts` SQLite table. thread_ts PK, chat_jid, draft JSON, status, timestamps.
- **D-09:** Draft keyed by thread_ts. One draft per thread.
- **D-10:** 7-day TTL expiry policy, cleanup is manual/cron. v1 keeps it simple.
- **D-11:** status field for state management (draft -> approved -> created -> expired). Phase 4 uses state transitions.
- **D-12:** Concise Korean error messages -- "Jira 이슈 생성에 실패했습니다: {cause}" format. Consistent with Phase 2 tone.
- **D-13:** 3-tier error classification: auth failure, API error (400/404/500), network error. Different user messages per category.
- **D-14:** No retry for v1 simplicity. Network errors get 1 automatic retry only.
- **D-15:** Draft preserved on error. Phase 4 enables retry.

### Claude's Discretion
- jira.js client initialization pattern (singleton vs per-request)
- Credential proxy extension specifics (separate port vs same proxy path)
- jira_drafts table migration strategy (existing db.ts createSchema pattern)
- IPC actions/ polling to draft save connection flow
- Test strategy (unit tests, mocking scope)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| JIRA-01 | jira.js를 통해 Jira REST API v3로 고정 프로젝트에 이슈를 생성한다 | jira.js v5.3.1 Version3Client, `client.issues.createIssue()` API verified |
| JIRA-02 | 이슈 설명을 ADF(Atlassian Document Format)로 변환하여 전송한다 | ADF doc/paragraph/text node structure documented, manual builder sufficient |
| JIRA-03 | Jira 크리덴셜(host, email, API token, project key)을 .env/credential proxy로 관리한다 | Existing `readEnvFile()` pattern in env.ts, credential-proxy.ts as reference |
| DRFT-05 | 초안 데이터를 SQLite에 저장하여 비동기 버튼 클릭에 대응한다 | db.ts schema/migration pattern, jira_drafts table design with thread_ts PK |
| ERRH-01 | Jira API 실패 시 스레드에 사용자 친화적 에러 메시지를 표시한다 | jira.js HttpException + AxiosError error hierarchy, 3-tier classification |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jira.js | 5.3.1 | Jira REST API v3 client | Full TypeScript types, Version3Client for cloud API, HttpException for structured errors |
| better-sqlite3 | 11.10.0 | Draft persistence (jira_drafts table) | Already in project, synchronous API, existing patterns in db.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @slack/bolt | 4.3.0 | Error message delivery to threads | Already in project; use `sendMessage` with `thread_ts` for error posting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jira.js | Raw fetch to Jira REST API | Loses type safety, ADF type definitions, error parsing. Decision D-01 locks jira.js |
| Manual ADF builder | @atlaskit/adf-utils | Massive dependency for simple paragraph wrapping. Decision D-05 locks manual builder |

**Installation:**
```bash
npm install jira.js@5.3.1
```

**Version verification:** jira.js 5.3.1 confirmed via `npm view jira.js version` on 2026-04-02.

## Architecture Patterns

### Recommended Module Structure
```
src/
  jira-client.ts       # NEW: Jira client init, createJiraIssue(), ADF builder
  db.ts                # MODIFY: Add jira_drafts table + CRUD functions
  types.ts             # MODIFY: Add JiraDraft interface
  ipc.ts               # MODIFY: Replace actions/ stub with draft persistence handler
  config.ts            # MODIFY: Add JIRA_PROJECT_KEY export
  env.ts               # Reference only (readEnvFile pattern)
  credential-proxy.ts  # Reference only (credential reading pattern)
```

### Pattern 1: Jira Client as Singleton Module
**What:** Initialize `Version3Client` once at module load, export functions that use it. Same pattern as the db module (module-level `db` variable, functions operate on it).
**When to use:** For all Jira API calls from the orchestrator.
**Recommendation:** Singleton. Jira client has no per-request state. Initialize lazily on first call to handle startup before .env is read.

```typescript
// src/jira-client.ts
import { Version3Client, HttpException } from 'jira.js';
import type { AxiosError } from 'axios';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

let client: Version3Client | null = null;

function getClient(): Version3Client {
  if (!client) {
    const secrets = readEnvFile(['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
    if (!secrets.JIRA_HOST || !secrets.JIRA_EMAIL || !secrets.JIRA_API_TOKEN) {
      throw new Error('Jira credentials not configured in .env');
    }
    client = new Version3Client({
      host: secrets.JIRA_HOST,
      authentication: {
        basic: {
          email: secrets.JIRA_EMAIL,
          apiToken: secrets.JIRA_API_TOKEN,
        },
      },
    });
  }
  return client;
}
```

### Pattern 2: ADF Builder as Internal Helper
**What:** Simple function that wraps plain text into ADF document structure.
**When to use:** When creating Jira issues with description field.

```typescript
// Internal to jira-client.ts
interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
}

function textToAdf(text: string): AdfDocument {
  const paragraphs = text.split('\n\n').filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((para) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para }],
    })),
  };
}
```

### Pattern 3: Draft Persistence via db.ts
**What:** Add `jira_drafts` table using existing `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` migration pattern.
**When to use:** All draft CRUD operations.

```typescript
// In db.ts createSchema()
database.exec(`
  CREATE TABLE IF NOT EXISTS jira_drafts (
    thread_ts TEXT PRIMARY KEY,
    chat_jid TEXT NOT NULL,
    draft TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jira_drafts_status ON jira_drafts(status);
  CREATE INDEX IF NOT EXISTS idx_jira_drafts_chat ON jira_drafts(chat_jid);
`);
```

### Pattern 4: Error Classification
**What:** Classify Jira API errors into 3 tiers with Korean user messages.
**When to use:** All Jira API call error paths.

```typescript
export interface JiraError {
  category: 'auth' | 'api' | 'network';
  userMessage: string;
  details: string;
}

function classifyError(err: unknown): JiraError {
  if (err instanceof HttpException) {
    const status = err.cause?.response?.status;
    if (status === 401 || status === 403) {
      return {
        category: 'auth',
        userMessage: 'Jira 인증에 실패했습니다. 관리자에게 문의해주세요.',
        details: err.message,
      };
    }
    return {
      category: 'api',
      userMessage: `Jira 이슈 생성에 실패했습니다: ${err.message}`,
      details: `HTTP ${status}: ${err.message}`,
    };
  }
  // AxiosError or generic network error
  return {
    category: 'network',
    userMessage: 'Jira 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    details: err instanceof Error ? err.message : String(err),
  };
}
```

### Pattern 5: IPC Actions Handler Integration
**What:** Replace the current log-and-delete stub in ipc.ts actions/ handler with actual draft persistence.
**When to use:** When IPC action file with `type: 'jira_draft'` is received.

The current code at `ipc.ts` line 162-167:
```typescript
// Phase 2: log and remove. Phase 3/4 will add domain-specific handlers.
fs.unlinkSync(filePath);
```

Phase 3 replaces this with:
```typescript
if (data.type === 'jira_draft') {
  saveDraft(data.thread_ts, data.chatJid, data.draft);
  logger.info({ thread_ts: data.thread_ts, sourceGroup }, 'Jira draft saved');
}
```

### Anti-Patterns to Avoid
- **Jira credentials in containers:** Containers NEVER call Jira directly. Only the orchestrator has Jira credentials.
- **Complex ADF transformation:** Do not build a full ADF parser/serializer. Plain text to paragraphs is sufficient for v1.
- **Retry logic complexity:** Decision D-14 explicitly says no retry except 1 automatic retry for network errors only.
- **Draft cleanup automation:** Decision D-10 says manual/cron cleanup for v1. Do not implement automated expiry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Jira REST API client | HTTP fetch wrapper | jira.js Version3Client | Type-safe, handles pagination, auth, error parsing |
| Jira API error parsing | Manual status code handling | jira.js HttpException | Structured error with response details |
| SQLite operations | Raw SQL string building | better-sqlite3 prepared statements | Existing pattern in db.ts, SQL injection prevention |

**Key insight:** The entire Jira integration is straightforward because jira.js handles all the API complexity. The real work is wiring it into NanoClaw's existing patterns (IPC -> db -> Jira client).

## Common Pitfalls

### Pitfall 1: Jira Host URL Format
**What goes wrong:** jira.js expects `https://your-domain.atlassian.net` without trailing slash. Users may include `/rest/api/3` or trailing slashes.
**Why it happens:** Inconsistent URL formats in documentation and user input.
**How to avoid:** Normalize the host URL -- strip trailing slashes, validate it starts with `https://`.
**Warning signs:** 404 errors on all Jira API calls.

### Pitfall 2: ADF Version Field
**What goes wrong:** Jira API rejects the description if the ADF `version` field is missing or wrong.
**Why it happens:** ADF requires `version: 1` at the document root. Easy to forget.
**How to avoid:** Always include `version: 1` in the ADF document object. The `textToAdf` helper ensures this.
**Warning signs:** 400 error with "Invalid ADF" message.

### Pitfall 3: Issue Type Name Case Sensitivity
**What goes wrong:** Jira issue type names are case-sensitive. "bug" fails, "Bug" works.
**Why it happens:** Container agent sends issueType as enum (`Bug`/`Task`/`Story`), but if the Jira project has different type names, creation fails.
**How to avoid:** Use the exact names from the Jira project configuration. The agent's MCP tool already enforces the enum.
**Warning signs:** 400 error mentioning invalid issue type.

### Pitfall 4: thread_ts as Primary Key
**What goes wrong:** Slack thread_ts values look like `"1234567890.123456"` -- they are strings, not numbers. Treating them as numbers loses precision.
**Why it happens:** They look like floating-point numbers but have more decimal precision than float64.
**How to avoid:** Always store as TEXT in SQLite (already the plan). Never parse as number.
**Warning signs:** Duplicate key errors or failed lookups.

### Pitfall 5: Credential Proxy vs Direct Credential Reading
**What goes wrong:** Confusion about whether Jira calls go through the HTTP credential proxy or read credentials directly.
**Why it happens:** The existing credential proxy is an HTTP reverse proxy for the Anthropic API, which containers connect to. Jira calls are made by the orchestrator itself.
**How to avoid:** The orchestrator reads Jira credentials directly from `.env` via `readEnvFile()`. The HTTP credential proxy is for containers only. Jira client lives in the orchestrator process, not in containers.
**Warning signs:** Trying to route Jira API calls through the HTTP proxy.

### Pitfall 6: jira.js HttpException Import
**What goes wrong:** HttpException is exported from jira.js root, not from a sub-path.
**Why it happens:** Library structure may not be obvious.
**How to avoid:** `import { Version3Client, HttpException } from 'jira.js'`
**Warning signs:** Import errors at compile time.

## Code Examples

### Creating a Jira Issue (Complete Flow)
```typescript
// Source: jira.js README + Atlassian ADF docs
import { Version3Client, HttpException } from 'jira.js';

const client = new Version3Client({
  host: 'https://your-domain.atlassian.net',
  authentication: {
    basic: {
      email: 'user@example.com',
      apiToken: 'your-api-token',
    },
  },
});

const result = await client.issues.createIssue({
  fields: {
    project: { key: 'PROJ' },
    summary: 'Issue Title',
    issuetype: { name: 'Task' },
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Issue description here.' }],
        },
      ],
    },
  },
});

// result.key = 'PROJ-123', result.self = URL to issue
```

### Draft JSON from Container (Actual Format)
```typescript
// From container/agent-runner/src/ipc-mcp-stdio.ts line 78-87
// This is what the orchestrator receives from the actions/ IPC directory
{
  type: 'jira_draft',
  chatJid: 'slack:C1234567890',
  thread_ts: '1712000000.000100',
  draft: {
    title: '로그인 페이지 500 에러',
    description: '사용자가 로그인 시도 시 500 Internal Server Error 발생...',
    issueType: 'Bug'
  }
}
```

### Draft Table CRUD Functions
```typescript
// Following existing db.ts patterns
export interface JiraDraft {
  thread_ts: string;
  chat_jid: string;
  draft: string; // JSON string of { title, description, issueType }
  status: 'draft' | 'approved' | 'created' | 'expired';
  created_at: string;
  updated_at: string;
}

export function saveDraft(threadTs: string, chatJid: string, draft: object): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jira_drafts (thread_ts, chat_jid, draft, status, created_at, updated_at)
    VALUES (?, ?, ?, 'draft', ?, ?)
    ON CONFLICT(thread_ts) DO UPDATE SET
      draft = excluded.draft,
      status = 'draft',
      updated_at = excluded.updated_at
  `).run(threadTs, chatJid, JSON.stringify(draft), now, now);
}

export function getDraft(threadTs: string): JiraDraft | undefined {
  return db.prepare('SELECT * FROM jira_drafts WHERE thread_ts = ?')
    .get(threadTs) as JiraDraft | undefined;
}

export function updateDraftStatus(
  threadTs: string,
  status: JiraDraft['status'],
): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE jira_drafts SET status = ?, updated_at = ? WHERE thread_ts = ?')
    .run(status, now, threadTs);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jira.js v4 (CommonJS) | jira.js v5 (ESM + CJS dual) | 2025 | v5 has better tree-shaking, updated types |
| Jira REST API v2 | Jira REST API v3 | 2023+ | v3 uses ADF for rich text instead of wiki markup |
| Wiki markup descriptions | ADF JSON descriptions | v3 default | Must send ADF, not plain text or wiki |

**Deprecated/outdated:**
- Jira REST API v2 wiki markup: Still works but v3 is the current standard, and jira.js Version3Client targets v3.
- `jira-client` npm package: Unmaintained since 2020. Use `jira.js` instead.

## Open Questions

1. **jira.js HttpException axios dependency**
   - What we know: jira.js uses axios internally and exports HttpException. Error handling references AxiosError.
   - What's unclear: Whether axios types need to be installed separately as devDependency for `instanceof AxiosError` checks.
   - Recommendation: Import AxiosError type from `axios` if needed, but since jira.js bundles axios, it should be available. Verify at implementation time. Alternatively, use duck-typing on the error's `code` property for network errors instead of `instanceof AxiosError`.

2. **Jira project issue type names**
   - What we know: Agent MCP tool enforces `Bug`/`Task`/`Story` enum.
   - What's unclear: Whether the target Jira project uses exactly these names.
   - Recommendation: Document that `JIRA_PROJECT_KEY` project must have these issue types. This is a setup/configuration concern, not a code concern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/jira-client.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| JIRA-01 | Creates Jira issue with correct fields via Version3Client | unit (mocked client) | `npx vitest run src/jira-client.test.ts -x` | Wave 0 |
| JIRA-02 | ADF conversion produces valid doc/paragraph/text structure | unit | `npx vitest run src/jira-client.test.ts -x` | Wave 0 |
| JIRA-03 | Jira credentials read from .env via readEnvFile, never hardcoded | unit (mock env) | `npx vitest run src/jira-client.test.ts -x` | Wave 0 |
| DRFT-05 | Draft saved to SQLite, survives restart, keyed by thread_ts | unit (in-memory db) | `npx vitest run src/db.test.ts -x` | Extend existing |
| ERRH-01 | Error classification produces correct Korean messages per category | unit | `npx vitest run src/jira-client.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/jira-client.test.ts src/db.test.ts -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/jira-client.test.ts` -- covers JIRA-01, JIRA-02, JIRA-03, ERRH-01
- [ ] `src/db.test.ts` additions -- covers DRFT-05 (extend existing file with jira_drafts tests)

## Sources

### Primary (HIGH confidence)
- npm registry: `jira.js@5.3.1` -- version verified via `npm view jira.js version`
- [jira.js GitHub README](https://github.com/MrRefactoring/jira.js/blob/master/README.md) -- Version3Client init, createIssue API, HttpException error handling
- [Atlassian ADF Structure](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) -- doc/paragraph/text node hierarchy
- Project source code: `src/db.ts`, `src/credential-proxy.ts`, `src/ipc.ts`, `src/env.ts`, `src/types.ts`, `container/agent-runner/src/ipc-mcp-stdio.ts` -- existing patterns verified by reading

### Secondary (MEDIUM confidence)
- [jira.js npm page](https://www.npmjs.com/package/jira.js) -- package metadata, description

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- jira.js verified via npm registry, locked by D-01
- Architecture: HIGH -- all integration points exist in codebase, patterns are established
- Pitfalls: HIGH -- based on direct code reading and official documentation
- Error handling: MEDIUM -- HttpException API structure from README, AxiosError availability needs implementation-time verification

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable domain, 30-day validity)
