---
phase: 03-jira-client-draft-persistence
plan: 01
subsystem: api
tags: [jira, jira.js, adf, rest-api, error-handling]

requires:
  - phase: 01-thread-aware-slack-infrastructure
    provides: thread_ts in message pipeline for draft keying
provides:
  - Jira client singleton with createJiraIssue() function
  - ADF text-to-document converter for Jira descriptions
  - Error classification with Korean user messages (auth/api/network)
  - JIRA_PROJECT_KEY config export
affects: [03-02, 04-interactive-approval-flow]

tech-stack:
  added: [jira.js@5.3.1]
  patterns: [lazy singleton client initialization, 3-tier error classification]

key-files:
  created: [src/jira-client.ts, src/jira-client.test.ts]
  modified: [src/config.ts, package.json, package-lock.json]

key-decisions:
  - "Lazy singleton for Version3Client -- initialized on first call, not at module load, to handle startup before .env is available"
  - "HttpException.status property used directly for error classification instead of cause?.response?.status chain"
  - "textToAdf exported for test access; _resetClient exported with @internal tag for test isolation"

patterns-established:
  - "Jira client pattern: lazy singleton + readEnvFile for credentials, never hardcoded"
  - "Error classification pattern: 3-tier (auth/api/network) with Korean user messages"
  - "ADF builder pattern: split on double-newline, filter empty, wrap in doc/paragraph/text nodes"

requirements-completed: [JIRA-01, JIRA-02, JIRA-03, ERRH-01]

duration: 4min
completed: 2026-04-02
---

# Phase 3 Plan 1: Jira Client & ADF Builder Summary

**Jira REST API v3 client using jira.js with ADF description builder, 3-tier Korean error classification, and single network retry**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-02T13:46:40Z
- **Completed:** 2026-04-02T13:50:27Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Jira client module creates issues via Version3Client with project key, summary, issue type, and ADF description
- Plain text to ADF conversion produces valid doc/paragraph/text structure with version: 1
- Error classification returns distinct Korean messages for auth (401/403), API (400/500), and network errors
- Network errors get exactly 1 automatic retry; auth/API errors return immediately

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Jira client module with ADF builder and error classification**
   - `19223c4` (test: add failing tests - TDD RED)
   - `d192339` (feat: implement jira-client.ts, update config.ts - TDD GREEN)

## Files Created/Modified
- `src/jira-client.ts` - Jira client singleton, textToAdf, classifyError, createJiraIssue exports
- `src/jira-client.test.ts` - 14 unit tests covering ADF, error classification, and issue creation
- `src/config.ts` - Added JIRA_PROJECT_KEY export via readEnvFile
- `package.json` - Added jira.js@5.3.1 dependency
- `package-lock.json` - Lock file updated

## Decisions Made
- Used lazy singleton for Version3Client to avoid initialization before .env is available
- Used HttpException.status directly (verified via runtime inspection) instead of cause?.response?.status chain from plan
- Exported textToAdf directly (not with underscore prefix) since tests need it and it may be useful externally
- Class-based mock for Version3Client in tests (vi.fn().mockImplementation didn't work as constructor)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HttpException status access pattern**
- **Found during:** Task 1 (implementation)
- **Issue:** Plan specified `err.cause?.response?.status` but jira.js HttpException has `status` as a direct property
- **Fix:** Used `(err as HttpException & { status?: number }).status` for type-safe direct access
- **Files modified:** src/jira-client.ts
- **Verification:** All classifyError tests pass with correct category assignment
- **Committed in:** d192339

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor API surface difference, no scope creep.

## Issues Encountered
- vi.fn().mockImplementation() doesn't work as class constructor mock in vitest -- switched to class-based mock pattern

## User Setup Required
None - no external service configuration required. Jira credentials (JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY) must be in .env at runtime.

## Next Phase Readiness
- Jira client ready for Phase 3 Plan 2 (draft persistence in SQLite, IPC wiring)
- createJiraIssue ready for Phase 4 (approval flow calls it on button click)
- JIRA_PROJECT_KEY config ready for use

## Known Stubs
None - all functions are fully implemented with no placeholder data.

---
*Phase: 03-jira-client-draft-persistence*
*Completed: 2026-04-02*
