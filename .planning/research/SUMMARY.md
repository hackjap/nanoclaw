# Project Research Summary

**Project:** NanoClaw Jira Integration (Slack-to-Jira DevOps Automation)
**Domain:** Conversational AI ticket creation via Slack bot
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

This project adds Jira issue creation to NanoClaw's existing Slack channel through a conversational AI flow. The user @mentions the bot in a Slack thread, the Claude Agent SDK (running in a container) conducts a short interview to collect issue details, then presents a Block Kit preview with Approve/Edit buttons. On approval, the orchestrator (host process) creates the Jira issue via REST API v3. The pattern is well-understood: jira.js for API access, existing @slack/bolt for interactive components, and NanoClaw's established IPC + container architecture for the AI conversation. No new frameworks or paradigm shifts are needed -- this is an extension of existing infrastructure.

The recommended approach is incremental: first make Slack threads work properly (NanoClaw currently flattens thread replies), then build the container-side conversation agent, then integrate the Jira API client and draft persistence, and finally wire up the interactive approval flow. This order is dictated by hard dependencies -- you cannot build approval buttons without drafts, and you cannot build drafts without threaded conversations. The only new dependency is `jira.js` (one npm install). Everything else leverages existing stack.

The primary risks are: (1) NanoClaw has zero interactive component infrastructure today, so Slack action handlers are entirely new plumbing; (2) Jira API v3 requires Atlassian Document Format (ADF) for descriptions, which is a common stumbling block; (3) the ephemeral container model means button clicks arrive after the container exits, requiring orchestrator-side handling with SQLite draft persistence. All three are well-documented problems with known solutions, but they must be addressed architecturally upfront rather than discovered during implementation.

## Key Findings

### Recommended Stack

The stack is minimal. Only one new dependency is needed: `jira.js` v5.3.x, the only actively maintained TypeScript-native Jira client with full REST API v3 coverage. Everything else is already installed. See [STACK.md](STACK.md) for full details.

**Core technologies:**
- **jira.js v5.3.x**: Jira Cloud REST API v3 client -- TypeScript-native, full type definitions, Basic Auth support, Node 20+ compatible
- **@slack/bolt v4.3.x (existing)**: Interactive components via `app.action()`, Block Kit messages, Socket Mode handles both events and action payloads
- **@slack/types v2.15.x (existing)**: TypeScript types for Block Kit element construction

**Critical version note:** jira.js v5.3.x requires Node 20+, which matches NanoClaw's engine constraint. No conflicts with existing dependencies.

### Expected Features

The feature set has a clear linear dependency chain: trigger -> thread conversation -> draft collection -> preview -> approval -> creation -> confirmation. See [FEATURES.md](FEATURES.md) for the full landscape and competitor analysis.

**Must have (table stakes):**
- @mention triggers thread conversation (entry point)
- Thread-scoped replies via `thread_ts` (foundational infrastructure change)
- Conversational info gathering for title, description, issue type
- Block Kit issue preview with Approve/Edit buttons
- Jira REST API v3 issue creation (fixed project key)
- Confirmation message with clickable Jira issue link
- Error handling with user-facing messages in thread

**Should have (differentiators):**
- AI-inferred issue type (reduces conversation turns)
- Thread context summarization (pre-fill from existing conversation)
- Edit-before-submit conversational flow (targeted field changes)
- Rich Block Kit formatting for previews

**Defer (v2+):**
- Multi-project selection (complexity explosion, marginal v1 value)
- Additional Jira fields beyond title/description/type
- Assignee mapping (requires Slack-to-Jira user directory)
- Emoji-react trigger (independent entry point, add later)
- Bi-directional sync (entirely different architecture; official Jira app handles this)

### Architecture Approach

The architecture extends NanoClaw's existing patterns without introducing new paradigms. The container agent collects issue information and outputs structured JSON via a new IPC `actions/` directory. The orchestrator stores the draft in SQLite, sends a Block Kit preview, and handles button clicks host-side (no container needed for approval). Jira credentials stay on the host, never entering containers. See [ARCHITECTURE.md](ARCHITECTURE.md) for component diagrams and data flow.

**Major components:**
1. **SlackChannel (extended)** -- adds Block Kit message support, `app.action()` handler registration, thread-aware replies
2. **Jira Client (new, `src/jira/`)** -- wraps jira.js Version3Client, handles ADF conversion, credential proxy integration
3. **IPC Watcher (extended)** -- new `actions/` IPC type for structured intents (e.g., `jira_create`) from containers
4. **Draft Store (new, SQLite)** -- `jira_drafts` table keyed by `thread_ts`, persists across restarts
5. **Slack Action Handlers (new, `src/channels/slack-actions.ts`)** -- dispatches approve/edit button clicks to Jira client or edit flow
6. **Container Agent (extended)** -- new system prompt for Jira field collection with convergence criteria

### Critical Pitfalls

Top 5 pitfalls that must be addressed proactively. See [PITFALLS.md](PITFALLS.md) for the full catalog including recovery strategies.

1. **Slack app missing interactivity toggle** -- The Slack app must have "Interactivity & Shortcuts" enabled in the dashboard before any development. Without it, button clicks silently fail. Verify with a test button before writing real handlers.
2. **No action handlers for button clicks** -- NanoClaw has zero interactive component infrastructure. Must register `app.action()` handlers and call `ack()` within 3 seconds. Requires exposing Bolt App instance from SlackChannel.
3. **Thread context lost between container invocations** -- Current architecture flattens threads and has no `thread_ts` in ContainerInput. Must extend NewMessage, Channel interface, and persist conversation state in SQLite.
4. **Button clicks arrive after container exits** -- Containers are ephemeral; approval clicks come minutes later. Drafts must be stored in SQLite and approval handled orchestrator-side, not in containers.
5. **Jira API v3 requires ADF, not plain text** -- Description fields must use Atlassian Document Format (structured JSON), not strings. Build a `textToAdf()` utility and test against real Jira Cloud early.

## Implications for Roadmap

Based on the dependency chain across all four research files, the project decomposes into 5 phases:

### Phase 0: Prerequisites and Setup
**Rationale:** Slack app configuration and credential setup must happen before any code. Pitfall #5 (missing interactivity toggle) and Pitfall #1 (no action handlers) both stem from missing prerequisites.
**Delivers:** Verified Slack app with interactivity enabled; Jira API credentials in credential proxy; test button that receives clicks.
**Addresses:** Error handling foundation, credential management
**Avoids:** Silent button click failures, credential misconfiguration

### Phase 1: Thread-Aware Conversation Foundation
**Rationale:** Everything depends on threaded conversation working. The current SlackChannel flattens threads -- this must be fixed first. Architecture research and pitfalls research both identify this as the single blocking dependency.
**Delivers:** Thread-scoped message routing; extended Channel interface with `thread_ts` support; ContainerInput with thread context; SQLite session state keyed by thread_ts.
**Addresses:** Thread-scoped conversation (P1), thread reply support
**Avoids:** Thread context lost (Pitfall #2), bot replying to channel instead of thread

### Phase 2: Container Agent Draft Collection
**Rationale:** Once threads work, the AI conversation for collecting Jira fields can be built. This is the core value proposition -- the conversational form-filling that differentiates from the native Jira Slack app's modal forms.
**Delivers:** Agent system prompt with convergence criteria; structured draft JSON output via IPC `actions/` directory; draft schema and types.
**Addresses:** Conversational info gathering (P1), AI-inferred issue type (P2)
**Avoids:** AI conversation loop never converges (Pitfall #6)

### Phase 3: Jira Client and Draft Persistence
**Rationale:** With drafts being produced by the agent, we need to store them and connect to Jira. The Jira client and Block Kit preview builder can be developed and tested independently of the full flow.
**Delivers:** `src/jira/client.ts` wrapping jira.js; `textToAdf()` utility; `jira_drafts` SQLite table; Block Kit preview builder; Jira issue creation tested against real API.
**Uses:** jira.js v5.3.x (Version3Client), SQLite (existing db.ts)
**Implements:** Jira Client component, Draft Store component
**Avoids:** ADF format errors (Pitfall #3), draft data lost on restart

### Phase 4: Interactive Approval Flow
**Rationale:** This is the integration phase that ties everything together. Requires all previous components. Approval is handled orchestrator-side (not in containers) to avoid Pitfall #4.
**Delivers:** `app.action()` handlers for approve/edit; message update on approval (remove buttons, show status); Jira creation on approve; edit flow re-enters conversation; confirmation with Jira link.
**Addresses:** Approve/Reject buttons (P1), confirmation with link (P1), edit-before-submit (P2)
**Avoids:** Button clicks after container exit (Pitfall #4), spawning containers for deterministic actions

### Phase Ordering Rationale

- **Phase 0 before everything**: Slack interactivity toggle and Jira credentials are prerequisites that block all interactive component work. Discovering these missing mid-development wastes time.
- **Phase 1 before Phase 2**: The container agent cannot have a multi-turn conversation without thread routing. This is a hard architectural dependency.
- **Phase 2 before Phase 3**: The Jira client needs to know the draft schema, which is defined by what the agent produces. Building the agent first establishes the contract.
- **Phase 3 before Phase 4**: Approval flow needs the Jira client and stored drafts to function. Testing approval without a real Jira connection is meaningless.
- **Phases 3 and 4 could partially overlap**: The Jira client (Phase 3) and action handler registration (Phase 4) are independent -- but draft persistence must complete before approval wiring.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Thread routing in NanoClaw requires careful analysis of the existing message loop, ContainerInput contract, and IPC watcher. The current code actively flattens threads -- reversing this needs implementation-level research.
- **Phase 2:** Agent prompt engineering for convergent Jira field collection. Needs iteration and testing to get the conversation flow right (max 3-4 turns to draft).

Phases with standard patterns (skip research-phase):
- **Phase 0:** Standard Slack app configuration and credential setup. Well-documented.
- **Phase 3:** jira.js usage and ADF format are well-documented with code examples in STACK.md. SQLite table creation follows existing NanoClaw patterns.
- **Phase 4:** Slack Bolt `app.action()` pattern is well-documented. The architecture decision (orchestrator-side handling) is already made.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | jira.js is the clear choice. No ambiguity. Official docs + npm ecosystem confirms. |
| Features | HIGH | Feature landscape well-mapped with competitor analysis. Clear MVP boundary. Dependency chain is linear and unambiguous. |
| Architecture | HIGH | Extends existing NanoClaw patterns (IPC, containers, SQLite). No new paradigms. Component boundaries are clean. |
| Pitfalls | HIGH (Slack), MEDIUM (Jira) | Slack interactive component pitfalls well-documented via Bolt GitHub issues. Jira ADF pitfalls confirmed via Atlassian community. Jira rate limits and edge cases less explored. |

**Overall confidence:** HIGH

### Gaps to Address

- **Jira project metadata caching**: Research recommends caching issue types and required fields, but the caching strategy (TTL, invalidation) is not specified. Address during Phase 3 implementation.
- **Slack Block Kit character limits**: Block Kit sections have a 3000-char limit. Long AI-generated descriptions may need truncation. Test during Phase 2 with verbose inputs.
- **Edit flow container re-invocation**: When a user clicks "Edit" and provides new input, how exactly does the orchestrator re-invoke the container with draft context? The IPC extension is outlined but the ContainerInput schema change needs detailed design in Phase 1.
- **Concurrent draft handling**: Multiple users creating issues simultaneously is noted as a test case but the thread_ts keying strategy needs validation under concurrency during Phase 1.
- **Jira API rate limits under Basic Auth**: Research notes ~100 req/min limit but actual limits may vary. Monitor during Phase 3 testing; not a v1 blocker at expected scale.

## Sources

### Primary (HIGH confidence)
- [jira.js GitHub + Documentation](https://github.com/MrRefactoring/jira.js) -- API coverage, Version3Client, auth methods
- [Slack Bolt for JS](https://docs.slack.dev/tools/bolt-js/) -- app.action(), Block Kit, Socket Mode interactivity
- [Slack Block Kit Reference](https://docs.slack.dev/reference/block-kit/) -- Block types, interactive elements
- [Atlassian REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) -- Issue creation, ADF format
- NanoClaw codebase: `src/channels/slack.ts`, `src/ipc.ts`, `src/types.ts`, `src/container-runner.ts`

### Secondary (MEDIUM confidence)
- [Atlassian Community - ADF description field](https://community.developer.atlassian.com/t/jira-rest-api-description-field/60902) -- Confirmed ADF requirement
- [Slack Bolt GitHub Issues #1402, #1548](https://github.com/slackapi/bolt-js/issues/) -- Unhandled action timeout behavior
- [IdeaLift, ClearFeed, eesel AI](https://idealift.app/blog/01-slack-to-jira-integration) -- Competitor feature analysis

### Tertiary (LOW confidence)
- Jira API rate limit specifics under Basic Auth -- inferred from documentation, needs runtime validation

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*
