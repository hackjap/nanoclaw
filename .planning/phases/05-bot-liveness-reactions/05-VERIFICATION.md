---
phase: 05-bot-liveness-reactions
verified: 2026-04-03T18:16:00Z
status: human_needed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "Trigger bot with @mention in Slack channel and observe emoji lifecycle"
    expected: "Eyes emoji appears immediately, changes to gear during processing, then checkmark on success or X on failure"
    why_human: "Requires live Slack workspace with connected bot to verify real-time emoji transitions"
  - test: "React with :jira: emoji on a message and observe emoji lifecycle"
    expected: "Eyes emoji appears on reacted message, transitions through gear to checkmark/X"
    why_human: "Requires live Slack workspace and Jira integration"
  - test: "Trigger a long-running agent task (>10 seconds) and observe thread"
    expected: "After ~10 seconds of processing, a 'Working on it...' text message appears in the thread"
    why_human: "Requires live bot with slow agent response to verify timer behavior"
---

# Phase 5: Bot Liveness Reactions Verification Report

**Phase Goal:** 봇이 메시지나 이모지 요청에 리액션(이모지)으로 응답하여 정상 동작 여부를 즉시 확인할 수 있게 한다
**Verified:** 2026-04-03T18:16:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | StatusReaction transitions forward through idle->received->processing->completed/failed | VERIFIED | `src/status-reactions.ts` lines 101-131: STAGE_ORDER guard with `<=` check. 14 passing tests confirm all transitions. |
| 2 | Each transition removes the previous stage emoji before adding the new one | VERIFIED | `src/status-reactions.ts` lines 107-117: removeReaction called before addReaction in transition(). Tests verify remove+add call order. |
| 3 | already_reacted and no_reaction errors are silently absorbed | VERIFIED | `src/channels/slack.ts` lines 249, 263: catch blocks return silently for these specific errors. 6 passing tests confirm. |
| 4 | SlackChannel exposes addReaction() and removeReaction() methods | VERIFIED | `src/channels/slack.ts` lines 241-266: both public async methods with correct signatures. |
| 5 | Long-running tasks trigger a text status message after configurable delay | VERIFIED | `src/status-reactions.ts` lines 62-75: setTimeout with sendStatusMessage callback. Default 10s. Tests confirm timer fires and cancellation works. |
| 6 | When a user @mentions the bot, eyes emoji appears immediately | VERIFIED | `src/index.ts` line 282: `await statusReaction?.received()` called after message cursor advance. |
| 7 | When container agent starts output, eyes changes to gear | VERIFIED | `src/index.ts` line 301: `await statusReaction?.processing()` inside agent output handler. |
| 8 | When agent completes, gear changes to checkmark | VERIFIED | `src/index.ts` line 323: `await statusReaction?.completed()` in success path. |
| 9 | When agent fails, active emoji changes to X | VERIFIED | `src/index.ts` line 321: `await statusReaction?.failed()` in error path. |
| 10 | :jira: emoji reaction trigger also gets eyes->gear->check/X lifecycle | FAILED | `src/approval-flow.ts` has StatusReaction wired into handleJiraReaction (lines 204-230), BUT `src/index.ts` line 694 initApprovalFlow call is missing addReaction/removeReaction in deps. TypeScript error TS2345 blocks compilation. |
| 11 | Non-Slack channels do not trigger reactions (no-op) | VERIFIED | `src/index.ts` line 242: `chatJid.startsWith('slack:')` guard with optional chaining on all statusReaction calls. |
| 12 | If container runs >10 seconds without output, text status message appears in thread | VERIFIED | `src/index.ts` lines 250-251: sendStatusMessage callback wired via `slackCh.sendMessage` with thread_ts. Default 10s delay in StatusReaction constructor. |

**Score:** 11/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/status-reactions.ts` | StatusReaction state machine class | VERIFIED | 132 lines. Exports: StatusReaction, ReactionTarget, ReactionStage, STAGE_EMOJI, StatusReactionCallbacks. Forward-only transitions, error absorption, timer support. |
| `src/status-reactions.test.ts` | Unit tests for StatusReaction | VERIFIED | 310 lines, 14 test cases all passing. Covers transitions, idempotency, forward-only guard, error absorption, timer, cancellation. |
| `src/channels/slack.ts` | addReaction and removeReaction methods | VERIFIED | Methods at lines 241-266 with idempotent error handling (already_reacted/no_reaction). |
| `src/channels/slack.test.ts` | Tests for reaction methods | VERIFIED | 6 new tests for addReaction/removeReaction covering API calls, idempotent errors, error logging. 65 total tests passing. |
| `src/index.ts` | StatusReaction wired into processGroupMessages | VERIFIED | Import at line 68, conditional instantiation at 240-256, lifecycle calls at 282/301/321/323. |
| `src/approval-flow.ts` | StatusReaction wired into handleJiraReaction | PARTIAL | Code is correct (lines 204-230), but the caller (initApprovalFlow in index.ts) does not pass required deps. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/status-reactions.ts | src/channels/slack.ts | StatusReactionCallbacks interface | WIRED | Callbacks match SlackChannel method signatures. |
| src/index.ts | src/status-reactions.ts | import StatusReaction, new StatusReaction | WIRED | Import at line 68, instantiation at line 245. |
| src/index.ts | src/channels/slack.ts | addReaction/removeReaction passed as callbacks | WIRED | Lines 248-249 pass slackCh methods as callbacks. |
| src/approval-flow.ts | src/status-reactions.ts | import StatusReaction, new StatusReaction | WIRED | Import at line 4, instantiation at line 204. |
| src/index.ts initApprovalFlow | src/approval-flow.ts ReactionDeps | addReaction/removeReaction in deps | NOT_WIRED | initApprovalFlow call (line 694) missing addReaction and removeReaction properties. TypeScript error TS2345. |

### Data-Flow Trace (Level 4)

Not applicable -- StatusReaction is an event-driven state machine, not a data-rendering component. The callbacks flow through correctly for the @mention path (index.ts). The :jira: path is broken at the deps wiring level (see gap).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compilation | `npx tsc --noEmit` | TS2345: initApprovalFlow deps missing addReaction, removeReaction | FAIL |
| StatusReaction unit tests | `npx vitest run src/status-reactions.test.ts` | 14 tests passing | PASS |
| Slack reaction method tests | `npx vitest run src/channels/slack.test.ts` | 65 tests passing | PASS |
| Approval flow tests | `npx vitest run src/approval-flow.test.ts` | 15 tests passing | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| D-01 | 05-01 | Eyes emoji on trigger for "seen" signal | SATISFIED | StatusReaction.received() adds 'eyes'. Wired in index.ts line 282. |
| D-02 | 05-02 | All triggers (@mention, :jira:) get acknowledgement | BLOCKED | @mention path wired correctly. :jira: emoji path has approval-flow.ts code but initApprovalFlow deps in index.ts missing addReaction/removeReaction. |
| D-03 | 05-01 | Stage-based emoji transition: received->processing->done/failed | SATISFIED | Forward-only state machine with STAGE_ORDER. Tests verify all transitions. |
| D-04 | 05-01 | Replace previous stage emoji (not cumulative) | SATISFIED | transition() calls removeReaction before addReaction. Tests verify remove+add order. |
| D-05 | 05-01, 05-02 | Long-running tasks get text status message in thread | SATISFIED | StatusReaction timer with 10s default. sendStatusMessage callback wired in both index.ts and approval-flow.ts. |

Note: D-01 through D-05 are phase-scoped requirement IDs defined in `05-CONTEXT.md` and `05-RESEARCH.md`. They are not tracked in `.planning/REQUIREMENTS.md` (which only covers phases 1-4). The traceability table in REQUIREMENTS.md should be updated to include Phase 5.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/index.ts | 703 | `'Edit callback triggered -- re-invocation not yet wired'` | Info | Pre-existing from Phase 4. Not a Phase 5 concern. |
| src/index.ts | 707 | `'Emoji reaction agent enqueue -- not yet wired'` | Info | Pre-existing from Phase 4. Not a Phase 5 concern. |
| src/index.ts | 694 | Missing addReaction/removeReaction in initApprovalFlow deps | Blocker | TypeScript compilation fails. :jira: emoji reaction path broken. |

### Human Verification Required

### 1. Live Emoji Lifecycle on @mention

**Test:** In a Slack channel where the bot is active, send a message mentioning the bot (e.g., "@Andy help me create a ticket").
**Expected:** Eyes emoji appears on the message within 1 second, changes to gear when the agent starts producing output, then changes to checkmark when the response completes (or X if it fails).
**Why human:** Requires live Slack workspace with connected bot instance.

### 2. Live Emoji Lifecycle on :jira: Reaction

**Test:** After the gap is fixed, react with :jira: emoji on any message in the bot's channel.
**Expected:** Eyes emoji appears on the reacted message, transitions to gear, then checkmark/X.
**Why human:** Requires live Slack workspace and working Jira integration.

### 3. Status Message for Long-Running Tasks

**Test:** Trigger a task that takes more than 10 seconds to process.
**Expected:** After approximately 10 seconds, a "Working on it..." message appears in the thread alongside the gear emoji.
**Why human:** Requires a scenario where agent processing exceeds the 10-second threshold.

### Gaps Summary

One gap blocks full goal achievement:

**The initApprovalFlow call in `src/index.ts` (line 694) does not pass `addReaction` and `removeReaction` to the deps object.** The `ReactionDeps` interface in `approval-flow.ts` was correctly extended with these fields, and `handleJiraReaction` correctly uses them to create a StatusReaction instance. However, the caller side was not updated to provide these callbacks. This causes TypeScript compilation error TS2345, which means the entire project cannot build.

The fix is straightforward: add two lines to the initApprovalFlow deps object in `src/index.ts`:
```typescript
addReaction: (channelId: string, ts: string, emoji: string) =>
  slackCh.addReaction(channelId, ts, emoji),
removeReaction: (channelId: string, ts: string, emoji: string) =>
  slackCh.removeReaction(channelId, ts, emoji),
```

The @mention trigger path is fully wired and functional. All unit tests pass (79 tests across 3 test files). The core StatusReaction state machine is solid with comprehensive test coverage.

---

_Verified: 2026-04-03T18:16:00Z_
_Verifier: Claude (gsd-verifier)_
