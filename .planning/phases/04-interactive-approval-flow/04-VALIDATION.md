---
phase: 4
slug: interactive-approval-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DRFT-01, DRFT-02 | unit | `npx vitest run src/approval-flow.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | DRFT-03 | unit | `npx vitest run src/approval-flow.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | DRFT-04 | unit | `npx vitest run src/approval-flow.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | SLCK-05 | unit | `npx vitest run src/channels/slack.test.ts` | ✅ | ⬜ pending |
| 04-02-02 | 02 | 2 | NOTF-01 | unit | `npx vitest run src/approval-flow.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | ERRH-02 | unit | `npx vitest run src/approval-flow.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/approval-flow.test.ts` — stubs for DRFT-01, DRFT-02, DRFT-03, DRFT-04, NOTF-01, ERRH-02
- [ ] Existing `src/channels/slack.test.ts` — already covers action handler infrastructure, extend for SLCK-05

*Existing vitest framework fully covers test infrastructure needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| :jira: emoji reaction triggers ticket flow | SLCK-05 | Requires live Slack app with `reactions:read` scope | Add :jira: reaction to a message in test channel, verify thread starts |
| Block Kit preview renders correctly in Slack | DRFT-01 | Visual rendering is Slack-side | Send preview via test, verify in Slack UI |
| chat.update replaces preview after approve | DRFT-03, NOTF-01 | Slack message mutation is runtime-only | Click Approve in test, verify message updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
