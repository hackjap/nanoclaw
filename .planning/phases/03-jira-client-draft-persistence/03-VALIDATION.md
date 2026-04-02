---
phase: 3
slug: jira-client-draft-persistence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (or inline in package.json) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

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
| 03-01-01 | 01 | 1 | JIRA-01 | unit | `npx vitest run src/jira-client.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | JIRA-02 | unit | `npx vitest run src/jira-client.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | JIRA-03 | unit | `npx vitest run src/jira-client.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | DRFT-05 | unit | `npx vitest run src/db.test.ts` | ✅ | ⬜ pending |
| 03-02-02 | 02 | 1 | ERRH-01 | unit | `npx vitest run src/jira-client.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/jira-client.test.ts` — stubs for JIRA-01, JIRA-02, JIRA-03, ERRH-01
- [ ] `src/db.test.ts` — extend existing with jira_drafts stubs for DRFT-05

*Existing vitest infrastructure covers test runner requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Jira issue created in real project | JIRA-01 | Requires live Jira instance | Configure .env with test project, run createJiraIssue with sample data, verify issue in Jira UI |
| Credential proxy injection | JIRA-03 | Requires running proxy + .env | Start proxy, verify Jira client reads credentials from env without direct container access |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
