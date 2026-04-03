# Phase 5: Bot Liveness Reactions - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

봇이 메시지나 이모지 요청에 리액션(이모지)으로 응답하여 정상 동작 여부를 즉시 확인할 수 있게 한다. Slack `reactions.add` API를 활용하여 수신 확인, 진행 상태, 완료/실패를 이모지 리액션으로 표시한다.

</domain>

<decisions>
## Implementation Decisions

### 수신 확인 리액션
- **D-01:** 봇이 트리거된 메시지에 👀 (eyes) 이모지 리액션을 즉시 추가하여 "봤다"는 신호를 보낸다.
- **D-02:** 모든 트리거(@멘션, :jira: 이모지 리액션)에 대해 수신 확인 리액션을 추가한다.

### 진행 상태 이모지 전환
- **D-03:** 단계별 이모지 전환 방식 — 수신(👀) → 진행 중(⚙️) → 완료(✅) 또는 실패(❌) 순서로 이모지를 교체한다.
- **D-04:** 이전 단계 이모지를 제거하고 새 단계 이모지를 추가하는 방식 (누적 아님).

### 진행 중 텍스트 메시지
- **D-05:** 작업이 길어지면 스레드에 텍스트 메시지로 상태를 표시한다. 이모지 리액션과 병행.

### Claude's Discretion
- 진행 중 텍스트 메시지의 구체적 문구와 타이밍 (예: 몇 초 후에 표시할지)
- 리액션 추가/제거의 에러 핸들링 방식 (실패 시 무시 vs 로깅)
- `reactions.add`/`reactions.remove` 호출의 구체적 구현 위치 (SlackChannel 메서드 vs 유틸리티)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Slack Channel
- `src/channels/slack.ts` — SlackChannel 구현. `onReaction()` 콜백 레지스트리(line 322-326), `reaction_added` 이벤트 핸들러(line 350-357), `app` Bolt 인스턴스 접근
- `src/channels/slack.test.ts` — 기존 리액션 테스트 패턴 참조

### Approval Flow (리액션 사용 패턴)
- `src/approval-flow.ts` — `:jira:` 이모지 리액션 핸들러(line 190-217), `onReaction` 등록 패턴

### Orchestrator
- `src/index.ts` — 메시지 수신 루프, 트리거 감지, `runContainerAgent()` 호출 흐름. 리액션 추가 시점 파악에 필요
- `src/container-runner.ts` — `runContainerAgent()` 실행 흐름, 컨테이너 시작/종료 시점

### Types & Config
- `src/types.ts` — `Channel` 인터페이스, `SendMessageOptions`
- `src/config.ts` — 트리거 패턴 설정

### Prior Phase Context
- `.planning/phases/04-interactive-approval-flow/04-CONTEXT.md` — 이모지 트리거 패턴(D-05, D-06), `onReaction` 레지스트리 설계

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `onReaction(emoji, handler)`: Phase 4에서 구축한 이모지 리액션 수신 레지스트리 — 이미 `reaction_added` 이벤트 처리 가능
- `SlackChannel.app`: Bolt App 인스턴스 — `app.client.reactions.add()`, `app.client.reactions.remove()` 호출 가능
- `SendMessageOptions.blocks`: Block Kit 메시지 발송 이미 지원

### Established Patterns
- 이벤트 핸들러 등록: `Map<string, Handler>` 기반 레지스트리 패턴 (onAction, onReaction)
- 에러 핸들링: `try/catch` + `logger.error()` + 계속 진행 패턴
- Channel 인터페이스: `sendMessage(chatJid, text, options?)` 패턴

### Integration Points
- `src/index.ts` 메시지 처리 루프: 트리거 감지 후 → 리액션 추가 → 컨테이너 실행 → 리액션 전환
- `src/container-runner.ts`: 컨테이너 시작/완료 시점에 이모지 전환 훅 필요
- `src/approval-flow.ts`: :jira: 트리거도 동일한 리액션 플로우 적용 필요

</code_context>

<specifics>
## Specific Ideas

- 수신 확인은 👀 (eyes) 이모지로 즉시 표시 — "봇이 봤다"는 직관적 신호
- 단계별 전환: 👀 → ⚙️ → ✅/❌ 흐름으로 작업 진행을 시각적으로 추적
- 텍스트 메시지는 이모지와 병행하여 진행 상황이 길어질 때 상세 정보 제공

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-bot-liveness-reactions*
*Context gathered: 2026-04-03*
