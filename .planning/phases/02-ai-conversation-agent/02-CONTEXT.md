# Phase 2: AI Conversation Agent - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

AI 에이전트가 Slack 스레드에서 멀티턴 대화를 통해 Jira 이슈 정보(제목, 설명, 이슈타입)를 수집한다. 수집 완료 시 구조화된 초안 JSON을 IPC로 오케스트레이터에 전달한다. Jira API 연동, 초안 저장, 미리보기/승인 UI는 이 페이즈에 포함되지 않는다.

</domain>

<decisions>
## Implementation Decisions

### 대화 수집 전략
- **D-01:** 추론 우선 방식 — 사용자의 초기 메시지를 분석하여 가능한 필드를 자동 추론한 뒤, 부족한 정보만 질문한다. 예: "로그인 안 됨" → 타입=Bug 추론, 제목 초안 생성, 설명만 보완 요청.
- **D-02:** 수집 필드는 제목(title), 설명(description), 이슈타입(issueType: Bug/Task/Story) 3개만. 우선순위/라벨 등 추가 필드는 v2.

### 초안 출력 메커니즘
- **D-03:** 새 IPC 네임스페이스 `/workspace/ipc/actions/` 디렉토리에 JSON 파일 작성. 기존 `messages/`(Slack 발송)와 `tasks/`(스케줄)와 분리된 역할.
- **D-04:** 초안 JSON 스키마는 최소한으로: `{ type: "jira_draft", chatJid, thread_ts, draft: { title, description, issueType } }`. 메타데이터(thread_ts, chatJid)는 IPC 래퍼에 포함.

### 에이전트 성격/톤
- **D-05:** 대화 언어는 한국어. 질문/안내/확인 모두 한국어로 진행. Jira 필드(title/description)도 한국어로 수집.
- **D-06:** 간결하고 직접적인 톤. 불필요한 인사/멘트 없이 바로 질문. DevOps 팀 특성상 빠른 응답 선호.

### 완료 판단 & 핸드오프
- **D-07:** 에이전트 자율 판단 — 3개 필드(제목/설명/타입)가 모두 확보되면 자동으로 초안 생성. 사용자의 명시적 종료 신호 불필요.
- **D-08:** 에이전트는 `actions/`에 초안 JSON 작성하고 종료. 오케스트레이터가 파일을 읽고 후속 처리(Phase 3: 저장, Phase 4: 미리보기/버튼)를 트리거. 관심사 분리 명확.

### Claude's Discretion
- 에이전트 CLAUDE.md (그룹 인스트럭션)의 구체적 프롬프트 설계
- 추론 실패 시 폴백 질문 순서
- 초안 생성 전 사용자에게 요약 표시 여부 (간결한 톤 내에서)
- actions/ 디렉토리 폴링 로직의 구체적 구현

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Container & IPC
- `src/container-runner.ts` — ContainerInput 인터페이스(line 36-45), thread_ts 필드 이미 포함. runContainerAgent 실행 흐름
- `src/ipc.ts` — IPC 워처 구현. messages/tasks 폴링 패턴(line 40-157). actions/ 추가 시 동일 패턴 적용
- `container/agent-runner/src/index.ts` — 컨테이너 내 에이전트 실행. MessageStream 멀티턴(line 67-97), IPC input 폴링(line 278-326), query() SDK 호출(line 334-467)

### Types & Interfaces
- `src/types.ts` — NewMessage(thread_ts 포함), SendMessageOptions, Channel 인터페이스, ContainerConfig

### Slack Channel
- `src/channels/slack.ts` — Slack Bolt 구현. Phase 1에서 thread_ts 라우팅, Block Kit 지원 추가됨

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 전체 아키텍처 (오케스트레이터↔컨테이너↔IPC 레이어)
- `.planning/codebase/STRUCTURE.md` — 디렉토리 구조, 새 코드 추가 위치 가이드

### Prior Phase Context
- `.planning/phases/01-thread-aware-slack-infrastructure/01-CONTEXT.md` — Phase 1 결정사항 (thread routing, channel interface, interactive components, button callback handling)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ContainerInput.thread_ts`: Phase 1에서 추가됨 — 에이전트가 스레드 컨텍스트를 받을 수 있음
- `MessageStream` (agent-runner): 멀티턴 대화를 위한 push-based async iterable 이미 구현
- IPC 폴링 패턴 (`ipc.ts`): messages/tasks 디렉토리 폴링 → 파싱 → 처리 → 삭제 패턴이 actions/에 동일 적용 가능
- `SendMessageOptions.thread_ts`: 에이전트가 IPC로 스레드 답글 발송 가능

### Established Patterns
- IPC 파일 기반 통신: JSON 파일 작성 → 1초 폴링 → 처리 후 삭제 → 에러 시 errors/ 이동
- 컨테이너 격리: 크리덴셜 프록시 통한 API 접근, 그룹별 IPC 네임스페이스
- 그룹별 CLAUDE.md: `/workspace/group/CLAUDE.md`로 에이전트 인스트럭션 주입

### Integration Points
- `ipc.ts`: actions/ 디렉토리 폴링 로직 추가 필요
- `container-runner.ts`: actions/ 디렉토리 생성 (buildVolumeMounts에서 mkdir)
- 그룹 CLAUDE.md: Jira 정보 수집용 인스트럭션 추가
- `index.ts`: actions 처리 후 후속 흐름 트리거 (Phase 3/4에서 구현)

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

*Phase: 02-ai-conversation-agent*
*Context gathered: 2026-04-02*
