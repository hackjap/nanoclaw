---
phase: 1
slug: thread-aware-slack-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | vitest.config.ts (root) |
| **Quick run command** | `npx vitest run src/channels/slack.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/channels/slack.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SLCK-01 | unit | `npx vitest run src/channels/slack.test.ts -t "thread"` | Partial | ⬜ pending |
| 01-01-02 | 01 | 1 | SLCK-02 | unit | `npx vitest run src/channels/slack.test.ts -t "thread"` | Partial | ⬜ pending |
| 01-02-01 | 02 | 1 | SLCK-03 | unit | `npx vitest run src/channels/slack.test.ts -t "action"` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | SLCK-04 | unit | `npx vitest run src/channels/slack.test.ts -t "block"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update existing thread flattening tests in `slack.test.ts` to assert thread-aware behavior
- [ ] Add action handler tests (app.action mock, ack verification, callback registry)
- [ ] Add Block Kit sendMessage tests (blocks parameter passed to chat.postMessage)
- [ ] Add thread_ts propagation test (NewMessage includes thread_ts from event)
- [ ] Mock `app.action()` in MockApp class (currently only mocks `app.event()`)

*Existing infrastructure covers test framework — only new test cases needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Slack Socket Mode thread delivery | SLCK-01, SLCK-02 | Requires live Slack workspace | @mention bot in channel, verify response appears in thread |
| Button click roundtrip | SLCK-03 | Requires live Slack interactive components | Click button in bot message, verify ack and response |
| Block Kit rendering | SLCK-04 | Visual verification needed | Send Block Kit message, verify layout in Slack |

---

## Notes

- Existing `createMessageEvent` helper already accepts `threadTs` parameter — reuse for thread tests
- MockApp class needs `app.action()` mock support (currently only `app.event()`)
- thread_ts must remain string type (not float) — add type assertion in tests
