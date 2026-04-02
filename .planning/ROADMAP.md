# Roadmap: DevOps Slack-to-Jira Agent

## Overview

This roadmap delivers a conversational Slack bot that transforms DevOps work requests into Jira issues through AI-guided dialogue. The build follows the natural dependency chain: thread infrastructure first (nothing works without threaded conversations), then the AI conversation agent (collects issue details), then Jira integration with persistence (stores drafts, connects to Jira API), and finally the interactive approval flow that ties everything together with buttons, confirmations, and error handling. Each phase delivers a testable capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Thread-Aware Slack Infrastructure** - Enable threaded conversation, interactive components, and Block Kit messaging
- [ ] **Phase 2: AI Conversation Agent** - Container agent collects Jira issue details through multi-turn thread dialogue
- [ ] **Phase 3: Jira Client & Draft Persistence** - Connect to Jira API, store drafts in SQLite, handle API errors
- [ ] **Phase 4: Interactive Approval Flow** - Block Kit previews with approve/edit buttons, emoji trigger, confirmation, and error feedback

## Phase Details

### Phase 1: Thread-Aware Slack Infrastructure
**Goal**: Bot can carry on threaded conversations in Slack with structured Block Kit messages and interactive component support
**Depends on**: Nothing (first phase)
**Requirements**: SLCK-01, SLCK-02, SLCK-03, SLCK-04
**Success Criteria** (what must be TRUE):
  1. When a user @mentions the bot, the bot replies in a thread under that message (not in the channel)
  2. When a user sends a follow-up message in that thread, the bot replies within the same thread
  3. Bot can send a Block Kit formatted message with sections, fields, and action buttons to a thread
  4. When a user clicks a button in a bot message, the app.action() handler receives the event and can respond
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md — Thread-aware message pipeline (thread_ts in NewMessage, sendMessage options, IPC/router/container wiring)
- [ ] 01-02-PLAN.md — Interactive components and Block Kit (action callback registry, app.action handler, Block Kit message tests)

### Phase 2: AI Conversation Agent
**Goal**: AI agent conducts a focused multi-turn conversation in a Slack thread to collect Jira issue details (title, description, issue type)
**Depends on**: Phase 1
**Requirements**: CONV-01, CONV-02, CONV-03
**Success Criteria** (what must be TRUE):
  1. When a user @mentions the bot with a work request, the AI agent asks clarifying questions in the thread to gather missing information
  2. The AI agent collects at minimum a title, description, and issue type (Bug/Task/Story) through conversation
  3. When sufficient information is collected, the container outputs a structured draft JSON via IPC actions directory
**Plans**: TBD

### Phase 3: Jira Client & Draft Persistence
**Goal**: System can create Jira issues via API and persist draft data across container lifecycle boundaries
**Depends on**: Phase 2
**Requirements**: JIRA-01, JIRA-02, JIRA-03, DRFT-05, ERRH-01
**Success Criteria** (what must be TRUE):
  1. Given valid draft data, the system creates a Jira issue in the configured project with correct title, description (ADF format), and issue type
  2. Jira credentials (host, email, API token, project key) are managed through the credential proxy -- never hardcoded or passed to containers
  3. Draft data received from the container is persisted in SQLite keyed by thread_ts and survives process restarts
  4. When Jira API call fails, the error is caught and a user-friendly message is posted to the thread explaining what went wrong
**Plans**: TBD

### Phase 4: Interactive Approval Flow
**Goal**: Users see a rich preview of the Jira draft and can approve, edit, or trigger creation via emoji -- with confirmation and error feedback for every action
**Depends on**: Phase 3
**Requirements**: SLCK-05, DRFT-01, DRFT-02, DRFT-03, DRFT-04, NOTF-01, ERRH-02
**Success Criteria** (what must be TRUE):
  1. After AI collects issue details, a Block Kit preview showing the draft title, description, and issue type appears in the thread with Approve and Edit buttons
  2. Clicking Approve creates the Jira issue and posts a confirmation message with a clickable link to the created issue
  3. Clicking Edit re-invokes the container agent with draft context so the user can modify specific fields through conversation
  4. Adding a :jira: emoji reaction to any message starts the ticket creation flow based on that message content
  5. When a Slack interactive component error occurs, the user receives clear feedback in the thread about what happened
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Thread-Aware Slack Infrastructure | 0/2 | Planning complete | - |
| 2. AI Conversation Agent | 0/? | Not started | - |
| 3. Jira Client & Draft Persistence | 0/? | Not started | - |
| 4. Interactive Approval Flow | 0/? | Not started | - |
