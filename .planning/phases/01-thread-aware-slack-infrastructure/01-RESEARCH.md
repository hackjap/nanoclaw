# Phase 1: Thread-Aware Slack Infrastructure - Research

**Researched:** 2026-04-02
**Domain:** Slack Bolt thread handling, Block Kit messaging, interactive components
**Confidence:** HIGH

## Summary

Phase 1 transforms NanoClaw's Slack channel from a thread-flattening model to a thread-aware model, adds Block Kit structured messaging, and builds interactive component (button) infrastructure. The existing `@slack/bolt` 4.6.0 installation already contains everything needed -- no new dependencies are required. The `GenericMessageEvent` type already exposes `thread_ts`, and `chat.postMessage` natively accepts both `thread_ts` and `blocks` parameters.

The core work is: (1) remove the thread-flattening behavior in `slack.ts` and propagate `thread_ts` through `NewMessage` and the IPC/container pipeline, (2) extend `Channel.sendMessage` with an optional options parameter for thread_ts and blocks, (3) register `app.action()` handlers within `SlackChannel` using a callback registry pattern so the orchestrator can handle button clicks directly.

**Primary recommendation:** Use the existing `@slack/bolt` 4.6.0 APIs -- `chat.postMessage({ thread_ts, blocks })` for threaded Block Kit messages and `app.action(action_id, handler)` for interactive components. No new packages needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Remove thread flattening (slack.ts line 82-85). Add thread_ts field to NewMessage. Pass all thread replies with their thread_ts to the agent.
- **D-02:** Bot responses use thread_ts to reply within the same thread.
- **D-03:** Extend `Channel.sendMessage(jid, text)` signature with optional options object (`sendMessage(jid, text, options?)`). Options include thread_ts, blocks. Maintain backward compatibility for other channels.
- **D-04:** v1 supports buttons (actions block) only. No modals, dropdowns, or other interactive elements.
- **D-05:** Register `app.action()` handlers inside SlackChannel infrastructure.
- **D-06:** Button click events handled by the orchestrator (host process) directly. Containers may have exited, so async button events are NOT forwarded to containers.
- **D-07:** Provide a callback registry mechanism in SlackChannel for external action handler registration.

### Claude's Discretion
- Block Kit message builder implementation approach
- app.action() handler internal routing structure
- IPC protocol extension for thread context propagation
- Test strategy (extending existing slack.test.ts)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SLCK-01 | Bot replies to @mention in a thread (thread_ts support) | `GenericMessageEvent.thread_ts` already in @slack/types. `chat.postMessage({ thread_ts })` is native. Remove flattening logic at slack.ts:82-85, use message's `ts` as thread_ts for the reply. |
| SLCK-02 | Bot replies to follow-up thread messages within the same thread | Same thread_ts propagation. When `event.thread_ts` exists, pass it through NewMessage so the response uses the same thread_ts. |
| SLCK-03 | Interactive components infrastructure (app.action() handlers) | `app.action(action_id, handler)` built into Bolt 4.6.0. Requires ack() within 3 seconds. Callback registry pattern for external handler registration. |
| SLCK-04 | Block Kit formatted messages (sections, fields, action buttons) | `chat.postMessage({ blocks })` is native. Block Kit section, actions, header, divider blocks available. Buttons use type "button" within actions block. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @slack/bolt | 4.6.0 | Slack app framework (Socket Mode, events, actions) | Already installed. Provides app.event(), app.action(), client.chat.postMessage() |
| @slack/types | 2.20.1 | TypeScript types for Slack events/blocks | Already installed. GenericMessageEvent includes thread_ts |
| @slack/web-api | 7.15.0 | Slack Web API client (transitive via bolt) | Already installed. chat.postMessage supports thread_ts + blocks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.0.18 | Test framework | Existing test infrastructure, extend slack.test.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw Block Kit JSON | slack-block-builder (npm) | Adds dependency; raw JSON is sufficient for v1 buttons+sections |
| Custom action router | Bolt's built-in action routing | Bolt already handles action_id matching; just wrap with registry pattern |

**Installation:**
No new packages needed. All dependencies already installed.

**Version verification:**
```
@slack/bolt: 4.6.0 (installed) = 4.6.0 (latest) -- current
@slack/types: 2.20.1 (installed) -- current
vitest: 4.0.18 (installed) -- current
```

## Architecture Patterns

### Change Impact Map
```
src/
├── types.ts             # Add thread_ts to NewMessage, add SendMessageOptions, extend Channel interface
├── channels/
│   ├── slack.ts         # Remove flattening, propagate thread_ts, add blocks/action support
│   └── slack.test.ts    # Extend with thread, Block Kit, action handler tests
├── ipc.ts               # Extend IpcDeps.sendMessage signature with options
├── container-runner.ts  # Add thread_ts to ContainerInput
├── router.ts            # Extend routeOutbound with options passthrough
└── index.ts             # Wire options through sendMessage callbacks
```

### Pattern 1: Optional Options Parameter (Backward Compatible)
**What:** Add an optional third parameter to `sendMessage` so existing channels ignore it.
**When to use:** Extending interfaces shared across multiple channel implementations.
**Example:**
```typescript
// In types.ts
export interface SendMessageOptions {
  thread_ts?: string;
  blocks?: Block[];  // @slack/types Block type
}

export interface Channel {
  // ... existing
  sendMessage(jid: string, text: string, options?: SendMessageOptions): Promise<void>;
}
```
**Source:** Decision D-03 from CONTEXT.md. Other channels (WhatsApp, Telegram) simply ignore the third argument.

### Pattern 2: Thread-Ts Propagation Through NewMessage
**What:** Add `thread_ts` to NewMessage so inbound thread context flows to the agent and back.
**When to use:** For SLCK-01 and SLCK-02 -- thread awareness requires knowing which thread a message belongs to.
**Example:**
```typescript
// In types.ts
export interface NewMessage {
  // ... existing fields
  thread_ts?: string;  // Slack thread parent timestamp, undefined for non-threaded messages
}
```
**Key logic in slack.ts event handler:**
```typescript
// When user @mentions bot in channel (no thread_ts): use msg.ts as the thread parent
// When user replies in thread (has thread_ts): use msg.thread_ts as the thread parent
const threadTs = msg.thread_ts || msg.ts;  // For response routing
```

### Pattern 3: Action Callback Registry
**What:** SlackChannel exposes a method to register external action handlers by action_id pattern.
**When to use:** D-06/D-07 -- orchestrator handles button clicks, not containers.
**Example:**
```typescript
// In slack.ts
type ActionHandler = (payload: ActionPayload) => Promise<void>;

export class SlackChannel implements Channel {
  private actionHandlers = new Map<string, ActionHandler>();

  onAction(actionId: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionId, handler);
  }

  private setupActionHandlers(): void {
    // Catch-all action handler that routes to registered callbacks
    this.app.action(/.+/, async ({ action, ack, body, respond }) => {
      await ack();  // Must ack within 3 seconds
      const handler = this.actionHandlers.get(action.action_id);
      if (handler) {
        await handler({ action, body, respond });
      } else {
        logger.warn({ actionId: action.action_id }, 'Unhandled action');
      }
    });
  }
}
```

### Pattern 4: Block Kit Message Construction
**What:** Helper function to build Block Kit JSON for structured messages.
**When to use:** SLCK-04 -- sending formatted messages with sections and buttons.
**Example:**
```typescript
// Block Kit section with button
const blocks = [
  {
    type: 'section' as const,
    text: { type: 'mrkdwn' as const, text: '*Draft Preview*\nTitle: Fix login bug' },
  },
  {
    type: 'actions' as const,
    elements: [
      {
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: 'Approve' },
        action_id: 'draft_approve',
        style: 'primary',
        value: JSON.stringify({ draftId: '123' }),
      },
      {
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: 'Edit' },
        action_id: 'draft_edit',
        value: JSON.stringify({ draftId: '123' }),
      },
    ],
  },
];

await this.app.client.chat.postMessage({
  channel: channelId,
  thread_ts: threadTs,
  blocks,
  text: 'Draft Preview: Fix login bug',  // Fallback for notifications
});
```

### Anti-Patterns to Avoid
- **Using reply's ts instead of parent ts for thread_ts:** Slack docs explicitly warn: "Avoid using a reply's ts value; use its parent instead." Always use the original thread_ts (the parent message ts).
- **Passing thread_ts as a number/float:** Must be a string. Passing a float will post to the channel but NOT thread correctly (silent failure).
- **Forgetting ack() in action handlers:** Slack expects acknowledgment within 3 seconds. Failing to ack causes timeout errors in the Slack client.
- **Sending blocks without text fallback:** The `text` field is "highly recommended" alongside `blocks` for accessibility and notification previews.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Action routing | Custom event emitter for interactive components | Bolt's `app.action(action_id, handler)` | Handles signature verification, payload parsing, ack protocol |
| Block Kit types | Manual TypeScript types for blocks | `@slack/types` Block types (already installed) | Complete, maintained, matches API exactly |
| Thread detection | Custom logic to determine if message is threaded | `event.thread_ts` field from GenericMessageEvent | Already provided by Slack's event payload |
| Socket Mode reconnection | Custom WebSocket management | Bolt's built-in Socket Mode | Handles reconnection, heartbeat, error recovery |

**Key insight:** @slack/bolt 4.6.0 handles all the Slack protocol complexity. The work is in wiring thread_ts through NanoClaw's own abstractions (NewMessage, Channel, IPC), not in Slack API interaction.

## Common Pitfalls

### Pitfall 1: Thread-Ts String Type
**What goes wrong:** Posting a message with thread_ts as a number instead of string silently fails to thread.
**Why it happens:** Slack ts values look like floats (`1704067200.000000`), tempting numeric handling.
**How to avoid:** TypeScript types enforce string. Always pass thread_ts as-is from the event object (already a string).
**Warning signs:** Messages appear in the channel instead of the thread.

### Pitfall 2: Ack Timeout in Action Handlers
**What goes wrong:** Slack shows "This app isn't responding" error to the user.
**Why it happens:** `ack()` not called within 3 seconds, or heavy processing before ack.
**How to avoid:** Always call `await ack()` as the FIRST line in every action handler. Do processing after.
**Warning signs:** Intermittent "request timeout" errors in Slack UI.

### Pitfall 3: Breaking Other Channels with Interface Change
**What goes wrong:** Adding required fields to Channel interface breaks WhatsApp/Telegram implementations.
**Why it happens:** Forgetting the optional `?` on new parameters.
**How to avoid:** `sendMessage(jid: string, text: string, options?: SendMessageOptions)` -- options is optional. Other channels simply ignore it.
**Warning signs:** TypeScript compilation errors in other channel files.

### Pitfall 4: Thread Parent vs Reply Ts Confusion
**What goes wrong:** Bot replies create new threads instead of continuing existing ones.
**Why it happens:** Using `msg.ts` (the reply's own timestamp) instead of `msg.thread_ts` (the parent).
**How to avoid:** For threaded replies, always use `msg.thread_ts`. For channel-level @mentions, use `msg.ts` as the new thread parent. Logic: `const replyThreadTs = msg.thread_ts || msg.ts`.
**Warning signs:** Each bot reply starts a new thread.

### Pitfall 5: Existing Test Expectations for Thread Flattening
**What goes wrong:** Tests that assert thread flattening behavior fail after the change.
**Why it happens:** `slack.test.ts` line 434 explicitly tests "flattens threaded replies into channel messages."
**How to avoid:** Update or replace this test with new thread-aware assertions. The test helper `createMessageEvent` already supports `threadTs` parameter.
**Warning signs:** Test failures in the existing "flattens threaded replies" test.

### Pitfall 6: IPC sendMessage Options Lost in Pipeline
**What goes wrong:** Thread context (thread_ts) not propagated through IPC, so container responses go to channel not thread.
**Why it happens:** Multiple layers (ipc.ts, index.ts, router.ts) all call `sendMessage(jid, text)` without options.
**How to avoid:** Trace the full sendMessage path: index.ts -> routeOutbound -> channel.sendMessage. Also ipc.ts sendMessage deps. All must pass options through.
**Warning signs:** Bot responds in the channel instead of the thread.

## Code Examples

### Example 1: Removing Thread Flattening and Adding thread_ts
```typescript
// Source: slack.ts event handler, replacing lines 82-85
// BEFORE (current):
// Threaded replies are flattened into the channel conversation.
// The agent sees them alongside channel-level messages; responses
// always go to the channel, not back into the thread.

// AFTER:
const threadTs = (msg as GenericMessageEvent).thread_ts;

// ... in onMessage call:
this.opts.onMessage(jid, {
  id: msg.ts,
  chat_jid: jid,
  sender: msg.user || msg.bot_id || '',
  sender_name: senderName,
  content,
  timestamp,
  is_from_me: isBotMessage,
  is_bot_message: isBotMessage,
  thread_ts: threadTs,  // NEW: thread context
});
```

### Example 2: Sending Threaded Block Kit Messages
```typescript
// Source: Slack API docs - chat.postMessage
async sendMessage(jid: string, text: string, options?: SendMessageOptions): Promise<void> {
  const channelId = jid.replace(/^slack:/, '');
  
  // ... connection check, queueing logic ...
  
  const params: Record<string, unknown> = {
    channel: channelId,
    text,
  };
  
  if (options?.thread_ts) {
    params.thread_ts = options.thread_ts;
  }
  if (options?.blocks) {
    params.blocks = options.blocks;
  }
  
  await this.app.client.chat.postMessage(params);
}
```

### Example 3: Action Handler Registration (Callback Registry)
```typescript
// Source: Slack Bolt docs - app.action()
// In SlackChannel constructor or setupEventHandlers:
this.app.action(/.+/, async ({ action, ack, body, respond }) => {
  await ack();  // MUST be first -- 3 second timeout
  
  const actionId = (action as { action_id: string }).action_id;
  const handler = this.actionHandlers.get(actionId);
  
  if (handler) {
    try {
      await handler({ action, body, respond });
    } catch (err) {
      logger.error({ actionId, err }, 'Action handler error');
    }
  } else {
    logger.warn({ actionId }, 'No handler registered for action');
  }
});
```

### Example 4: Determining Reply thread_ts
```typescript
// For SLCK-01: When bot is @mentioned in a channel (new thread)
// msg.thread_ts is undefined, use msg.ts as the thread parent for the reply
//
// For SLCK-02: When user sends follow-up in existing thread
// msg.thread_ts is the parent's ts, use it for the reply
//
// Combined logic:
const replyThreadTs = threadTs || msg.ts;
// This value should be stored and passed back when sending the response
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Thread flattening (current NanoClaw) | Thread-aware routing | This phase | Bot can hold threaded conversations |
| Text-only messages | Block Kit structured messages | Bolt 2.x+ | Rich formatting, interactive elements |
| Attachments API | Block Kit blocks | 2019 (Slack deprecated attachments for new features) | Must use blocks, not attachments |

**Deprecated/outdated:**
- `attachments` field in chat.postMessage: Still works but Slack recommends Block Kit `blocks` for all new development.
- `interactive_message` callback type: Replaced by Block Kit action handling via `app.action()`.

## Open Questions

1. **ContainerInput thread_ts propagation**
   - What we know: ContainerInput needs thread_ts so the agent can include it in IPC messages back to the orchestrator.
   - What's unclear: Whether the container's agent-runner needs to echo thread_ts in its IPC message files, or if the orchestrator should track thread_ts per active conversation.
   - Recommendation: Both. Pass thread_ts in ContainerInput for agent awareness. Orchestrator also tracks the mapping chatJid+thread_ts -> active conversation for the streaming output path (index.ts line 271).

2. **Block Kit message splitting**
   - What we know: Current code splits text messages at 4000 chars. Block Kit messages have different per-block limits.
   - What's unclear: Whether Block Kit messages should be split or if they should be sent as-is (blocks are self-contained).
   - Recommendation: Don't split Block Kit messages. When `options.blocks` is provided, send the blocks as a single message. The text splitting logic only applies to plain text messages. Block Kit messages are structured and should not be broken apart.

3. **Outgoing queue with options**
   - What we know: Current `outgoingQueue` stores `{ jid, text }`. Needs to also store options.
   - What's unclear: Whether queued messages with blocks should be stored or dropped.
   - Recommendation: Extend queue items to `{ jid, text, options? }`. All messages get the same queuing treatment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run src/channels/slack.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SLCK-01 | @mention reply goes to thread (uses thread_ts) | unit | `npx vitest run src/channels/slack.test.ts -t "thread"` | Partial (existing tests assert flattening -- must be updated) |
| SLCK-02 | Follow-up in thread gets threaded reply | unit | `npx vitest run src/channels/slack.test.ts -t "thread"` | Partial (createMessageEvent already has threadTs param) |
| SLCK-03 | app.action() handler receives button click | unit | `npx vitest run src/channels/slack.test.ts -t "action"` | New tests needed |
| SLCK-04 | Block Kit message sent with sections and buttons | unit | `npx vitest run src/channels/slack.test.ts -t "block"` | New tests needed |

### Sampling Rate
- **Per task commit:** `npx vitest run src/channels/slack.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update existing thread flattening tests in `slack.test.ts` to assert thread-aware behavior
- [ ] Add action handler tests (app.action mock, ack verification, callback registry)
- [ ] Add Block Kit sendMessage tests (blocks parameter passed to chat.postMessage)
- [ ] Add thread_ts propagation test (NewMessage includes thread_ts from event)
- [ ] Mock `app.action()` in MockApp class (currently only mocks `app.event()`)

## Sources

### Primary (HIGH confidence)
- @slack/types 2.20.1 type definitions -- `GenericMessageEvent.thread_ts: string | undefined` verified in node_modules
- @slack/bolt 4.6.0 installed and verified against npm registry (latest)
- Existing codebase: slack.ts, slack.test.ts, types.ts, ipc.ts, container-runner.ts, index.ts, router.ts

### Secondary (MEDIUM confidence)
- [Slack chat.postMessage API docs](https://docs.slack.dev/reference/methods/chat.postMessage/) -- thread_ts, blocks, text parameters
- [Slack Bolt actions docs](https://docs.slack.dev/tools/bolt-js/concepts/actions/) -- app.action() pattern, ack() requirement
- [Slack node-slack-sdk issue #780](https://github.com/slackapi/node-slack-sdk/issues/780) -- thread_ts must be string not float

### Tertiary (LOW confidence)
- None -- all findings verified against installed packages or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- verified installed package versions against npm registry
- Architecture: HIGH -- traced full sendMessage path through codebase, all integration points identified
- Pitfalls: HIGH -- thread_ts string type confirmed in @slack/types, ack timeout from official docs

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- @slack/bolt 4.6.0 is current, Slack API is mature)
