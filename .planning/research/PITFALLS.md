# Pitfalls Research

**Domain:** Slack-to-Jira DevOps automation agent (NanoClaw milestone)
**Researched:** 2026-04-02
**Confidence:** HIGH (Slack Bolt internals, NanoClaw architecture), MEDIUM (Jira API v3 specifics)

## Critical Pitfalls

### Pitfall 1: Slack Interactive Payloads Have No Registered Action Handler

**What goes wrong:**
You add Block Kit buttons (Approve/Edit) to a message via `chat.postMessage` with `blocks`, but never register `app.action('action_id')` handlers on the Bolt `App` instance. When a user clicks the button, Slack sends an interaction payload. Bolt has no matching listener, so after 3 seconds the `unhandledRequestHandler` fires and the user sees a timeout error ("This app didn't respond") in their Slack client. Worse, in Socket Mode this silently fails -- the payload is received but dropped.

**Why it happens:**
NanoClaw's current `SlackChannel` class only registers `app.event('message')`. It has zero interactive component infrastructure. Developers often add blocks to outbound messages (easy) without realizing that receiving the button click requires a completely separate listener registration path in Bolt. The Bolt `App` instance is currently private inside `SlackChannel`, so there is no way for external code to register action handlers without modifying the class.

**How to avoid:**
- Before sending any message with interactive blocks, ensure a corresponding `app.action(actionId)` handler is registered on the Bolt App.
- Call `await ack()` as the very first line of every action handler -- Slack requires acknowledgment within 3 seconds or it retries/errors.
- Expose an `onAction` registration mechanism from `SlackChannel` or refactor so the Bolt `App` is accessible for handler registration.
- Write an integration test that sends a simulated action payload and asserts `ack()` is called.

**Warning signs:**
- "This app didn't respond" errors in Slack when clicking buttons
- `unhandledRequestHandler` warnings in Bolt logs
- Button clicks appear in Slack's app activity log but produce no visible response

**Phase to address:**
Phase 1 (Slack interactive components) -- must be the foundational work before any buttons are sent.

---

### Pitfall 2: Thread Context Lost Between Container Invocations

**What goes wrong:**
The bot starts a conversation in a Slack thread (replying with `thread_ts`), but subsequent container agent invocations lose track of which thread the conversation belongs to. The agent replies to the channel instead of the thread, or starts a new thread. The multi-turn "interview" flow (collecting Jira fields) breaks because each container run is stateless.

**Why it happens:**
NanoClaw's current architecture spawns a fresh container per message batch. The `ContainerInput` contract (`src/types.ts`) has no `thread_ts` field. The current Slack channel flattens threaded replies into channel messages (line 82-83 in slack.ts: "Threaded replies are flattened into the channel conversation"). The `sendMessage` interface (`Channel.sendMessage(jid, text)`) has no way to specify a thread target. The conversation state (which thread, which fields are collected) must survive across multiple container invocations.

**How to avoid:**
- Extend `NewMessage` type to carry `thread_ts` metadata from Slack.
- Extend `Channel.sendMessage` or add a new method like `sendThreadReply(jid, threadTs, text, blocks?)` to support threaded responses.
- Store conversation state (thread_ts, collected fields, conversation phase) in SQLite or the group's session data, keyed by thread_ts.
- Pass thread context to the container agent so it knows it is continuing an existing conversation.

**Warning signs:**
- Bot replies appear in the channel instead of the thread
- Multiple threads created for the same Jira issue request
- Users complain they have to repeat information already provided

**Phase to address:**
Phase 1 (thread-based conversation) -- this is the architectural foundation everything else depends on.

---

### Pitfall 3: Jira API v3 Requires ADF, Not Plain Text Descriptions

**What goes wrong:**
The AI agent generates a plain text description for the Jira issue. The code sends it as a string in the `description` field of the create-issue payload. Jira REST API v3 rejects it with a 400 error because `description` must be in Atlassian Document Format (ADF) -- a structured JSON document format, not a string.

**Why it happens:**
Jira API v2 accepted plain text or wiki markup for descriptions. API v3 (which is the current Cloud API) requires ADF for all rich text fields. This is the single most common complaint in Atlassian developer forums. Developers discover this only at runtime because the API docs don't make it obvious until you read the field schema.

**How to avoid:**
- Always use ADF format for `description` and `comment` fields in v3. Minimum viable ADF:
  ```json
  {
    "type": "doc",
    "version": 1,
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Description here" }] }]
  }
  ```
- Build a simple `textToAdf(text: string)` utility that converts plain text (with newlines) into ADF paragraphs.
- Test issue creation against a real Jira Cloud instance early -- do not rely on mocks for the description format.

**Warning signs:**
- 400 errors from Jira with messages about invalid field format
- Issues created with empty descriptions
- Description field works in Postman (which may auto-convert) but fails from code

**Phase to address:**
Phase 2 (Jira API integration) -- must be addressed when implementing the create-issue call.

---

### Pitfall 4: Button Click Handler Runs After Container Has Exited

**What goes wrong:**
The AI agent sends a message with "Approve" and "Edit" buttons, then the container exits (NanoClaw containers are ephemeral per-invocation). When the user clicks "Approve" 30 seconds later, the action payload arrives at the Slack Bolt app in the orchestrator process, but there is no container running to process the Jira creation. The click is either dropped or triggers an error.

**Why it happens:**
NanoClaw's execution model is container-per-message-batch. The container runs, produces output, and exits. Interactive component clicks are asynchronous -- they arrive minutes or hours after the original message. The orchestrator (host process) must handle these clicks directly; they cannot be delegated to a container that no longer exists.

**How to avoid:**
- Handle button action callbacks in the orchestrator process (host-side Slack Bolt handlers), NOT inside containers.
- When the agent container produces a "draft ready" output, the orchestrator should: (1) store the draft data (title, description, type) in SQLite keyed by a unique interaction ID, (2) send the preview message with buttons whose `action_id` encodes the draft ID, (3) exit the container.
- When the button is clicked, the orchestrator's action handler retrieves the stored draft and calls the Jira API directly (or spawns a new short-lived container with the draft as input).

**Warning signs:**
- Button clicks produce no response or "app not responding"
- Trying to re-invoke a container from within an action handler and hitting race conditions
- Draft data lost between container exit and button click

**Phase to address:**
Phase 1 (architecture design) -- this is a fundamental architectural decision that must be made before any interactive component work.

---

### Pitfall 5: Slack App Missing OAuth Scopes for Interactive Components

**What goes wrong:**
The Slack app was originally configured for basic messaging (Socket Mode, `chat:write`, `channels:read`). Interactive components (buttons, modals) require the `interactivity` toggle to be enabled in the Slack app configuration. Without it, Slack never delivers action payloads to the app, and button clicks silently fail.

**Why it happens:**
NanoClaw's Slack skill was set up for message reading/writing only. Interactive components require: (1) enabling "Interactivity & Shortcuts" in the Slack app dashboard, (2) for Socket Mode this is simpler (no request URL needed), but the toggle must still be on. Additionally, `chat:write` allows posting messages with blocks, but receiving interaction payloads is gated by the interactivity toggle, not an OAuth scope -- making it easy to miss.

**How to avoid:**
- Document the required Slack app configuration changes as a prerequisite checklist.
- Before development starts, enable "Interactivity & Shortcuts" in the Slack app dashboard.
- Test with a minimal button message and handler before building the full flow.
- Add a startup check that logs whether interactive payloads are being received (e.g., register a test action and verify it fires).

**Warning signs:**
- Buttons render correctly in messages but clicks produce no server-side logs at all
- `app.action()` handlers never fire
- Everything works in the Slack Block Kit Builder preview but fails in the actual app

**Phase to address:**
Phase 0 (setup/prerequisites) -- must be verified before any development begins.

---

### Pitfall 6: AI Conversation Loop Never Converges

**What goes wrong:**
The AI agent keeps asking clarifying questions and never reaches the "draft ready" state. Or it asks redundant questions the user already answered. Or it generates a draft that doesn't match what the user described. The conversational form-filling flow is unbounded and frustrating.

**Why it happens:**
LLMs are naturally conversational and will keep asking questions if given a vague prompt. Without explicit state tracking (which fields are collected, which are missing, when to stop), the agent has no convergence criteria. Each container invocation gets the full message history but no structured state about what has been collected.

**How to avoid:**
- Define a finite state machine for the conversation: `COLLECTING -> DRAFTING -> REVIEWING -> APPROVED/EDITING`.
- Track collected fields explicitly (title: set/unset, description: set/unset, type: set/unset) in persistent state, not just in conversation history.
- Set a maximum of 3-4 back-and-forth exchanges before forcing a draft with whatever is available plus sensible defaults.
- Include convergence instructions in the agent's system prompt: "After collecting title and description, immediately present a draft. Do not ask more than 3 questions total."

**Warning signs:**
- Users abandoning threads without creating issues
- Threads with 10+ messages before a draft appears
- Agent asking for information already provided in earlier messages

**Phase to address:**
Phase 2 (AI conversation flow) -- must be addressed in prompt engineering and state machine design.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing draft data in memory (Map) instead of SQLite | Faster to implement | Lost on process restart, button clicks fail after restart | Never -- NanoClaw is a long-running service that restarts |
| Hardcoding Jira project key in code | Quick MVP | Cannot change project without code change and redeploy | MVP only, move to config within same phase |
| Plain text only (no ADF rich formatting) | Simpler description generation | Issues have poor formatting, no headings/lists/links | MVP acceptable, plan ADF builder for next iteration |
| Single-channel assumption (one Slack workspace) | Simpler routing | Cannot support multi-workspace without refactor | Acceptable for v1, matches PROJECT.md scope |
| Polling-based IPC for action responses | Uses existing NanoClaw pattern | Latency on button clicks (up to 1s poll interval) | Only if action handler runs in orchestrator (preferred) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Slack Block Kit | Sending blocks without `text` fallback | Always include top-level `text` field for notifications and accessibility (screen readers only see `text`, not blocks) |
| Slack Block Kit | Using legacy attachment actions instead of Block Kit | Use Block Kit `actions` blocks with `button` elements. Legacy attachments are deprecated. |
| Slack threading | Using `say()` in action handler without `thread_ts` | Extract `thread_ts` from the action payload's `message.ts` or `message.thread_ts` and pass it explicitly |
| Jira Cloud API | Using API v2 endpoints for Cloud | Jira Cloud requires v3. v2 endpoints are being deprecated. Some search endpoints already removed. |
| Jira issue types | Hardcoding issue type IDs | Issue type IDs differ across Jira projects and instances. Use `GET /rest/api/3/issuetype` to discover valid types at runtime or config time. |
| Jira auth | Storing API token in `.env` alongside bot tokens | Use NanoClaw's credential proxy pattern. Jira token should be managed the same way as other secrets. |
| Slack `ack()` | Doing async work before calling `ack()` | Call `ack()` immediately, then do async work. Slack's 3-second timeout is strict. |
| Slack ephemeral messages | Sending draft preview as ephemeral then trying to update it | Ephemeral messages cannot be updated via `chat.update`. Either use a regular message (visible to channel) or use `response_url` from the action payload to replace. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Spawning a container for every button click | 5-10 second latency on approve/edit actions | Handle button actions in orchestrator process, only spawn container for edit flow | Immediately noticeable at any scale |
| Fetching Jira project metadata on every issue creation | Slow draft generation, API rate limits | Cache project metadata (issue types, required fields) with TTL of 1 hour | 10+ concurrent users creating issues |
| Loading full thread history for each agent invocation | Slow container startup, token limit exceeded | Cap thread history to last N messages (e.g., 20), summarize older context | Threads with 50+ messages |
| Slack `users.info` call per message for name resolution | Rate limited at scale (Slack Tier 4: 100+ per min) | Already cached in `SlackChannel.userNameCache` (good), ensure cache persists across method calls | 100+ active users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Jira API token exposed in container environment | Token leaked via agent, used to access/modify any Jira data | Route Jira API calls through credential proxy or orchestrator-side handler. Never pass Jira token to container. |
| No validation of button click user identity | Any channel member can approve another user's Jira draft | Check `body.user.id` in action handler matches the original requester (or an authorized approver) |
| AI agent injecting arbitrary Jira fields via prompt injection | Malicious user crafts message that tricks AI into setting unintended fields (priority, assignee, labels) | Validate all Jira fields against an allowlist before API call. v1 only allows title/description/type. |
| Draft data tamperable via action_id encoding | If draft ID is predictable, another user could craft a payload to approve a different draft | Use cryptographically random draft IDs (UUID v4), validate draft ownership on action |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Bot responds in channel instead of thread | Channel gets noisy, conversation context lost | Always use `thread_ts` for all bot responses after initial mention |
| No loading indicator after button click | User thinks click didn't register, clicks repeatedly | Call `ack()` immediately and update the message to show "Creating issue..." state before doing async Jira call |
| Draft preview is plain text wall | Hard to review, users approve without reading | Use Block Kit formatting: bold title, indented description, issue type as a tag/badge |
| No way to cancel mid-conversation | User stuck in a conversation they don't want to finish | Support "cancel" or "nevermind" keywords to abort the flow and clean up state |
| Edit flow restarts entire conversation | User only wanted to change the title, now re-answering all questions | Allow targeted edits: "change the title to X" without re-collecting other fields |
| Success message lacks Jira link | User has to go find the issue manually | Always include clickable Jira issue URL (e.g., `https://your-domain.atlassian.net/browse/PROJ-123`) in the confirmation message |

## "Looks Done But Isn't" Checklist

- [ ] **Thread replies:** Bot always replies in thread -- verify by checking `thread_ts` is set on every `chat.postMessage` call after the initial trigger
- [ ] **Button ack:** Every `app.action()` handler calls `ack()` before any async work -- verify with Slack's "test interaction" or by checking no timeout errors in logs
- [ ] **ADF descriptions:** Jira issues have properly formatted descriptions -- verify by viewing a created issue in Jira UI (not just checking API response)
- [ ] **Error handling on Jira 4xx:** When Jira rejects the issue (missing required field, invalid type), the bot reports the error in-thread -- verify by sending an invalid issue type
- [ ] **Process restart resilience:** After NanoClaw restarts, pending drafts (with buttons already sent) still work when clicked -- verify by restarting service and clicking a previously sent button
- [ ] **Concurrent conversations:** Two users start Jira issue creation in different threads simultaneously -- verify both complete independently without cross-contamination
- [ ] **Slack app permissions:** Interactivity toggle is enabled and action payloads are received -- verify before writing any handler code
- [ ] **Message length:** Long AI-generated descriptions don't exceed Slack's 4000-char limit in preview messages -- verify with a verbose description

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| No action handlers registered | LOW | Add `app.action()` registrations and redeploy. No data loss. |
| Thread context lost | MEDIUM | Refactor `sendMessage` to support `thread_ts`. Requires changes to `Channel` interface, `SlackChannel`, `IPC`, and `router`. |
| Plain text sent to Jira v3 description | LOW | Add `textToAdf()` wrapper. Existing issues can be manually fixed in Jira. |
| Button clicks lost after container exit | HIGH | Requires architectural decision: orchestrator-side action handling + SQLite draft storage. Fundamental flow change. |
| AI conversation never converges | MEDIUM | Add state machine and convergence prompt. Requires prompt re-engineering and state persistence. |
| Jira token exposed in container | HIGH | Rotate token immediately. Refactor to proxy pattern. Audit container logs for token exposure. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Slack app missing interactivity toggle | Phase 0 (Prerequisites) | Action payload received in test handler |
| No action handler registered | Phase 1 (Interactive components) | Button click triggers handler, `ack()` confirmed |
| Thread context lost | Phase 1 (Thread architecture) | Bot replies appear in correct thread across multiple exchanges |
| Button click after container exit | Phase 1 (Architecture) | Draft stored in SQLite, button click works 10 min after container exit |
| ADF format for Jira descriptions | Phase 2 (Jira integration) | Issue created with formatted description visible in Jira UI |
| AI conversation never converges | Phase 2 (Conversation flow) | Issue draft produced within 3-4 exchanges in test scenarios |
| Jira token security | Phase 2 (Jira integration) | Token never appears in container env, logs, or agent context |
| No validation of button click user | Phase 3 (Hardening) | Unauthorized user click is rejected with message |

## Sources

- [Slack Block Kit documentation](https://docs.slack.dev/block-kit/)
- [Slack interactive components reference](https://api.slack.com/reference/block-kit/interactive-components)
- [Slack Bolt action handlers](https://docs.slack.dev/tools/bolt-js/concepts/actions/)
- [Slack Bolt unhandled request timeout (Issue #1402)](https://github.com/slackapi/bolt-js/issues/1402)
- [Slack Bolt operation_timeout (Issue #1548)](https://github.com/slackapi/bolt-js/issues/1548)
- [Slack threading documentation](https://api.slack.com/docs/message-threading)
- [Slack modifying messages](https://docs.slack.dev/messaging/modifying-messages/)
- [Jira REST API v3 - Create Issue](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Jira ADF description field community thread](https://community.developer.atlassian.com/t/jira-rest-api-description-field/60902)
- [Jira basic auth for REST APIs](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)
- [Jira OAuth 2.0 (3LO)](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
- NanoClaw codebase analysis: `src/channels/slack.ts`, `src/ipc.ts`, `src/types.ts`

---
*Pitfalls research for: Slack-to-Jira DevOps automation agent*
*Researched: 2026-04-02*
