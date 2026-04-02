# Feature Research

**Domain:** Slack-to-Jira DevOps automation (conversational AI ticket creation)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| @mention triggers thread conversation | Every Slack bot responds to mentions; users expect it. Without this, there is no entry point. | LOW | NanoClaw already translates `<@BOTID>` to trigger pattern. Need to scope response into the thread (reply with `thread_ts`) rather than channel root. |
| Conversational information gathering | The core value prop. AI asks clarifying questions (title, description, issue type) before creating anything. Users expect guided flow, not a dumb form. | MEDIUM | Claude Agent SDK handles the conversation. Need a system prompt that guides the agent to collect required Jira fields iteratively. |
| Issue draft preview before creation | Users universally expect to see what will be created before it happens. Every competing tool (Jira Cloud for Slack, IdeaLift, ClearFeed) shows a preview. | MEDIUM | Render a Block Kit message with sections for title, description, type. Must be visually scannable, not a wall of text. |
| Approve/Reject buttons | Interactive confirmation is the UX standard. Text-based "type yes to confirm" feels outdated and error-prone. Atlassian's own JSM Slack integration uses approve/decline buttons. | MEDIUM | Requires Slack interactive components: `app.action()` handler, Block Kit with `actions` block containing buttons. NanoClaw currently has zero interactive component support -- this is new infrastructure. |
| Jira issue creation via API | The actual deliverable. Call Jira REST API v3 to create the issue with collected fields (summary, description, issuetype). | MEDIUM | `POST /rest/api/3/issue`. Auth via API token through credential proxy. Fixed project key in v1. |
| Confirmation with Jira link | After creation, post the issue URL back to the thread. Every tool does this. Without it, users wonder "did it actually work?" | LOW | Extract `key` and `self` from Jira API response, format as clickable link in thread reply. |
| Thread-scoped conversation | Each request stays in its own thread. Channel noise is the number-one complaint about Jira Slack bots (notification spam). Thread isolation is expected. | MEDIUM | Current `slack.ts` flattens threads into channel. Must change to: (1) reply with `thread_ts` to keep conversation in thread, (2) track conversation state per thread. |
| Error handling with user feedback | When Jira API fails or fields are invalid, tell the user what went wrong in the thread. Silent failures are the worst UX. | LOW | Catch Jira API errors, translate common ones (permission denied, invalid project, required field missing) into human-readable messages. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-inferred issue type | Instead of asking "is this a bug or task?", the AI reads the conversation and suggests the type. Reduces back-and-forth from 3-4 messages to 1-2. Native Jira Slack app cannot do this. | LOW | Claude is good at classification. Add to system prompt: "Based on the description, suggest whether this is a Bug, Task, or Story. Let the user confirm or override." |
| Thread context summarization | When triggered mid-conversation, AI reads the full thread above the mention and pre-fills the issue description from that context. Competing tools like IdeaLift and eesel AI highlight this as a key differentiator over form-based approaches. | MEDIUM | Pass thread history to Claude agent as context. Agent extracts the actionable request and drafts description. Requires fetching thread messages via `conversations.replies`. |
| Edit-before-submit flow | After showing preview, user can say "change the title to X" conversationally instead of starting over. Most form-based tools force you to cancel and redo. | LOW | The conversational nature of Claude makes this nearly free. Agent updates the draft in memory and re-presents. Just needs clear system prompt instructions. |
| Rich Block Kit formatting | Use Block Kit sections, dividers, and fields for the preview instead of plain text. Looks professional, scannable. The native Jira app uses rich formatting. | LOW | Requires `sendMessage` to support Block Kit payloads (currently plain text only). Add a `sendBlocks` method or extend `sendMessage` signature. |
| Emoji-react trigger | In addition to @mention, allow a specific emoji reaction (e.g., :jira:) on any message to trigger ticket creation from that message. Several n8n workflows and IdeaLift use this pattern. | MEDIUM | Requires `app.event('reaction_added')` handler. Fetch the reacted-to message, start a thread from it. Nice shortcut for "turn this into a ticket" without typing. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-project selection | "We use multiple Jira projects" | Adds decision fatigue to every request. Increases conversation length. Requires project permission mapping. V1 complexity explosion for marginal value. | Start with one fixed project (configured in env). Add project selection in v2 only after validating the core flow works. |
| Full Jira field support (priority, labels, assignee, components, sprint) | "Our workflow requires these fields" | Each additional field means more conversation turns, more validation, more Jira API complexity. Assignee requires user mapping between Slack and Jira. Sprint requires board context. | V1: title, description, issue type only. V2: add priority and labels. Assignee/sprint are v3 at earliest. |
| Bi-directional sync (Jira updates back to Slack) | "I want to see status changes in Slack" | Requires webhooks from Jira, state management, notification routing. Completely different architecture from issue creation. The native Jira Slack app already does this well. | Tell users to use the official Jira Cloud for Slack app for notifications. This bot focuses on creation only. |
| Slash command interface (`/jira create`) | "Slash commands are faster" | Slash commands open a modal, breaking the conversational flow that is the core value. Also, Slack limits slash command response to 3 seconds -- too short for AI processing. The native Jira app already has `/jira create`. | Keep @mention as the only trigger. The value is in the conversation, not the command. |
| DM-based conversations | "I want to create tickets privately" | Requires separate conversation tracking, loses team visibility, complicates thread-based architecture. DMs have different API behavior. | All conversations happen in channel threads. The thread itself provides sufficient privacy for the request context. |
| Auto-create without approval | "Skip the confirmation step" | Users will inevitably create garbage tickets. No undo in Jira API (delete requires admin permissions). The approval step is 2 seconds of friction that prevents minutes of cleanup. | Always show preview and require explicit approval. This is a feature, not a limitation. |
| Editing/deleting created Jira issues | "Oops, I made a mistake" | Requires tracking issue-to-thread mapping, Jira update/delete permissions, reopening closed conversations. Scope creep into full Jira client territory. | Provide the Jira link. User edits in Jira directly. The bot is a creation tool, not a Jira client. |

## Feature Dependencies

```
[@mention trigger]
    └──requires──> [Thread-scoped conversation]
                       └──requires──> [Conversational info gathering]
                                          └──requires──> [Issue draft preview]
                                                             └──requires──> [Approve/Reject buttons]
                                                                                └──requires──> [Jira issue creation]
                                                                                                   └──requires──> [Confirmation with link]

[Thread-scoped conversation] ──requires──> [Slack thread reply support (thread_ts)]

[Approve/Reject buttons] ──requires──> [Slack interactive components infrastructure]

[Jira issue creation] ──requires──> [Jira REST API client + credential proxy integration]

[Error handling] ──enhances──> [Jira issue creation]
[Error handling] ──enhances──> [Approve/Reject buttons]

[AI-inferred issue type] ──enhances──> [Conversational info gathering]
[Thread context summarization] ──enhances──> [Conversational info gathering]
[Edit-before-submit] ──enhances──> [Issue draft preview]
[Rich Block Kit formatting] ──enhances──> [Issue draft preview]
[Emoji-react trigger] ──alternative-to──> [@mention trigger]
```

### Dependency Notes

- **Thread-scoped conversation requires Slack thread reply support:** The current `slack.ts` sends messages to channel root. Must add `thread_ts` parameter to `chat.postMessage` calls. This is the foundational change.
- **Approve/Reject buttons require interactive components infrastructure:** NanoClaw has zero interactive component support today. Need `app.action()` handlers, Block Kit payload construction, and a way to route button clicks back to the agent or a handler. This is the highest-risk new infrastructure.
- **Jira issue creation requires API client + credential proxy:** Jira API token must flow through the existing credential proxy. Need a Jira client module that constructs REST API calls with proper auth headers.
- **AI-inferred issue type enhances conversational gathering:** Not a hard dependency, but makes the conversation shorter. Can be added to the system prompt without code changes.
- **Emoji-react trigger is an alternative to @mention:** Independent entry point. Can be added later without changing the core flow.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to validate that conversational Jira creation from Slack works.

- [x] @mention triggers a thread conversation -- the entry point
- [ ] Thread-scoped replies (add `thread_ts` support to Slack channel) -- foundational infrastructure
- [ ] Conversational info gathering (title, description, issue type) -- the core AI interaction
- [ ] Issue draft preview as formatted Slack message -- user sees what will be created
- [ ] Approve/Reject buttons via Slack interactive components -- confirmation UX
- [ ] Jira REST API v3 issue creation (fixed project) -- the deliverable
- [ ] Confirmation with Jira issue link in thread -- closure
- [ ] Error handling with user-facing messages -- resilience

### Add After Validation (v1.x)

Features to add once core flow is proven and used daily.

- [ ] AI-inferred issue type -- trigger: users complain about too many questions
- [ ] Thread context summarization -- trigger: users frequently mention the bot mid-conversation expecting it to read above
- [ ] Edit-before-submit conversational flow -- trigger: users ask to change fields after preview
- [ ] Rich Block Kit formatting for previews -- trigger: plain text previews feel unprofessional
- [ ] Emoji-react trigger -- trigger: users want faster "turn this into a ticket" workflow

### Future Consideration (v2+)

Features to defer until the core flow is validated and daily-active.

- [ ] Multi-project selection -- defer: requires project permission mapping, adds conversation complexity
- [ ] Additional Jira fields (priority, labels) -- defer: each field adds conversation turns
- [ ] Assignee mapping (Slack user to Jira user) -- defer: requires user directory integration

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Thread-scoped replies | HIGH | LOW | P1 |
| Conversational info gathering | HIGH | MEDIUM | P1 |
| Issue draft preview | HIGH | MEDIUM | P1 |
| Approve/Reject buttons | HIGH | MEDIUM | P1 |
| Jira API issue creation | HIGH | MEDIUM | P1 |
| Confirmation with link | HIGH | LOW | P1 |
| Error handling | MEDIUM | LOW | P1 |
| AI-inferred issue type | MEDIUM | LOW | P2 |
| Thread context summarization | HIGH | MEDIUM | P2 |
| Edit-before-submit | MEDIUM | LOW | P2 |
| Rich Block Kit formatting | LOW | LOW | P2 |
| Emoji-react trigger | MEDIUM | MEDIUM | P3 |
| Multi-project selection | LOW | HIGH | P3 |
| Additional Jira fields | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (the complete happy-path flow)
- P2: Should have, add after core validation
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Jira Cloud for Slack (native) | IdeaLift | ClearFeed | Our Approach |
|---------|-------------------------------|----------|-----------|--------------|
| Trigger method | `/jira create` slash command | Ambient detection + emoji | @mention or emoji | @mention in thread |
| Issue creation UX | Modal form (fill fields manually) | AI auto-creates from thread | Form + AI assist | Conversational AI in thread |
| Preview/approval | Modal shows fields before submit | Shows draft, user confirms | Inline preview | Block Kit preview + approve/reject buttons |
| Thread context | Does not read thread history | Reads full thread, summarizes | Partial thread capture | AI reads thread context (v1.x) |
| Customizable fields | All Jira fields available | Limited fields | Configurable | Title, description, type (v1); expand later |
| AI involvement | Rovo can generate summary | Core AI throughout | AI-assisted triage | Claude Agent SDK conversational AI |
| Price | Free (bundled with Jira Cloud) | Free tier to $199/mo | $25-50/user/mo | Self-hosted, no per-user cost |
| Unique strength | Official, full Jira integration | Ambient capture without explicit trigger | Enterprise support workflows | Conversational AI with approval flow, self-hosted, customizable |

## Sources

- [Jira Cloud for Slack official docs](https://support.atlassian.com/jira-software-cloud/docs/use-jira-cloud-for-slack/)
- [5 Methods to Create Jira Tickets from Slack (IdeaLift comparison)](https://idealift.app/blog/01-slack-to-jira-integration)
- [ClearFeed Jira Slack Integration Guide](https://clearfeed.ai/blogs/jira-slack-integration-guide)
- [Slack Block Kit documentation](https://api.slack.com/block-kit)
- [Slack interactive messages](https://docs.slack.dev/messaging/creating-interactive-messages/)
- [Jira Slack automation guide (eesel AI)](https://www.eesel.ai/blog/jira-slack-automation)
- [n8n Slack-AI-Jira workflow](https://github.com/allaboutopensource/Slack-AI-Jira-Automation-Workflow-Using-n8n)
- [Conclude: How to Create Jira Tickets from Slack](https://conclude.io/blog/create-jira-ticket-from-slack/)
- [Jira Slack integration common issues (Atlassian Community)](https://community.atlassian.com/forums/Jira-questions/jirabot-not-working-in-shared-slack-channels/qaq-p/724961)

---
*Feature research for: Slack-to-Jira DevOps automation agent*
*Researched: 2026-04-02*
