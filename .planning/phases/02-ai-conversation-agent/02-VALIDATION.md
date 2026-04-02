---
phase: 2
slug: ai-conversation-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | vitest.config.ts |
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
| 02-01-01 | 01 | 1 | CONV-03 | unit | `npx vitest run src/ipc.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CONV-03 | unit | `npx vitest run container/agent-runner/src/mcp-tools.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | CONV-01 | integration | manual — requires Slack thread | N/A | ⬜ pending |
| 02-02-02 | 02 | 2 | CONV-02 | integration | manual — requires agent conversation | N/A | ⬜ pending |
| 02-02-03 | 02 | 2 | CONV-03 | unit | `npx vitest run src/ipc.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ipc.test.ts` — extend existing tests for actions/ directory polling
- [ ] `container/agent-runner/src/mcp-tools.test.ts` — stub for submit_jira_draft MCP tool validation

*Existing vitest infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bot asks clarifying questions in Slack thread | CONV-01 | Requires live Slack connection and @mention trigger | 1. @mention bot with work request 2. Verify bot replies in thread with questions |
| Bot collects title/description/issueType | CONV-02 | Requires multi-turn conversation in Slack | 1. Continue thread conversation 2. Verify bot asks for missing fields 3. Verify inference-first behavior |
| Draft JSON written to actions/ IPC | CONV-03 | End-to-end flow through container | 1. Complete conversation 2. Check actions/ dir for JSON file 3. Validate JSON schema |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
