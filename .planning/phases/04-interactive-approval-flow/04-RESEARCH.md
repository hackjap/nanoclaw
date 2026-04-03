# Phase 04: Interactive Approval Flow - Research

**Researched:** 2026-04-03
**Domain:** Slack Block Kit interactive components, chat.update, reaction events, Jira draft approval workflow
**Confidence:** HIGH

## Summary

Phase 4 connects the pieces built in Phases 1-3 into a user-facing approval flow. The core work is: (1) building Block Kit preview messages from saved drafts, (2) wiring `draft_approve` and `draft_edit` action handlers via the existing `onAction()` registry, (3) using `chat.update` to mutate preview messages after approval or edit, (4) adding a `reaction_added` event handler for the `:jira:` emoji trigger, and (5) providing error feedback for all interactive component failures.

All foundational infrastructure already exists. The action routing system (`onAction`), Block Kit message sending (`SendMessageOptions.blocks`), draft CRUD (`saveDraft`/`getDraft`/`updateDraftStatus`), Jira client (`createJiraIssue`), and container agent re-invocation (`runContainerAgent` with `thread_ts`) are implemented and tested. The remaining work is orchestration logic -- connecting these pieces with specific handlers and Block Kit layouts.

**Primary recommendation:** Implement as two plans: (1) Block Kit preview builder + approve/edit action handlers + chat.update integration, (2) reaction_added emoji trigger + error feedback consolidation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Section block layout with label+value format for title/description/type. Approve/Edit buttons at bottom.
- **D-02:** Description truncated at 200 chars with "..." suffix. Full description visible after Jira creation.
- **D-03:** Edit button re-invokes container agent with existing draft as context. Agent asks "which field to modify".
- **D-04:** After edit completes, update existing preview message via `chat.update`. Keep buttons. Keep thread clean.
- **D-05:** `:jira:` emoji reaction extracts message content as context, starts AI conversation (same as Phase 2 flow).
- **D-06:** Emoji reaction open to all channel members. No permission control in v1.
- **D-07:** Approve success: update preview message to "completed" state + Jira link. Remove buttons.
- **D-08:** Approve failure: post error reply in thread. Keep buttons for retry.

### Claude's Discretion
- Block Kit builder function implementation details
- `app.event('reaction_added')` handler registration location and structure
- Edit conversation agent CLAUDE.md prompt design
- Loading state during approval processing (e.g., "Creating..." temporary message)
- Error message wording (apply Phase 3 D-12/D-13 error classification patterns)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLCK-05 | :jira: emoji reaction triggers ticket creation from message content | `app.event('reaction_added')` handler + `conversations.history` to fetch message text |
| DRFT-01 | Block Kit preview of draft in thread | Section blocks with mrkdwn text + actions block with buttons |
| DRFT-02 | Approve/Edit buttons on preview | Actions block with `draft_approve` (primary) and `draft_edit` button elements |
| DRFT-03 | Approve button creates Jira issue | `onAction('draft_approve')` handler calling `getDraft` + `createJiraIssue` + `chat.update` |
| DRFT-04 | Edit button re-invokes agent for field modification | `onAction('draft_edit')` handler calling `getDraft` + `runContainerAgent` with draft context |
| NOTF-01 | Confirmation with Jira link after creation | `chat.update` replaces preview with success state including `<url\|PROJ-123>` link |
| ERRH-02 | Interactive component errors shown to user | Try-catch in action handlers, error reply in thread, buttons preserved for retry |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @slack/bolt | 4.6.0 | Slack app framework (already installed) | Provides `app.event()`, `app.action()`, `app.client.chat.update` |
| @slack/types | 2.20.1 | Block Kit type definitions (already installed) | Type-safe block construction |
| better-sqlite3 | 11.10.0 | Draft persistence (already installed) | `jira_drafts` table with status transitions |
| jira.js | 5.3.1 | Jira issue creation (already installed) | `createJiraIssue()` already implemented |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.2 | Test runner (already installed) | All unit tests for handlers and builders |

### Alternatives Considered
None -- all libraries are already installed and in use. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  channels/
    slack.ts              # Add: reaction_added handler, chat.update helper, expose app.client
  approval-flow.ts        # NEW: Block Kit builder, approve handler, edit handler, emoji handler
  jira-client.ts          # Existing: createJiraIssue() (no changes)
  db.ts                   # Existing: saveDraft/getDraft/updateDraftStatus (no changes)
  ipc.ts                  # Modify: after saveDraft, trigger Block Kit preview send
  types.ts                # Existing: JiraDraft, SendMessageOptions (no changes)
```

### Pattern 1: Approval Flow Module
**What:** A single `approval-flow.ts` module that exports all approval-related functions: block builder, approve handler, edit handler, emoji trigger handler.
**When to use:** This consolidates all Phase 4 orchestration logic in one place, keeping `slack.ts` focused on transport.
**Example:**
```typescript
// Source: Project convention -- one domain per file
export function buildDraftPreviewBlocks(draft: JiraDraftData, threadTs: string): unknown[] {
  const descriptionText = draft.description.length > 200
    ? draft.description.slice(0, 200) + '...'
    : draft.description;

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira 이슈 초안*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*제목:*\n${draft.title}` },
        { type: 'mrkdwn', text: `*타입:*\n${draft.issueType}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*설명:*\n${descriptionText}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'draft_approve',
          style: 'primary',
          value: threadTs,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'draft_edit',
          value: threadTs,
        },
      ],
    },
  ];
}
```

### Pattern 2: chat.update for State Transitions
**What:** Use `app.client.chat.update` to mutate the preview message instead of posting new messages.
**When to use:** After approve (remove buttons, show success), after edit (update fields, keep buttons).
**Example:**
```typescript
// Source: https://docs.slack.dev/reference/methods/chat.update
// D-07: On approve success, replace preview with confirmation
await app.client.chat.update({
  channel: channelId,
  ts: previewMessageTs,    // ts of the Block Kit preview message
  text: `Jira 이슈가 생성되었습니다: ${result.key}`,
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira 이슈 생성 완료*\n<${result.url}|${result.key}> - ${draft.title}`,
      },
    },
  ],
});
```

### Pattern 3: Action Handler with Body Extraction
**What:** Extract thread_ts, channel, and message ts from the action `body` object.
**When to use:** In `draft_approve` and `draft_edit` handlers to identify which draft and where to respond.
**Example:**
```typescript
// Source: https://docs.slack.dev/tools/bolt-js/concepts/actions
// body.message.ts = ts of the message containing the button
// body.channel.id = channel where button was clicked
// action.value = threadTs (draft lookup key)
channel.onAction('draft_approve', async ({ action, body }) => {
  const threadTs = action.value as string;
  const channelId = (body as any).channel?.id;
  const previewMessageTs = (body as any).message?.ts;
  // ... handler logic
});
```

### Pattern 4: Reaction Event Handler
**What:** Register `app.event('reaction_added')` to detect `:jira:` emoji and start ticket flow.
**When to use:** SLCK-05 emoji trigger requirement.
**Example:**
```typescript
// Source: https://docs.slack.dev/reference/events/reaction_added
// Required scope: reactions:read (must be added to Slack app config)
this.app.event('reaction_added', async ({ event }) => {
  if (event.reaction !== 'jira') return;
  if (event.item.type !== 'message') return;

  const channel = event.item.channel;
  const messageTs = event.item.ts;

  // Fetch the reacted-to message content
  const result = await this.app.client.conversations.history({
    channel,
    latest: messageTs,
    inclusive: true,
    limit: 1,
  });

  const messageText = result.messages?.[0]?.text;
  if (!messageText) return;

  // Trigger AI conversation with this message as context
  // ... enqueue for container agent processing
});
```

### Anti-Patterns to Avoid
- **Posting new messages instead of updating:** D-04 and D-07 explicitly require `chat.update` to keep threads clean. Never post a new message where an update is expected.
- **Storing preview message ts in memory only:** The preview message `ts` must be persisted (in `jira_drafts` table or derived from `thread_ts`) so it survives process restarts between button click and draft creation.
- **Blocking ack() with heavy work:** The 3-second Slack timeout means approve handler must ack immediately, then do Jira creation asynchronously. The existing catch-all pattern already handles this.
- **Forgetting to handle the "message not found" case for chat.update:** If the preview message was deleted, `chat.update` will fail. Fall back to posting a new message.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Block Kit JSON structure | Manual JSON object construction | Builder functions returning typed blocks | Typos in block structure cause silent failures |
| Draft lookup on button click | Parsing message text to reconstruct draft | `getDraft(threadTs)` from SQLite | Draft data is already persisted; message text is truncated |
| Jira issue creation | Direct HTTP calls to Jira API | `createJiraIssue()` from `jira-client.ts` | Already handles ADF conversion, retry, error classification |
| Error classification | Ad-hoc error message strings | `classifyError()` from `jira-client.ts` | Already categorizes auth/api/network with Korean messages |
| Action routing | Custom if/else in message handler | `onAction(actionId, handler)` registry | Already implemented with ack-before-handler pattern |

## Common Pitfalls

### Pitfall 1: Preview Message ts Not Stored
**What goes wrong:** After posting the Block Kit preview, the `ts` of that message is needed for `chat.update`. If not stored, cannot update the preview later.
**Why it happens:** `saveDraft` stores `thread_ts` (the conversation thread) but the preview message has its own `ts`.
**How to avoid:** After `chat.postMessage` returns the preview, store its `ts` alongside the draft. Either add a `preview_ts` column to `jira_drafts` or use the return value of `sendMessage`. Alternatively, pass `thread_ts` as `action.value` and the `body.message.ts` as preview ts in the action handler.
**Warning signs:** `chat.update` calls failing with `message_not_found`.

### Pitfall 2: Slack 3-Second ack() Timeout
**What goes wrong:** If approve handler does Jira creation before acking, Slack shows "This request has expired".
**Why it happens:** Jira API calls can take 1-5 seconds, exceeding Slack's 3-second window.
**How to avoid:** The existing catch-all pattern already calls `ack()` first. Ensure approve/edit handlers do not call `ack()` again (it is already called). All heavy work runs after ack.
**Warning signs:** "This request has expired" error in Slack UI.

### Pitfall 3: reactions:read Scope Missing
**What goes wrong:** `reaction_added` events never arrive because the Slack app lacks the `reactions:read` scope.
**Why it happens:** Phase 1 configured scopes for messaging but not reactions.
**How to avoid:** Document the required scope addition as a setup prerequisite. The Slack app config must include `reactions:read` scope AND subscribe to the `reaction_added` event in Event Subscriptions.
**Warning signs:** Handler registered but never fires.

### Pitfall 4: Race Condition on Double-Click
**What goes wrong:** User clicks Approve twice quickly, creating duplicate Jira issues.
**Why it happens:** Both clicks are acked and processed before the first completes.
**How to avoid:** Check `draft.status` before processing. Use `updateDraftStatus(threadTs, 'approved')` as a guard -- if status is already 'approved', skip. SQLite is synchronous/single-threaded so this is safe.
**Warning signs:** Duplicate Jira issues with same title.

### Pitfall 5: conversations.history Requires channels:history Scope
**What goes wrong:** Fetching the reacted-to message content fails because the bot lacks `channels:history` scope.
**Why it happens:** `conversations.history` needs either `channels:history` (public), `groups:history` (private), `mpim:history`, or `im:history`.
**How to avoid:** Verify the Slack app has `channels:history` and `groups:history` scopes (likely already present for the message event subscription).
**Warning signs:** `conversations.history` returns error `missing_scope`.

### Pitfall 6: Edit Flow Re-invocation Without Draft Context
**What goes wrong:** Container agent re-invoked for edit but has no context about the existing draft.
**Why it happens:** Draft data lives in orchestrator's SQLite, not in the container.
**How to avoid:** Pass the full draft JSON as part of the prompt when calling `runContainerAgent` for edit. The prompt should include the current title, description, and issue type so the agent knows what to modify.
**Warning signs:** Agent starts fresh collection instead of editing existing fields.

## Code Examples

### Block Kit Preview Builder
```typescript
// Build the draft preview blocks per D-01/D-02
export function buildDraftPreviewBlocks(
  draft: { title: string; description: string; issueType: string },
  threadTs: string,
): unknown[] {
  const descriptionText =
    draft.description.length > 200
      ? draft.description.slice(0, 200) + '...'
      : draft.description;

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Jira 이슈 초안*' },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*제목:*\n${draft.title}` },
        { type: 'mrkdwn', text: `*타입:*\n${draft.issueType}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*설명:*\n${descriptionText}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'draft_approve',
          style: 'primary',
          value: threadTs,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'draft_edit',
          value: threadTs,
        },
      ],
    },
  ];
}
```

### Approve Handler
```typescript
// D-03/D-07/D-08: Approve button handler
async function handleDraftApprove(
  payload: ActionPayload,
  deps: { getDraft: typeof getDraft; createJiraIssue: typeof createJiraIssue; updateDraftStatus: typeof updateDraftStatus },
): Promise<void> {
  const threadTs = payload.action.value as string;
  const channelId = (payload.body as any).channel?.id;
  const previewMessageTs = (payload.body as any).message?.ts;

  const draftRow = deps.getDraft(threadTs);
  if (!draftRow || draftRow.status !== 'draft') {
    logger.warn({ threadTs }, 'Draft not found or already processed');
    return;
  }

  // Guard against double-click (Pitfall 4)
  deps.updateDraftStatus(threadTs, 'approved');

  const draftData = JSON.parse(draftRow.draft) as JiraDraftData;
  const result = await deps.createJiraIssue(draftData);

  if ('key' in result) {
    // Success: update preview, remove buttons (D-07)
    deps.updateDraftStatus(threadTs, 'created');
    // ... chat.update with success blocks
  } else {
    // Failure: post error in thread, keep buttons (D-08)
    deps.updateDraftStatus(threadTs, 'draft'); // revert status for retry
    // ... post error reply
  }
}
```

### Reaction Handler Message Fetch
```typescript
// Source: https://docs.slack.dev/reference/methods/conversations.history
// SLCK-05: Fetch reacted-to message content
const result = await this.app.client.conversations.history({
  channel: event.item.channel,
  latest: event.item.ts,
  inclusive: true,
  limit: 1,
});
const messageText = result.messages?.[0]?.text || '';
```

### Success Confirmation Blocks (after Jira creation)
```typescript
// D-07: Replace preview with success confirmation
function buildSuccessBlocks(issueKey: string, issueUrl: string, title: string): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira 이슈 생성 완료*\n<${issueUrl}|${issueKey}> - ${title}`,
      },
    },
  ];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chat.update` with empty blocks removes all blocks | Still current | Stable | Use empty `blocks: []` to strip blocks when replacing with text-only |
| Slack interactive message responses via `response_url` | `chat.update` via Web API preferred for persistence | 2024+ | `response_url` expires after 30 min; `chat.update` is permanent |

## Open Questions

1. **Preview message ts storage**
   - What we know: `jira_drafts` stores `thread_ts` as PK. The preview message posted by the bot has a different `ts`.
   - What's unclear: Whether to add a `preview_ts` column or rely on `body.message.ts` from the action payload.
   - Recommendation: Use `body.message.ts` from the action payload -- it is always available when a button is clicked. No schema change needed. For the IPC-triggered preview send, capture the return value of `chat.postMessage` and store it if needed for edit flow updates.

2. **Reaction handler registration location**
   - What we know: `app.event('reaction_added')` must be registered on the Bolt app instance, which lives in `SlackChannel`.
   - What's unclear: Whether to register directly in SlackChannel or expose a callback pattern like `onAction`.
   - Recommendation: Add an `onReaction(emoji, handler)` method to `SlackChannel` mirroring the `onAction` pattern. This keeps the reaction handler logic in `approval-flow.ts` while the transport wiring stays in `slack.ts`.

3. **Edit flow: how to trigger container re-invocation from action handler**
   - What we know: `runAgent()` in `index.ts` handles container invocation with prompt, chatJid, and threadTs.
   - What's unclear: The edit action handler in `approval-flow.ts` needs access to the orchestrator's `runAgent` or equivalent.
   - Recommendation: Pass a callback function (like `onEditRequested(chatJid, threadTs, draftContext)`) when wiring up the approval flow. The orchestrator provides the callback that calls `queue.enqueueMessage()` or `runAgent()`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRFT-01 | Block Kit preview blocks built correctly from draft data | unit | `npx vitest run src/approval-flow.test.ts -t "preview blocks" -x` | Wave 0 |
| DRFT-02 | Preview includes Approve and Edit buttons with correct action_ids | unit | `npx vitest run src/approval-flow.test.ts -t "buttons" -x` | Wave 0 |
| DRFT-03 | Approve handler: getDraft + createJiraIssue + chat.update + status transition | unit | `npx vitest run src/approval-flow.test.ts -t "approve" -x` | Wave 0 |
| DRFT-04 | Edit handler: getDraft + re-invoke agent with draft context | unit | `npx vitest run src/approval-flow.test.ts -t "edit" -x` | Wave 0 |
| SLCK-05 | Reaction handler: filter :jira:, fetch message, start flow | unit | `npx vitest run src/approval-flow.test.ts -t "reaction" -x` | Wave 0 |
| NOTF-01 | Success confirmation with Jira link replaces preview | unit | `npx vitest run src/approval-flow.test.ts -t "confirmation" -x` | Wave 0 |
| ERRH-02 | Error feedback posted in thread, buttons preserved | unit | `npx vitest run src/approval-flow.test.ts -t "error" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/approval-flow.test.ts -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/approval-flow.test.ts` -- covers DRFT-01 through ERRH-02 (all new handlers and builders)
- [ ] Test fixtures for JiraDraft mock data, ActionPayload mock structures

## Sources

### Primary (HIGH confidence)
- `src/channels/slack.ts` -- existing SlackChannel implementation with onAction registry
- `src/channels/slack.test.ts` lines 963-1070 -- existing test patterns for draft_approve/draft_edit actions
- `src/db.ts` lines 596-628 -- saveDraft/getDraft/updateDraftStatus implementation
- `src/jira-client.ts` -- createJiraIssue with error classification
- `src/ipc.ts` lines 152-186 -- actions/ IPC handling with jira_draft type
- `src/container-runner.ts` -- ContainerInput interface with thread_ts
- [Slack reaction_added event](https://docs.slack.dev/reference/events/reaction_added) -- event payload structure
- [Slack chat.update method](https://docs.slack.dev/reference/methods/chat.update) -- block update/removal semantics
- [Slack conversations.history](https://docs.slack.dev/reference/methods/conversations.history) -- fetch single message by ts

### Secondary (MEDIUM confidence)
- [Slack Bolt actions guide](https://docs.slack.dev/tools/bolt-js/concepts/actions/) -- body.message.ts and body.channel.id extraction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- all integration points already exist, just need orchestration
- Pitfalls: HIGH -- based on direct code reading and official Slack API docs

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable -- all APIs are mature)
