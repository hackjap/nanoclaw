# Phase 2: AI Conversation Agent - Research

**Researched:** 2026-04-02
**Domain:** Container agent IPC, Claude Agent SDK multi-turn conversation, group CLAUDE.md prompt design
**Confidence:** HIGH

## Summary

Phase 2 builds the AI conversation agent that collects Jira issue details (title, description, issueType) through multi-turn Slack thread dialogue. The work spans three layers: (1) the container agent's group CLAUDE.md prompt that drives the conversation behavior, (2) a new IPC `actions/` namespace for structured draft output, and (3) the orchestrator-side polling logic for the new `actions/` directory.

The existing codebase already provides most of the infrastructure needed. The `MessageStream` class in agent-runner supports multi-turn conversations via IPC input polling. The `ContainerInput.thread_ts` field (added in Phase 1) passes thread context to the container. The IPC file-based communication pattern (write JSON -> poll -> process -> delete) is well-established for `messages/` and `tasks/` and can be replicated for `actions/`. The primary engineering work is prompt design for the group CLAUDE.md, adding the `actions/` IPC namespace with polling, and ensuring `thread_ts` is available to the MCP send_message tool so the agent can reply in the correct thread.

**Primary recommendation:** Extend the existing IPC pattern with a new `actions/` directory, write a focused CLAUDE.md section for Jira draft collection, and add `thread_ts` support to the MCP `send_message` tool.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 추론 우선 방식 -- 사용자의 초기 메시지를 분석하여 가능한 필드를 자동 추론한 뒤, 부족한 정보만 질문한다. 예: "로그인 안 됨" -> 타입=Bug 추론, 제목 초안 생성, 설명만 보완 요청.
- **D-02:** 수집 필드는 제목(title), 설명(description), 이슈타입(issueType: Bug/Task/Story) 3개만. 우선순위/라벨 등 추가 필드는 v2.
- **D-03:** 새 IPC 네임스페이스 `/workspace/ipc/actions/` 디렉토리에 JSON 파일 작성. 기존 `messages/`(Slack 발송)와 `tasks/`(스케줄)와 분리된 역할.
- **D-04:** 초안 JSON 스키마는 최소한으로: `{ type: "jira_draft", chatJid, thread_ts, draft: { title, description, issueType } }`. 메타데이터(thread_ts, chatJid)는 IPC 래퍼에 포함.
- **D-05:** 대화 언어는 한국어. 질문/안내/확인 모두 한국어로 진행. Jira 필드(title/description)도 한국어로 수집.
- **D-06:** 간결하고 직접적인 톤. 불필요한 인사/멘트 없이 바로 질문. DevOps 팀 특성상 빠른 응답 선호.
- **D-07:** 에이전트 자율 판단 -- 3개 필드(제목/설명/타입)가 모두 확보되면 자동으로 초안 생성. 사용자의 명시적 종료 신호 불필요.
- **D-08:** 에이전트는 `actions/`에 초안 JSON 작성하고 종료. 오케스트레이터가 파일을 읽고 후속 처리(Phase 3: 저장, Phase 4: 미리보기/버튼)를 트리거. 관심사 분리 명확.

### Claude's Discretion
- 에이전트 CLAUDE.md (그룹 인스트럭션)의 구체적 프롬프트 설계
- 추론 실패 시 폴백 질문 순서
- 초안 생성 전 사용자에게 요약 표시 여부 (간결한 톤 내에서)
- actions/ 디렉토리 폴링 로직의 구체적 구현

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | @멘션 시 AI 에이전트가 스레드에서 대화를 시작하여 필요한 정보를 질문한다 | Group CLAUDE.md prompt design + thread_ts in ContainerInput (already exists from Phase 1) + MCP send_message thread_ts support (new) |
| CONV-02 | AI가 제목, 설명, 이슈타입(Bug/Task/Story) 정보를 대화형으로 수집한다 | CLAUDE.md prompt with inference-first strategy (D-01), 3-field collection (D-02), Korean language (D-05) |
| CONV-03 | 정보 수집이 완료되면 구조화된 Jira 초안 JSON을 IPC로 오케스트레이터에 전달한다 | New `actions/` IPC namespace (D-03), draft JSON schema (D-04), orchestrator polling logic |
</phase_requirements>

## Architecture Patterns

### How the Existing Multi-Turn Flow Works

Understanding the current message flow is critical for this phase:

1. **Inbound:** User @mentions bot in Slack -> `slack.ts` stores message with `thread_ts` -> message loop detects trigger -> `processGroupMessages()` formats prompt -> `runAgent()` spawns container
2. **Container execution:** `agent-runner/index.ts` reads `ContainerInput` from stdin -> calls Claude Agent SDK `query()` with `MessageStream` -> agent processes prompt using CLAUDE.md instructions
3. **Agent replies:** Agent's text output is emitted via `writeOutput()` markers -> orchestrator's `onOutput` callback sends to Slack thread via `channel.sendMessage(jid, text, { thread_ts })`
4. **Multi-turn:** User replies in thread -> message loop detects new messages -> `queue.sendMessage()` pipes to active container via IPC input -> agent receives via `drainIpcInput()` -> processes with ongoing context

**Key insight:** The multi-turn conversation already works end-to-end. The agent receives follow-up messages automatically. What Phase 2 adds is (a) structured prompt instructions for Jira collection and (b) a new IPC output channel for draft JSON.

### New IPC `actions/` Namespace

Following the exact pattern of `messages/` and `tasks/`:

```
data/ipc/{groupFolder}/
  messages/   # Existing: agent -> orchestrator -> Slack
  tasks/      # Existing: agent -> orchestrator -> scheduler
  input/      # Existing: orchestrator -> agent (follow-up messages)
  actions/    # NEW: agent -> orchestrator -> domain-specific handlers
```

The `actions/` directory handles structured outputs that aren't simple messages or task operations. The draft JSON (D-04) is the first action type, with future phases potentially adding more.

**Action file schema (D-04):**
```typescript
// Written by agent to /workspace/ipc/actions/{timestamp}-{random}.json
interface JiraDraftAction {
  type: 'jira_draft';
  chatJid: string;
  thread_ts: string;
  draft: {
    title: string;
    description: string;
    issueType: 'Bug' | 'Task' | 'Story';
  };
}
```

### Recommended Project Structure Changes

```
src/
  ipc.ts                    # Modified: add actions/ directory polling
  container-runner.ts       # Modified: mkdir actions/ in buildVolumeMounts
container/
  agent-runner/src/
    ipc-mcp-stdio.ts        # Modified: add submit_jira_draft tool, add thread_ts to send_message
groups/
  global/CLAUDE.md          # Modified: add Jira draft collection instructions section
```

### Pattern: MCP Tool for Draft Submission

The agent writes the draft JSON via a new MCP tool `submit_jira_draft` rather than raw file writes. This ensures:
- Schema validation at write time (via zod)
- Consistent file naming and atomic writes (existing `writeIpcFile` pattern)
- `chatJid` and `thread_ts` auto-injected from environment (agent can't forge)

```typescript
// In ipc-mcp-stdio.ts -- new tool
server.tool(
  'submit_jira_draft',
  'Submit a Jira issue draft after collecting all required information.',
  {
    title: z.string().describe('Issue title'),
    description: z.string().describe('Issue description'),
    issueType: z.enum(['Bug', 'Task', 'Story']).describe('Issue type'),
  },
  async (args) => {
    const ACTIONS_DIR = path.join(IPC_DIR, 'actions');
    const data = {
      type: 'jira_draft',
      chatJid,       // From env
      thread_ts: process.env.NANOCLAW_THREAD_TS || '',  // From env
      draft: {
        title: args.title,
        description: args.description,
        issueType: args.issueType,
      },
    };
    writeIpcFile(ACTIONS_DIR, data);
    return { content: [{ type: 'text' as const, text: 'Draft submitted.' }] };
  },
);
```

### Anti-Patterns to Avoid

- **Don't have the agent write raw JSON files directly:** Use an MCP tool so metadata (chatJid, thread_ts) is injected from the trusted environment, not from the agent's output which could be hallucinated.
- **Don't block on action processing in Phase 2:** The orchestrator polls and reads action files, but the actual handling (storing draft, showing preview) is Phase 3/4 work. Phase 2 only needs to log that an action was received.
- **Don't add a new container input field for "mode":** The agent behavior is controlled entirely by the group CLAUDE.md instructions. No code changes needed to switch between "general assistant" and "Jira collector" modes.

## Standard Stack

### Core (Already in Project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | existing | Agent execution in containers | Already used for all agent runs |
| @modelcontextprotocol/sdk | existing | MCP server for IPC tools | Already used for send_message, schedule_task, etc. |
| zod | existing | Schema validation in MCP tools | Already used in ipc-mcp-stdio.ts |
| better-sqlite3 | 11.10.0 | State persistence | Already used for messages, sessions, tasks |
| vitest | 4.0.18 | Test runner | Already configured in vitest.config.ts |

### No New Dependencies Required

This phase requires zero new npm packages. All work is done with existing infrastructure: group CLAUDE.md prompt, IPC file system, MCP tools, and the orchestrator's polling loop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured draft output | Raw fs.writeFileSync in agent | MCP tool `submit_jira_draft` with `writeIpcFile` | Atomic writes, metadata injection, schema validation |
| Multi-turn conversation | Custom message buffering | Existing `MessageStream` + IPC input polling | Already works for all groups |
| Thread-aware replies | Manual thread tracking | `ContainerInput.thread_ts` + orchestrator routing | Phase 1 already wired this |
| Action file polling | New polling loop | Extend existing `processIpcFiles` in `ipc.ts` | Same pattern as messages/tasks, single polling loop |

## Common Pitfalls

### Pitfall 1: MCP send_message Missing thread_ts
**What goes wrong:** The agent needs to send intermediate messages (e.g., "제목과 설명은 파악했는데, 이슈 타입을 알려주세요") to the thread. Currently the MCP `send_message` tool does NOT accept `thread_ts`, so messages would go to the channel root instead of the thread.
**Why it happens:** The MCP server was built before Phase 1 thread support. `send_message` writes `{ type: 'message', chatJid, text }` without `thread_ts`.
**How to avoid:** Add `thread_ts` parameter to `send_message` tool schema. Auto-populate from `NANOCLAW_THREAD_TS` env var when not explicitly provided.
**Warning signs:** Agent messages appearing at channel level instead of in the thread.

### Pitfall 2: thread_ts Not Passed to Container Environment
**What goes wrong:** The MCP server needs `thread_ts` from environment (`NANOCLAW_THREAD_TS`), but `ContainerInput.thread_ts` is only passed via stdin JSON -- it is NOT set as an environment variable for the MCP server process.
**Why it happens:** The MCP server's env is configured in `agent-runner/index.ts` query() options. Currently only `NANOCLAW_CHAT_JID`, `NANOCLAW_GROUP_FOLDER`, and `NANOCLAW_IS_MAIN` are set.
**How to avoid:** Add `NANOCLAW_THREAD_TS: containerInput.thread_ts || ''` to the MCP server env in agent-runner's `runQuery()` function.
**Warning signs:** Draft JSON has empty `thread_ts`, breaking Phase 3/4 thread routing.

### Pitfall 3: Agent Not Ending After Draft Submission
**What goes wrong:** After submitting the draft via MCP tool, the agent continues running (waiting for IPC input or SDK keeps iterating) instead of exiting cleanly.
**Why it happens:** The `MessageStream` keeps the query alive. The agent-runner loop waits for `_close` sentinel or next IPC message after query ends.
**How to avoid:** The agent's text output after `submit_jira_draft` triggers the normal response path (writeOutput -> orchestrator sends to Slack). The idle timeout then closes the container. No special exit logic needed -- the existing idle timeout mechanism handles it.
**Warning signs:** Container staying alive for full timeout period after draft is submitted.

### Pitfall 4: CLAUDE.md Instructions Too Rigid
**What goes wrong:** Agent fails to collect information when user messages don't follow expected patterns (e.g., user gives all info in one message, or gives irrelevant info).
**Why it happens:** Overly prescriptive prompts that assume a fixed conversation flow.
**How to avoid:** Design instructions as goal-oriented ("collect these 3 fields") not flow-oriented ("first ask X, then ask Y"). The inference-first approach (D-01) naturally handles varied input.
**Warning signs:** Agent asking for information the user already provided.

### Pitfall 5: actions/ Directory Not Created Before Container Runs
**What goes wrong:** Agent's MCP tool tries to write to `/workspace/ipc/actions/` but the directory doesn't exist. `writeIpcFile` calls `fs.mkdirSync({ recursive: true })` so this is actually safe, but the directory should be pre-created for consistency.
**Why it happens:** `buildVolumeMounts` in `container-runner.ts` creates `messages/`, `tasks/`, and `input/` directories but not `actions/`.
**How to avoid:** Add `fs.mkdirSync(path.join(groupIpcDir, 'actions'), { recursive: true })` alongside the existing mkdir calls in `buildVolumeMounts`.
**Warning signs:** None visible (writeIpcFile handles it), but inconsistent with established pattern.

## Code Examples

### Example 1: Group CLAUDE.md Jira Instructions Section

The CLAUDE.md section should be appended to the existing global template. Designed for inference-first (D-01), Korean language (D-05), concise tone (D-06):

```markdown
## Jira 이슈 작성 도우미

사용자가 DevOps 작업 요청을 하면, Jira 이슈 초안을 작성해야 한다.

### 수집 필드
1. **제목** (title): 간결한 한 줄 요약
2. **설명** (description): 상세 내용, 재현 방법, 기대 동작 등
3. **이슈 타입** (issueType): Bug / Task / Story 중 하나

### 동작 방식
1. 사용자 메시지를 분석해서 가능한 필드를 먼저 추론한다
   - "로그인 안 됨" -> Bug 추론, 제목 초안 생성
   - "CI 파이프라인 추가해줘" -> Task 추론
2. 이미 파악된 정보는 다시 묻지 않는다
3. 부족한 정보만 질문한다. 한 번에 하나씩.
4. 3개 필드가 모두 확보되면 `submit_jira_draft` 도구를 호출한다

### 톤
- 바로 본론. 인사/감탄사 불필요
- 질문은 짧고 직접적으로
- 예: "이슈 타입은 Bug, Task, Story 중 뭐야?" (O)
- 예: "안녕하세요! 이슈 타입을 선택해 주시겠어요?" (X)
```

### Example 2: Orchestrator Actions Polling (in ipc.ts)

```typescript
// Inside processIpcFiles(), after tasks processing block
const actionsDir = path.join(ipcBaseDir, sourceGroup, 'actions');
try {
  if (fs.existsSync(actionsDir)) {
    const actionFiles = fs
      .readdirSync(actionsDir)
      .filter((f) => f.endsWith('.json'));
    for (const file of actionFiles) {
      const filePath = path.join(actionsDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        logger.info(
          { type: data.type, sourceGroup, file },
          'IPC action received',
        );
        // Phase 2: log only. Phase 3/4 will add handlers.
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error({ file, sourceGroup, err }, 'Error processing IPC action');
        const errorDir = path.join(ipcBaseDir, 'errors');
        fs.mkdirSync(errorDir, { recursive: true });
        fs.renameSync(filePath, path.join(errorDir, `${sourceGroup}-${file}`));
      }
    }
  }
} catch (err) {
  logger.error({ err, sourceGroup }, 'Error reading IPC actions directory');
}
```

### Example 3: MCP send_message with thread_ts

```typescript
server.tool(
  'send_message',
  'Send a message to the user or group immediately while you\'re still running.',
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name'),
    thread_ts: z.string().optional().describe('Thread timestamp to reply in. Defaults to current thread if in a thread context.'),
  },
  async (args) => {
    const threadTs = args.thread_ts || process.env.NANOCLAW_THREAD_TS || undefined;
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      thread_ts: threadTs,
      groupFolder,
      timestamp: new Date().toISOString(),
    };
    writeIpcFile(MESSAGES_DIR, data);
    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | Agent starts thread conversation on @mention | integration (manual) | Manual: trigger bot in Slack thread | N/A |
| CONV-02 | Agent collects title, description, issueType | unit | `npx vitest run src/ipc-actions.test.ts -t "jira_draft" -x` | Wave 0 |
| CONV-03 | Draft JSON written to actions/ via IPC | unit | `npx vitest run src/ipc-actions.test.ts -t "actions polling" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ipc-actions.test.ts` -- covers CONV-02, CONV-03 (actions directory polling, draft JSON schema validation)
- [ ] No new test fixtures needed -- existing test patterns in `src/ipc-auth.test.ts` provide the template

## Open Questions

1. **Agent intermediate messages during collection**
   - What we know: The agent's main output (via `writeOutput`) is sent to the thread by the orchestrator. The MCP `send_message` tool can also send messages but currently lacks `thread_ts`.
   - What's unclear: Whether the agent should use `send_message` (immediate, mid-turn) or rely on the normal output path for clarifying questions. The normal output path only fires after the query completes for that turn.
   - Recommendation: The agent's normal output path fires after each `query()` result, which in multi-turn mode happens after each agent response. This is sufficient -- the agent says its clarifying question, the query yields a result, the orchestrator sends it to the thread, and the container waits for the next IPC input message. No need for `send_message` for basic Q&A. However, `send_message` with `thread_ts` should still be added for cases where the agent wants to send progress updates mid-tool-execution.

2. **CLAUDE.md placement: global vs group-specific**
   - What we know: The Jira collection instructions need to be in the Slack group's CLAUDE.md. The global template (`groups/global/CLAUDE.md`) is copied to new groups at registration time.
   - What's unclear: Whether to modify the global template (affecting all future groups) or just the `slack_main` group.
   - Recommendation: Add the Jira instructions to `groups/global/CLAUDE.md` in a conditional section (the agent checks its group folder prefix). This way all Slack groups get the capability. Alternatively, create a dedicated Jira group CLAUDE.md. **Claude's discretion per CONTEXT.md.**

## Sources

### Primary (HIGH confidence)
- `src/container-runner.ts` -- ContainerInput interface (line 36-45), buildVolumeMounts IPC directory creation (line 167-177)
- `src/ipc.ts` -- IPC watcher polling pattern for messages/ and tasks/ (line 40-157)
- `container/agent-runner/src/index.ts` -- MessageStream multi-turn (line 67-97), runQuery with IPC polling (line 334-467), MCP server env setup (line 417-427)
- `container/agent-runner/src/ipc-mcp-stdio.ts` -- MCP tool definitions, writeIpcFile atomic pattern (line 23-35), send_message tool (line 42-63)
- `src/index.ts` -- processGroupMessages thread_ts extraction (line 233), runAgent call chain (line 265-290, 318-400)
- `src/types.ts` -- NewMessage.thread_ts, SendMessageOptions, Channel interface
- `groups/global/CLAUDE.md` -- Current agent instruction template
- `src/channels/slack.ts` -- thread_ts routing (lines 95-96, 144, 185-191)

### Secondary (MEDIUM confidence)
- Phase 1 CONTEXT.md -- thread_ts defaults to msg.ts, SendMessageOptions design decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing infrastructure
- Architecture: HIGH -- extending well-documented IPC pattern with identical structure
- Pitfalls: HIGH -- identified from direct code reading, especially the thread_ts gap in MCP server
- Prompt design: MEDIUM -- CLAUDE.md effectiveness depends on real-world testing

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- no external dependency changes expected)
