# Stack Research

**Domain:** Jira API integration for Node.js/TypeScript Slack bot (adding to existing NanoClaw)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| jira.js | 5.3.x | Jira Cloud REST API v3 client | Only actively maintained TypeScript-native Jira client. Near-100% API coverage, full type definitions with IntelliSense, supports both Basic Auth (email + API token) and OAuth 2.0. Node.js 20+ required (matches existing NanoClaw engine constraint). ESM/CJS dual support. Tree-shakable. |
| @slack/bolt | 4.3.x (existing) | Slack interactive components (buttons, blocks) | Already installed. `app.action()` natively handles button clicks, select menus, date pickers. Socket Mode means interactive components work out of the box -- no Request URL or HTTP server needed. Block Kit messages sent via `say({ blocks: [...] })`. |
| @slack/types | 2.15.x (existing) | TypeScript types for Slack Block Kit | Already installed. Provides type definitions for block elements, actions, and message payloads. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new required) | -- | -- | The existing stack (@slack/bolt + jira.js) covers all needs. No additional libraries needed for v1. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest (existing) | Testing Jira API integration | Mock jira.js client for unit tests. Existing test patterns in `src/channels/slack.test.ts` provide the template. |
| tsx (existing) | Development runtime | Already used for `npm run dev`. No changes needed. |

## Installation

```bash
# New dependency (only one)
npm install jira.js

# No new dev dependencies needed
```

## Key Integration Decisions

### Jira API: Use jira.js, NOT the Atlassian MCP Server

The Atlassian Remote MCP Server (mcp.atlassian.com) exists and supports Jira issue creation via natural language. However, it is the wrong choice here because:

1. **Architecture mismatch** -- The MCP server is designed for LLM tool-use inside an agent context. NanoClaw's agent runs in a container, but the Jira issue creation happens in the host process after the AI conversation concludes and the user clicks "Approve."
2. **Unnecessary complexity** -- MCP requires OAuth 2.1 browser consent flow or API token setup through Atlassian's remote server. Direct REST API via jira.js uses a simple API token with zero external dependencies.
3. **SSE endpoint deprecation** -- The `/v1/sse` endpoint is being retired after June 30, 2026. While `/v1/mcp` replaces it, this adds migration risk for no benefit.
4. **Control** -- Direct API gives full control over error handling, retry logic, and field mapping. MCP abstracts this away.

**Use jira.js with Basic Auth (email + API token).** Store credentials via OneCLI/credential proxy, consistent with existing NanoClaw patterns.

### Slack Interactive Components: Use Existing @slack/bolt, NOT a Separate Library

No additional Slack libraries are needed. The existing `@slack/bolt` 4.3.x already supports:

- **Block Kit messages** -- Send rich messages with buttons via `blocks` array in `chat.postMessage`
- **Action handlers** -- `app.action('action_id', async ({ ack, body, say }) => { ... })` pattern
- **Thread replies** -- `chat.postMessage` with `thread_ts` parameter to reply in threads
- **Socket Mode interactivity** -- Interactive components work automatically in Socket Mode; no HTTP endpoint needed

The key change is that the existing `SlackChannel` class needs to expose access to the Bolt `App` instance (or a controlled subset of it) so the Jira workflow can register action handlers and send Block Kit messages.

### AI Conversation Flow: Handled by Existing Container Agent

The AI conversation for collecting Jira issue details (title, description, issue type) is handled by the Claude Agent SDK running inside the container -- this is the existing NanoClaw pattern. No new AI/LLM libraries needed.

The conversation output (structured Jira fields) flows back to the host via the existing IPC mechanism, which then:
1. Posts a Block Kit preview message with Approve/Edit buttons
2. Waits for button click via `app.action()`
3. Creates the Jira issue via jira.js on approval

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| jira.js | Atlassian MCP Server | Only if the agent itself (inside container) needs to create Jira issues autonomously without human approval. Not our case -- we want explicit approve/reject UX. |
| jira.js | @narthia/jira-client | If you need zero runtime dependencies. But jira.js has far better documentation, larger community (5x npm downloads), and more complete API coverage. |
| jira.js | Direct fetch() to Jira REST API | If you only need 1-2 endpoints and want zero dependencies. But jira.js provides typed request/response objects that prevent field name mistakes in issue creation. |
| @slack/bolt actions | Slack slash commands | If you wanted `/jira create` style invocation. But PROJECT.md explicitly scopes to @mention-based invocation, and slash commands require additional Slack app configuration. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| jira-client (npm) | Last published 3+ years ago. Unmaintained. No TypeScript types. No REST API v3 support. | jira.js |
| jira-connector | Abandoned. Last meaningful commit years ago. | jira.js |
| Atlassian Connect SDK | Designed for Atlassian Marketplace apps, not standalone bots. Requires app descriptor, install flow, webhooks -- massive overkill. | jira.js |
| Atlassian Forge SDK | Requires deploying to Atlassian's runtime. Incompatible with self-hosted NanoClaw architecture. | jira.js |
| @slack/web-api (standalone) | Already bundled inside @slack/bolt. Installing separately creates version conflicts and duplicate code. | @slack/bolt (includes web API client as `app.client`) |
| @slack/block-kit (if it existed) | No official library. Block Kit is JSON -- construct it as plain objects with TypeScript types from @slack/types. | Inline Block Kit JSON with @slack/types |

## Stack Patterns by Variant

**If Jira Cloud (our case):**
- Use jira.js with `Version3Client` for REST API v3
- Basic Auth with email + API token
- Store `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN` in `.env` via OneCLI

**If Jira Data Center / Server (on-premise):**
- Use jira.js with `Version2Client` (v3 is Cloud-only)
- Basic Auth with username + password or PAT (Personal Access Token)
- Ensure network connectivity from NanoClaw host to Jira instance

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| jira.js@5.3.x | Node.js 20+ | Matches NanoClaw's `engines: ">=20"`. ESM native support with `"type": "module"`. |
| jira.js@5.3.x | TypeScript 5.x | Full type definitions included. Compatible with existing tsconfig (ES2022 target, NodeNext resolution). |
| @slack/bolt@4.3.x | jira.js@5.3.x | No conflicts. Independent libraries with no shared dependencies that could collide. |

## Environment Variables (New)

| Variable | Purpose | Example |
|----------|---------|---------|
| `JIRA_HOST` | Jira Cloud instance URL | `https://yoursite.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email for API auth | `user@company.com` |
| `JIRA_API_TOKEN` | Atlassian API token (not password) | Generated at id.atlassian.com |
| `JIRA_PROJECT_KEY` | Fixed project key for v1 (single project) | `DEVOPS` |

These should be managed via OneCLI/credential proxy, consistent with existing `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` patterns.

## Code Pattern: jira.js Issue Creation

```typescript
import { Version3Client } from 'jira.js';

const jira = new Version3Client({
  host: process.env.JIRA_HOST!,
  authentication: {
    basic: {
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
    },
  },
});

// Create issue
const issue = await jira.issues.createIssue({
  fields: {
    summary: 'Issue title from AI conversation',
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Description from AI conversation' }],
        },
      ],
    },
    issuetype: { name: 'Task' },
    project: { key: 'DEVOPS' },
  },
});

console.log(`Created: ${issue.key}`); // e.g., "DEVOPS-123"
```

Note: REST API v3 uses Atlassian Document Format (ADF) for description fields, not plain text. This is a common pitfall -- see PITFALLS.md.

## Code Pattern: Slack Block Kit with Approve/Reject Buttons

```typescript
// Send preview with buttons (in a thread)
await app.client.chat.postMessage({
  channel: channelId,
  thread_ts: parentMessageTs, // reply in thread
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira Issue Preview*\n*Title:* ${summary}\n*Type:* ${issueType}\n*Description:* ${description}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'jira_approve',
          value: JSON.stringify({ summary, description, issueType }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'jira_edit',
          value: JSON.stringify({ summary, description, issueType }),
        },
      ],
    },
  ],
  text: `Jira Issue Preview: ${summary}`, // fallback
});

// Handle approval
app.action('jira_approve', async ({ ack, body, say }) => {
  await ack();
  const payload = JSON.parse(body.actions[0].value);
  // Create Jira issue with payload...
});
```

## Sources

- [jira.js GitHub](https://github.com/MrRefactoring/jira.js) -- Version 5.3.x, API coverage, auth methods, Node 20+ requirement (HIGH confidence)
- [jira.js Documentation](https://mrrefactoring.github.io/jira.js/) -- Issue creation API, Version3Client usage (HIGH confidence)
- [Slack Bolt for JS Docs](https://docs.slack.dev/tools/bolt-js/building-an-app/) -- app.action() pattern, Block Kit messages, Socket Mode interactivity (HIGH confidence)
- [Slack Block Kit Reference](https://docs.slack.dev/reference/block-kit/) -- Block types, button elements, actions layout (HIGH confidence)
- [Atlassian MCP Server](https://github.com/atlassian/atlassian-mcp-server) -- Evaluated and rejected for this use case (HIGH confidence)
- [Atlassian REST API v3 Docs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/) -- ADF format for descriptions, field schemas (HIGH confidence)

---
*Stack research for: Jira integration in NanoClaw Slack bot*
*Researched: 2026-04-02*
