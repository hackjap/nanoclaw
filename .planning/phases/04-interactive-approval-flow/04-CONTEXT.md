# Phase 4: Interactive Approval Flow - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

AI가 수집한 Jira 초안을 Block Kit 미리보기로 스레드에 표시하고, 승인/수정 버튼으로 Jira 이슈를 생성하거나 수정 대화를 시작한다. :jira: 이모지 리액션으로 임의 메시지 기반 티켓 생성을 시작한다. 모든 액션에 대해 성공/실패 피드백을 제공한다.

</domain>

<decisions>
## Implementation Decisions

### 미리보기 레이아웃
- **D-01:** 구조화 카드 형태 — Section block으로 제목/설명/타입을 레이블+값 포맷으로 구분. 하단에 Approve/Edit 버튼 배치.
- **D-02:** 설명이 200자를 초과하면 절단 + "..." 표시. 전체 설명은 Jira 이슈 생성 후 확인 가능.

### 수정(Edit) 플로우
- **D-03:** 수정 버튼 클릭 시 기존 초안을 컨텍스트로 전달하여 컨테이너 에이전트 재호출. 에이전트가 "어떤 부분을 수정할까요?" 라고 물어보고 해당 필드만 수정.
- **D-04:** 수정 완료 후 기존 미리보기 메시지를 `chat.update`로 갱신. 버튼 유지. 스레드가 깔끔하게 유지됨.

### 이모지 트리거
- **D-05:** :jira: 이모지 리액션 시 해당 메시지 내용을 컨텍스트로 삼아 AI 대화 시작. Phase 2 대화 플로우와 동일하게 부족한 정보를 추가 질문.
- **D-06:** 이모지 리액션 권한은 모든 채널 멤버에게 열려 있음. v1은 별도 권한 제어 없음.

### 승인 후 피드백 UX
- **D-07:** Jira 생성 성공 시 기존 미리보기 메시지를 "✅ 생성 완료" + Jira 링크로 업데이트. 버튼 제거.
- **D-08:** Jira 생성 실패 시 스레드에 에러 답글 게시. 미리보기의 승인/수정 버튼은 그대로 유지하여 재시도 가능.

### Claude's Discretion
- Block Kit builder 함수의 구체적 구현 방식
- `app.event('reaction_added')` 핸들러 등록 위치 및 구조
- 수정 대화 시 에이전트 CLAUDE.md 프롬프트 설계
- 승인 처리 중 로딩 상태 표시 여부 (예: "생성 중..." 임시 메시지)
- 에러 메시지의 구체적 문구 (Phase 3 D-12/D-13 에러 분류 패턴 적용)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Slack Interactive Components
- `src/channels/slack.ts` — SlackChannel 구현. `onAction()` 콜백 레지스트리(line 247-270), Block Kit 메시지 발송(line 195), `chat.update` 사용 패턴
- `src/channels/slack.test.ts` — Block Kit/action 테스트. `draft_approve`, `draft_edit` action_id 이미 테스트 존재(line 963-1059)

### Draft Persistence
- `src/db.ts` — `jira_drafts` 테이블 스키마(line 86-95), `saveDraft`/`getDraft`/`updateDraftStatus` 함수(line 596-627)
- `src/types.ts` — `JiraDraft` 인터페이스(line 87), `SendMessageOptions` blocks 필드(line 59)

### Jira Client
- `src/jira-client.ts` — `createJiraIssue()` 함수, `JiraDraftData` 인터페이스(line 33), ADF 변환

### IPC & Actions
- `src/ipc.ts` — actions/ 폴링(line 152-186), `jira_draft` 타입 처리(line 167-168), `saveDraft` 호출

### Container & Agent
- `src/container-runner.ts` — `ContainerInput` 인터페이스(thread_ts 포함), `runContainerAgent()` 실행 흐름
- `container/agent-runner/src/index.ts` — 컨테이너 내 에이전트 실행, IPC 출력 패턴

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 전체 아키텍처 참조
- `.planning/codebase/CONVENTIONS.md` — 코딩 컨벤션

### Prior Phase Context
- `.planning/phases/01-thread-aware-slack-infrastructure/01-CONTEXT.md` — 버튼 콜백 오케스트레이터 처리(D-06), 콜백 레지스트리(D-07)
- `.planning/phases/02-ai-conversation-agent/02-CONTEXT.md` — actions/ IPC(D-03), 초안 JSON 스키마(D-04), 에이전트 톤(D-05/D-06)
- `.planning/phases/03-jira-client-draft-persistence/03-CONTEXT.md` — jira_drafts 테이블(D-08/D-09), 상태 전이(D-11), 에러 처리(D-12~D-15)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `onAction(actionId, handler)`: Phase 1에서 구축한 콜백 레지스트리 — `draft_approve`, `draft_edit` 등 action_id별 핸들러 등록
- `SendMessageOptions.blocks`: Block Kit 메시지 발송 이미 지원
- `saveDraft`/`getDraft`/`updateDraftStatus`: SQLite 초안 CRUD 이미 구현
- `createJiraIssue()`: Jira API 호출 + ADF 변환 이미 구현
- `SlackChannel.app`: Slack Bolt app 인스턴스 — `app.event('reaction_added')` 등록 가능

### Established Patterns
- 콜백 레지스트리 패턴: `catch-all app.action(/.+/)` → action_id별 핸들러 라우팅
- IPC actions/ 파일 기반 통신: JSON 파일 → 폴링 → 파싱 → 처리 → 삭제
- 에러 처리: 로깅 후 사용자 메시지 전송, 예외 전파 안 함
- draft status 전이: draft → approved → created

### Integration Points
- `ipc.ts` actions/ 핸들러: 초안 수신 → db 저장 → **Block Kit 미리보기 전송** (이 단계 새로 추가)
- `onAction('draft_approve')`: 승인 핸들러 등록 → getDraft → createJiraIssue → chat.update
- `onAction('draft_edit')`: 수정 핸들러 등록 → getDraft → runContainerAgent 재호출
- `app.event('reaction_added')`: :jira: 리액션 감지 → 메시지 내용 추출 → 대화 시작

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-interactive-approval-flow*
*Context gathered: 2026-04-03*
