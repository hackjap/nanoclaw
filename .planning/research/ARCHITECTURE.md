# Architecture Research

**Domain:** Slack-to-Jira DevOps automation agent (NanoClaw extension)
**Researched:** 2026-04-02
**Confidence:** HIGH

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Slack Platform                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐     │
│  │ @bot mention  │  │ Thread messages   │  │ Button clicks      │     │
│  │ (event)       │  │ (event)           │  │ (action)           │     │
│  └──────┬───────┘  └────────┬─────────┘  └─────────┬──────────┘     │
└─────────┼──────────────────┼───────────────────────┼────────────────┘
          │ Socket Mode      │ Socket Mode           │ Socket Mode
          ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NanoClaw Orchestrator (Host)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │              SlackChannel (extended)                      │       │
│  │  app.event('message') ──► onMessage callback             │       │
│  │  app.action('approve') ──► Action Handler (NEW)          │       │
│  │  app.action('edit')    ──► Action Handler (NEW)          │       │
│  │  postMessage(blocks)   ──► Rich messages with buttons    │       │
│  └──────────────────┬───────────────────────────────────────┘       │
│                     │                                               │
│  ┌──────────────────▼───────────────────────────────────────┐       │
│  │              Message Loop / Group Queue                   │       │
│  │  enqueueMessageCheck() → runContainerAgent()             │       │
│  └──────────────────┬───────────────────────────────────────┘       │
│                     │                                               │
│  ┌──────────────────▼───────────────────────────────────────┐       │
│  │              IPC Watcher (extended)                        │       │
│  │  messages/*.json  ──► routeOutbound (text or blocks)      │       │
│  │  tasks/*.json     ──► task scheduling                     │       │
│  │  actions/*.json   ──► Jira API calls (NEW)                │       │
│  └──────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌─────────────────┐  ┌───────────────────┐  ┌──────────────┐      │
│  │ Credential Proxy │  │ Jira Client (NEW) │  │ SQLite DB    │      │
│  │ (Anthropic API)  │  │ (REST API v3)     │  │ (messages,   │      │
│  └─────────────────┘  └───────────────────┘  │  sessions,   │      │
│                                               │  drafts)     │      │
│                                               └──────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
          │ Container spawn
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Container Agent (Docker)                          │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │  Claude Agent SDK                                         │       │
│  │  - Conversational Jira draft collection                   │       │
│  │  - Outputs structured draft via IPC                       │       │
│  │  - No direct Jira/Slack API access                        │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **SlackChannel (extended)** | Receives messages + button actions; sends text and Block Kit messages | Orchestrator callbacks, Slack API |
| **Action Handler (NEW)** | Dispatches button clicks (approve/edit) to appropriate logic | SlackChannel, Jira Client, IPC |
| **Jira Client (NEW)** | Creates issues via Jira REST API v3; validates project/issue types | Jira Cloud API, Credential Proxy |
| **IPC Watcher (extended)** | Processes new `actions/` IPC type for Jira operations from containers | Container agents, Jira Client, Router |
| **Container Agent** | Collects issue info via conversation; outputs structured draft JSON | Claude Agent SDK, IPC filesystem |
| **Draft Store (NEW)** | Persists Jira drafts between conversation turns and approval | SQLite DB |
| **Credential Proxy (extended)** | Manages Jira API token alongside Anthropic credentials | Jira Client, env/OneCLI |

## Recommended Project Structure

```
src/
├── channels/
│   ├── registry.ts          # Existing channel registry
│   ├── slack.ts             # Extended: Block Kit messages + action handlers
│   └── slack-actions.ts     # NEW: Slack interactive component handlers
├── jira/
│   ├── client.ts            # NEW: Jira REST API v3 client wrapper
│   ├── types.ts             # NEW: Jira issue types, draft schema
│   └── blocks.ts            # NEW: Slack Block Kit builders for Jira previews
├── ipc.ts                   # Extended: new 'jira_create' action type
├── container-runner.ts      # Existing (no changes needed)
├── db.ts                    # Extended: draft_issues table
├── config.ts                # Extended: Jira config vars
├── router.ts                # Extended: support Block Kit in outbound
└── types.ts                 # Extended: new IPC action types
```

### Structure Rationale

- **`src/jira/`**: Isolates all Jira-specific logic (API client, types, Block Kit formatting) in a dedicated module. The orchestrator never leaks Jira concerns into core message handling.
- **`src/channels/slack-actions.ts`**: Separates interactive component handlers from the core SlackChannel class. The main `slack.ts` stays focused on message I/O; action handlers are registered alongside but defined separately.
- **No Jira inside containers**: The container agent collects information and outputs a structured draft. The orchestrator (host) makes the actual Jira API call. This preserves the security model (containers never hold API credentials).

## Architectural Patterns

### Pattern 1: Host-Side API Execution (Jira calls on orchestrator, not in container)

**What:** Container agents produce structured intent (a Jira draft JSON) via IPC. The orchestrator interprets the intent and executes the Jira API call on the host side where credentials are available.

**When to use:** Any time a container needs to call an external API that requires authentication not available inside the sandbox.

**Trade-offs:**
- PRO: Containers stay credential-free; no Jira token exposure
- PRO: Single point of Jira API management (rate limiting, error handling)
- CON: Container cannot get real-time feedback from Jira (e.g., validate project exists)
- MITIGATION: Pre-load Jira project metadata into container input so agent can validate locally

**Example:**
```typescript
// Container agent writes to IPC:
// /workspace/ipc/{groupFolder}/actions/{timestamp}.json
{
  "type": "jira_create",
  "draft": {
    "summary": "Set up staging environment",
    "description": "Need a new staging env for the payments team...",
    "issueType": "Task"
  },
  "chatJid": "slack:C12345",
  "threadTs": "1234567890.123456",
  "requesterId": "U98765"
}

// Orchestrator IPC watcher picks up, stores draft, sends Block Kit preview
// Button click triggers actual Jira API call
```

### Pattern 2: Slack Block Kit for Structured Previews and Approval

**What:** Use Slack's Block Kit (sections, fields, buttons) to present a formatted Jira issue preview with Approve/Edit action buttons. Messages are sent with `thread_ts` to keep the conversation threaded.

**When to use:** Presenting structured data that requires user confirmation before an irreversible action (issue creation).

**Trade-offs:**
- PRO: Clear, scannable preview format; explicit approve/reject UX
- PRO: `thread_ts` keeps all interaction in one thread, no channel noise
- CON: Block Kit has character limits per block (3000 chars for section text)
- CON: Buttons expire after 3 seconds if `ack()` is not called

**Example:**
```typescript
// Sending a preview with buttons
await app.client.chat.postMessage({
  channel: channelId,
  thread_ts: parentTs,  // Keep in thread
  blocks: [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Jira Issue Preview*' }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Summary:*\n${draft.summary}` },
        { type: 'mrkdwn', text: `*Type:*\n${draft.issueType}` },
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Description:*\n${draft.description}` }
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'jira_approve',
          value: draftId  // Reference to stored draft
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'jira_edit',
          value: draftId
        }
      ]
    }
  ]
});
```

### Pattern 3: Thread-Scoped Conversation State

**What:** Use Slack's `thread_ts` as the conversation scope identifier. The first bot mention's `ts` becomes the thread root. All subsequent messages (AI questions, user replies, preview, approval) happen in that thread. The draft is keyed to the thread_ts in the database.

**When to use:** Multi-turn conversations that should be isolated per request.

**Trade-offs:**
- PRO: Natural Slack UX; each request is a self-contained thread
- PRO: thread_ts is a stable, unique identifier for draft lookup
- CON: Thread replies arrive as regular message events with `thread_ts` field -- need to route them to the correct container session
- CON: Slack's threading model means the container agent needs thread context to know it's a continuation

**Example:**
```typescript
// In SlackChannel message handler, extract thread context:
const threadTs = (msg as GenericMessageEvent).thread_ts;
const isThreadReply = !!threadTs;

// Pass thread_ts through to container input so agent knows context
// Store mapping: thread_ts -> draftId in SQLite
```

### Pattern 4: Extended IPC Protocol (New Action Type)

**What:** Add an `actions/` subdirectory to the existing IPC namespace alongside `messages/` and `tasks/`. Container agents write structured action files that the orchestrator interprets as external API calls.

**When to use:** When containers need to trigger orchestrator-side operations beyond simple message sending.

**Trade-offs:**
- PRO: Follows existing IPC convention exactly -- file-based, polled, JSON
- PRO: Authorization model extends naturally (folder-based identity)
- CON: Adds another IPC type to the watcher polling loop
- MITIGATION: Minimal overhead; same 1s poll interval handles all types

## Data Flow

### Happy Path: Mention to Jira Issue

```
User @mentions bot in Slack channel
    │
    ▼
SlackChannel.event('message')
    │ Detects @mention, prepends trigger
    ▼
onMessage() → storeMessage() → enqueueMessageCheck()
    │
    ▼
runContainerAgent() with prompt containing user's request
    │
    ▼
Container Agent (Claude SDK)
    │ Asks clarifying questions via IPC messages
    │ User replies in thread → new container invocation
    │ ... (multi-turn conversation) ...
    │
    │ Agent produces structured Jira draft
    ▼
Container writes /workspace/ipc/{group}/actions/jira_create.json
    │
    ▼
IPC Watcher picks up action file
    │ Stores draft in SQLite (keyed by thread_ts)
    │ Builds Block Kit preview
    ▼
SlackChannel.postMessage() with blocks + buttons (in thread)
    │
    ▼
User clicks "Approve" button
    │
    ▼
SlackChannel.action('jira_approve')
    │ ack() immediately
    │ Loads draft from SQLite by draftId
    ▼
JiraClient.createIssue(draft)
    │
    ▼
Success → post Jira link in thread
    │ Update preview message (remove buttons, add "Created" status)
    ▼
Done
```

### Edit Flow (User clicks "Edit")

```
User clicks "Edit" button
    │
    ▼
SlackChannel.action('jira_edit')
    │ ack() immediately
    │ Posts "What would you like to change?" in thread
    ▼
User replies in thread
    │
    ▼
onMessage() → new container invocation with edit context
    │ Agent updates draft based on feedback
    │ Writes updated draft via IPC
    ▼
New preview with updated fields + buttons
    │ (cycle repeats until Approve)
```

### Thread Message Routing

```
Slack message arrives
    │
    ▼
Has thread_ts?
    ├── NO → Regular message flow (check trigger pattern)
    └── YES → Is thread_ts associated with an active Jira draft?
              ├── NO → Regular threaded message (existing behavior)
              └── YES → Route to container with draft context
                        (include draft state in container input)
```

## Key Architectural Decisions

### Decision 1: Jira API calls happen on the orchestrator, not in containers

The container agent collects information and outputs structured JSON. The orchestrator holds Jira credentials and makes API calls. This is consistent with how NanoClaw handles all external credentials (via credential proxy) and avoids giving containers access to Jira tokens.

**Alternative considered:** MCP tool inside container for Jira. Rejected because it would require injecting Jira credentials into the container environment, breaking the security model.

### Decision 2: Extend Channel interface for rich messages, not replace it

The current `Channel.sendMessage(jid, text)` signature only supports plain text. For Block Kit messages, extend the interface with an optional `sendRichMessage(jid, blocks, options)` method rather than overloading `sendMessage`. Channels that don't support rich messages simply don't implement it.

```typescript
// Extended Channel interface
export interface Channel {
  // ... existing methods ...
  sendRichMessage?(jid: string, blocks: unknown[], options?: {
    text?: string;       // Fallback text
    thread_ts?: string;  // Thread parent
    replace_ts?: string; // Update existing message
  }): Promise<string | undefined>;  // Returns message ts
}
```

### Decision 3: Store drafts in SQLite, not in-memory

Drafts must survive orchestrator restarts. A `jira_drafts` table keyed by `(thread_ts, group_folder)` holds the draft JSON, status, and requester info. This is consistent with NanoClaw's existing SQLite-for-everything persistence pattern.

```sql
CREATE TABLE IF NOT EXISTS jira_drafts (
  id TEXT PRIMARY KEY,
  thread_ts TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  group_folder TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending | approved | created | cancelled
  jira_key TEXT,                  -- e.g., 'DEVOPS-123' after creation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Decision 4: Action handlers registered on the shared Bolt App instance

Slack Bolt's `app.action()` handlers register on the same `App` instance used for messages. Since `SlackChannel` already owns the `App`, action handlers are registered during `setupEventHandlers()`. The handlers call into orchestrator-provided callbacks (same pattern as `onMessage`).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Slack API | `@slack/bolt` Socket Mode (existing) + `app.action()` handlers (new) | Socket Mode handles both events and interactive payloads over the same WebSocket. No HTTP endpoint needed. |
| Jira Cloud | `jira.js` library (Version3Client) via REST API v3 | Basic auth (email + API token). Token stored in `.env`, read by Jira client on host. |
| Anthropic API | Credential proxy (existing, unchanged) | Container agents connect through proxy as before. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| SlackChannel <-> Orchestrator | Callbacks: `onMessage`, `onAction` (new) | Action callback provides button value (draftId) + user context |
| Orchestrator <-> Container | stdin JSON (ContainerInput) + IPC files (ContainerOutput, actions) | Extended ContainerInput includes `threadTs` and `draftContext` fields |
| Orchestrator <-> Jira Client | Direct function call (same process) | `JiraClient.createIssue(draft)` returns issue key and URL |
| Container <-> IPC | File-based: `actions/{ts}.json` alongside existing `messages/` and `tasks/` | New action type `jira_create` with structured draft payload |

## Build Order (Dependencies)

The following build order respects component dependencies:

### Phase 1: Thread-Aware Conversation Foundation
**Build:** Thread routing in SlackChannel + thread-scoped container sessions
**Why first:** Everything else depends on multi-turn threaded conversation working correctly. Without thread routing, the agent cannot have a multi-turn draft collection conversation.
**Components:** SlackChannel thread_ts extraction, ContainerInput extension, message loop thread routing

### Phase 2: Container Agent for Draft Collection
**Build:** Container-side conversation logic + structured draft output via IPC actions
**Why second:** The agent needs to collect information and produce a structured output before we can preview or approve anything.
**Components:** Agent prompt/instructions, IPC action protocol, draft JSON schema

### Phase 3: Jira Client + Draft Persistence
**Build:** Jira REST API client, SQLite draft table, Block Kit preview builder
**Why third:** Once the agent can produce drafts, we need to store them and present them. Jira client can be tested independently with the API.
**Components:** `src/jira/client.ts`, `src/jira/blocks.ts`, `src/jira/types.ts`, DB migration for `jira_drafts`

### Phase 4: Interactive Approval Flow
**Build:** Slack action handlers (approve/edit buttons), message update on approval, Jira creation on approve
**Why last:** This ties everything together. Requires all previous components to be working.
**Components:** `src/channels/slack-actions.ts`, action callback wiring, approval→Jira creation flow, confirmation message

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 concurrent requests | Current architecture handles fine. Single Jira client, SQLite drafts, sequential API calls. |
| 10-50 concurrent requests | Jira API rate limits become relevant (basic auth: ~100 req/min). Add request queuing in Jira client. |
| 50+ concurrent requests | SQLite write contention on drafts table. Consider WAL mode (already used by better-sqlite3). Jira client needs connection pooling. |

### Scaling Priorities

1. **First bottleneck:** Container concurrency (MAX_CONCURRENT_CONTAINERS=5). Multiple users drafting simultaneously will queue. Increase limit or reduce container lifetime for short Jira conversations.
2. **Second bottleneck:** Jira API rate limits. Basic auth has lower limits than OAuth 2.0. If scaling, switch to OAuth 2.0 (3-legged) for higher rate limits.

## Anti-Patterns

### Anti-Pattern 1: Jira API Calls Inside Containers

**What people do:** Give the container agent a Jira MCP tool so it can create issues directly.
**Why it's wrong:** Breaks NanoClaw's security model. Containers are sandboxed and credential-free. Injecting Jira tokens means a compromised agent prompt could exfiltrate or misuse credentials.
**Do this instead:** Container outputs structured intent via IPC; orchestrator executes the API call with credentials.

### Anti-Pattern 2: Storing Draft State in Container Memory Only

**What people do:** Keep the Jira draft as conversation context inside the Claude agent session, relying on session continuity.
**Why it's wrong:** Container sessions are ephemeral. If the container times out, crashes, or the orchestrator restarts, the draft is lost. The user has to start over.
**Do this instead:** Persist drafts to SQLite keyed by thread_ts. Reload draft context into container input on each invocation.

### Anti-Pattern 3: Using HTTP Endpoints for Slack Interactive Components

**What people do:** Set up an Express server with a public URL to receive Slack interactive payloads.
**Why it's wrong:** NanoClaw uses Socket Mode specifically to avoid exposing public HTTP endpoints. Adding an HTTP listener breaks this pattern and requires ngrok/tunneling in development.
**Do this instead:** Socket Mode handles interactive payloads (button clicks) over the same WebSocket. Use `app.action()` in Bolt -- it works identically in Socket Mode.

### Anti-Pattern 4: One Container Per Button Click

**What people do:** Spawn a container agent to handle the "Approve" button click.
**Why it's wrong:** Approval is a deterministic action (call Jira API with stored draft). No AI reasoning needed. Spawning a container wastes resources and adds 5-10s latency.
**Do this instead:** Handle approve/edit directly in the orchestrator's action handler. Only spawn a container for the "Edit" flow when the user provides new input that requires AI processing.

## Sources

- [Slack Bolt for JavaScript - Actions](https://docs.slack.dev/tools/bolt-js/concepts/actions/) - Official Bolt action handler documentation
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/) - Block Kit and thread_ts usage
- [Jira REST API v3 - Create Issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) - Official Atlassian API docs
- [jira.js Library](https://github.com/MrRefactoring/jira.js) - TypeScript Jira client (recommended)
- [Slack Block Kit Interactive Messages](https://api.slack.com/automation/interactive-messages) - Interactive component patterns
- NanoClaw codebase: `src/channels/slack.ts`, `src/ipc.ts`, `src/container-runner.ts`, `src/types.ts`

---
*Architecture research for: Slack-to-Jira DevOps automation agent*
*Researched: 2026-04-02*
