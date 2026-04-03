# Phase 5: Bot Liveness Reactions - Research

**Researched:** 2026-04-03
**Domain:** Slack reactions API, message lifecycle signaling
**Confidence:** HIGH

## Summary

This phase adds visual liveness feedback to the bot through Slack emoji reactions. When the bot receives a trigger (either @mention or :jira: emoji reaction), it immediately adds an eyes emoji to signal receipt, transitions through gear emoji during processing, and ends with checkmark or X on completion/failure. The Slack `reactions.add` and `reactions.remove` APIs are well-documented, rate-limited at Tier 3 (50+/min) and Tier 2 (20+/min) respectively, and both work with bot tokens requiring `reactions:write` scope.

The existing codebase already has the `onReaction` registry pattern from Phase 4 and direct access to the Bolt `app.client` for API calls. The main integration challenge is threading the reaction lifecycle through `src/index.ts` (message processing loop) and `src/container-runner.ts` (container execution lifecycle) without coupling the orchestrator to Slack-specific APIs.

**Primary recommendation:** Create a `StatusReaction` abstraction that wraps the eyes-to-gear-to-result transition, inject it at the orchestrator level in `processGroupMessages()`, and use the existing `SlackChannel.app.client` for `reactions.add`/`reactions.remove` calls. Keep error handling as log-and-continue (no throw on reaction failure).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Bot adds eyes emoji reaction immediately on trigger to signal "seen"
- **D-02:** All triggers (@mention, :jira: emoji reaction) get acknowledgement reaction
- **D-03:** Stage-based emoji transition: received(eyes) -> processing(gear) -> done(checkmark) or failed(X)
- **D-04:** Replace previous stage emoji (not cumulative) -- remove old, add new
- **D-05:** Long-running tasks also get a text status message in thread alongside emoji reactions

### Claude's Discretion
- Text message wording and timing threshold (how many seconds before showing text)
- Error handling for reaction add/remove failures (silent vs logged)
- Implementation location: SlackChannel methods vs standalone utility

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @slack/bolt | 4.3.0 | Already installed, provides `app.client.reactions.add/remove` | Project dependency, Slack's official SDK |

### Supporting
No new dependencies needed. All functionality is available through the existing `@slack/bolt` client.

**Installation:**
```bash
# No installation needed -- uses existing @slack/bolt
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  status-reactions.ts     # StatusReaction class: emoji lifecycle state machine
  channels/slack.ts       # New methods: addReaction(), removeReaction()
  index.ts                # Hook StatusReaction into processGroupMessages()
```

### Pattern 1: Forward-Only Emoji State Machine
**What:** A `StatusReaction` class that tracks current emoji state and provides `received()`, `processing()`, `completed()`, `failed()` methods. Each method removes the previous emoji and adds the new one. State only moves forward (received -> processing -> completed/failed).
**When to use:** Always -- prevents double-transition bugs and makes the lifecycle explicit.
**Example:**
```typescript
// Source: project pattern from add-reactions SKILL.md (status-tracker concept)
interface ReactionTarget {
  channel: string;  // Slack channel ID (without slack: prefix)
  timestamp: string; // Message ts to react on
}

type ReactionStage = 'idle' | 'received' | 'processing' | 'completed' | 'failed';

const STAGE_EMOJI: Record<Exclude<ReactionStage, 'idle'>, string> = {
  received: 'eyes',
  processing: 'gear',
  completed: 'white_check_mark',
  failed: 'x',
};

class StatusReaction {
  private currentStage: ReactionStage = 'idle';

  constructor(
    private target: ReactionTarget,
    private addReaction: (channel: string, ts: string, emoji: string) => Promise<void>,
    private removeReaction: (channel: string, ts: string, emoji: string) => Promise<void>,
  ) {}

  async received(): Promise<void> { /* transition idle -> received */ }
  async processing(): Promise<void> { /* transition received -> processing */ }
  async completed(): Promise<void> { /* transition processing -> completed */ }
  async failed(): Promise<void> { /* transition processing/received -> failed */ }
}
```

### Pattern 2: Channel-Level Reaction Methods
**What:** Add `addReaction(channelId, ts, emoji)` and `removeReaction(channelId, ts, emoji)` methods to `SlackChannel`, wrapping `app.client.reactions.add/remove` with error handling.
**When to use:** For all Slack reaction operations -- centralizes the API call and error handling.
**Example:**
```typescript
// In SlackChannel class
async addReaction(channelId: string, ts: string, emoji: string): Promise<void> {
  try {
    await this.app.client.reactions.add({
      channel: channelId,
      timestamp: ts,
      name: emoji,
    });
  } catch (err: unknown) {
    // already_reacted is not an error -- idempotent
    if ((err as any)?.data?.error === 'already_reacted') return;
    logger.warn({ channelId, ts, emoji, err }, 'Failed to add reaction');
  }
}

async removeReaction(channelId: string, ts: string, emoji: string): Promise<void> {
  try {
    await this.app.client.reactions.remove({
      channel: channelId,
      timestamp: ts,
      name: emoji,
    });
  } catch (err: unknown) {
    // no_reaction is not an error -- idempotent
    if ((err as any)?.data?.error === 'no_reaction') return;
    logger.warn({ channelId, ts, emoji, err }, 'Failed to remove reaction');
  }
}
```

### Pattern 3: Orchestrator Integration Points
**What:** Hook the StatusReaction into the message processing lifecycle in `processGroupMessages()`.
**When to use:** Three integration points in `src/index.ts`:
1. After trigger detection, before `runAgent()` -- call `statusReaction.received()`
2. Inside `runAgent()` streaming callback, on first output -- call `statusReaction.processing()`
3. After `runAgent()` completes -- call `statusReaction.completed()` or `statusReaction.failed()`
**Example:**
```typescript
// In processGroupMessages() around line 265
const statusReaction = new StatusReaction(
  { channel: chatJid.replace(/^slack:/, ''), timestamp: threadTs },
  (ch, ts, emoji) => slackChannel.addReaction(ch, ts, emoji),
  (ch, ts, emoji) => slackChannel.removeReaction(ch, ts, emoji),
);

await statusReaction.received();  // eyes emoji
// ...
const output = await runAgent(group, prompt, chatJid, threadTs, async (result) => {
  if (result.result) {
    await statusReaction.processing();  // gear emoji (only on first call)
    // ... existing output handling
  }
  // ...
});
// After runAgent
if (output === 'error' || hadError) {
  await statusReaction.failed();  // X emoji
} else {
  await statusReaction.completed();  // checkmark emoji
}
```

### Anti-Patterns to Avoid
- **Coupling reactions to SlackChannel event handlers:** Reactions should be driven by the orchestrator (which knows the lifecycle), not by the channel layer (which only sees messages).
- **Cumulative emoji:** D-04 explicitly says replace, not accumulate. Always remove the previous stage emoji before adding the new one.
- **Blocking on reaction failure:** Reaction API failures should never block message processing. Log and continue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Emoji reaction API calls | Raw HTTP fetch to Slack API | `app.client.reactions.add/remove` from @slack/bolt | Already available, handles auth, retries |
| State machine transitions | Ad-hoc if/else chains | Explicit forward-only state machine class | Prevents double-transition, testable |

## Common Pitfalls

### Pitfall 1: `already_reacted` Error
**What goes wrong:** Calling `reactions.add` when the bot already reacted with that emoji throws an error.
**Why it happens:** Race conditions, retries, or duplicate event processing.
**How to avoid:** Catch `already_reacted` error and treat as success (idempotent operation).
**Warning signs:** Error logs with `already_reacted` during normal operation.

### Pitfall 2: `no_reaction` Error on Remove
**What goes wrong:** Calling `reactions.remove` when the bot hasn't reacted with that emoji throws an error.
**Why it happens:** Remove called before add completes, or add failed silently.
**How to avoid:** Catch `no_reaction` error and treat as success (idempotent operation).
**Warning signs:** Error logs with `no_reaction` during stage transitions.

### Pitfall 3: Rate Limits on reactions.remove (Tier 2: 20+/min)
**What goes wrong:** `reactions.remove` has a lower rate limit (Tier 2: 20+/min) than `reactions.add` (Tier 3: 50+/min).
**Why it happens:** Each transition requires both a remove and an add, so with many concurrent messages, remove calls can accumulate.
**How to avoid:** The rate is per-workspace, and 20/min is generous for a single bot. But if needed, add a small delay between remove and add.
**Warning signs:** `ratelimited` errors from `reactions.remove`.

### Pitfall 4: Emoji Name Format
**What goes wrong:** Using wrong emoji names (e.g., `:eyes:` with colons, or unicode characters).
**Why it happens:** Slack API expects emoji names WITHOUT colons (e.g., `eyes` not `:eyes:`).
**How to avoid:** Use bare names: `eyes`, `gear`, `white_check_mark`, `x`.
**Warning signs:** `invalid_name` errors.

### Pitfall 5: reactions:write OAuth Scope
**What goes wrong:** Bot token lacks `reactions:write` scope, all reaction calls fail.
**Why it happens:** Slack app OAuth scopes weren't updated when adding this feature.
**How to avoid:** Verify the Slack app has `reactions:write` in its bot token scopes. This is a manual Slack app configuration step.
**Warning signs:** `missing_scope` errors on first reaction attempt.

### Pitfall 6: Non-Slack Channels
**What goes wrong:** StatusReaction is created for non-Slack channels that don't support reactions.
**Why it happens:** The orchestrator processes all channels, not just Slack.
**How to avoid:** Create StatusReaction only when the channel is a SlackChannel (check `channel.name === 'slack'` or `chatJid.startsWith('slack:')`). For other channels, use a no-op implementation.
**Warning signs:** TypeErrors when calling addReaction on non-Slack channel instances.

## Code Examples

### Slack reactions.add Call via Bolt
```typescript
// Source: https://docs.slack.dev/reference/methods/reactions.add/
// Verified: @slack/bolt app.client exposes all Slack Web API methods
await app.client.reactions.add({
  channel: 'C0123456789',
  timestamp: '1704067200.000000',
  name: 'eyes',  // NO colons
});
```

### Slack reactions.remove Call via Bolt
```typescript
// Source: https://docs.slack.dev/reference/methods/reactions.remove/
await app.client.reactions.remove({
  channel: 'C0123456789',
  timestamp: '1704067200.000000',
  name: 'eyes',
});
```

### Idempotent Error Handling Pattern
```typescript
// Source: project convention (see error handling in CLAUDE.md)
try {
  await app.client.reactions.add({ channel, timestamp: ts, name: emoji });
} catch (err: unknown) {
  const slackError = (err as any)?.data?.error;
  if (slackError === 'already_reacted') return; // idempotent
  logger.warn({ channel, ts, emoji, err }, 'Failed to add reaction');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom bot typing indicators | Emoji reactions for liveness | Current | Slack bots cannot send typing indicators; reactions are the standard UX pattern |

## Open Questions

1. **Text message timing threshold (D-05)**
   - What we know: Long-running tasks should get a text status message in thread
   - What's unclear: How many seconds before showing the text message
   - Recommendation: 10 seconds is a reasonable threshold -- if container hasn't produced output in 10s, post "Working on it..." in thread. This is Claude's discretion per CONTEXT.md.

2. **:jira: reaction trigger integration**
   - What we know: D-02 says all triggers get acknowledgement reactions, including :jira: emoji
   - What's unclear: The :jira: reaction flow starts in `approval-flow.ts` via `handleJiraReaction()`, which is separate from the main message loop
   - Recommendation: Add eyes reaction at the top of `handleJiraReaction()` before `fetchMessage()`, then transition through the flow. This may need its own StatusReaction instance.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | vitest implicit (package.json scripts) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Eyes emoji added on trigger | unit | `npx vitest run src/status-reactions.test.ts -x` | Wave 0 |
| D-02 | All trigger types get reaction | unit | `npx vitest run src/status-reactions.test.ts -x` | Wave 0 |
| D-03 | Stage transition eyes->gear->check/X | unit | `npx vitest run src/status-reactions.test.ts -x` | Wave 0 |
| D-04 | Previous emoji removed on transition | unit | `npx vitest run src/status-reactions.test.ts -x` | Wave 0 |
| D-05 | Text message on long-running task | unit | `npx vitest run src/status-reactions.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/status-reactions.test.ts` -- covers D-01 through D-05 (state machine, transition logic, error handling)
- [ ] Mock additions to `src/channels/slack.test.ts` -- covers addReaction/removeReaction methods

## Sources

### Primary (HIGH confidence)
- [Slack reactions.add API docs](https://docs.slack.dev/reference/methods/reactions.add/) -- parameters, scopes, rate limits, error codes
- [Slack reactions.remove API docs](https://docs.slack.dev/reference/methods/reactions.remove/) -- parameters, scopes, rate limits, error codes
- `src/channels/slack.ts` -- existing SlackChannel implementation, Bolt app client access pattern
- `src/index.ts` -- orchestrator message processing loop, integration points
- `src/approval-flow.ts` -- existing reaction handler pattern (onReaction registry)

### Secondary (MEDIUM confidence)
- `.claude/skills/add-reactions/SKILL.md` -- WhatsApp-focused reaction skill with status-tracker concept (not yet applied, but informs architecture)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, uses existing @slack/bolt
- Architecture: HIGH -- clear integration points in existing codebase, well-documented Slack API
- Pitfalls: HIGH -- Slack API error codes documented, common patterns well-known

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable APIs, no expected changes)
