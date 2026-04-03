---
phase: 5
slug: bot-liveness-reactions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | D-01/D-02 | unit | `npx vitest run src/status-reaction.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | D-03/D-04 | unit | `npx vitest run src/status-reaction.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | D-05 | unit | `npx vitest run src/status-reaction.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/status-reaction.test.ts` — stubs for reactions.add/remove and state machine
- [ ] Test fixtures for Slack API mock responses (already_reacted, no_reaction error codes)

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Emoji visible in Slack thread | D-01 | Requires real Slack workspace | Send test message, verify 👀 appears |
| Emoji transition sequence | D-03 | Visual UX verification | Trigger bot, watch 👀→⚙️→✅ sequence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
