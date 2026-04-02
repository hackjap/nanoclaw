# Phase 1: Thread-Aware Slack Infrastructure - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

봇이 Slack 스레드에서 대화하고, Block Kit 메시지를 보내고, interactive components(버튼)로 사용자 입력을 받을 수 있는 인프라를 구축한다. AI 대화 로직이나 Jira 연동은 이 페이즈에 포함되지 않는다.

</domain>

<decisions>
## Implementation Decisions

### Thread Routing
- **D-01:** 모든 스레드 답글을 thread_ts와 함께 에이전트에 전달한다. 기존의 스레드 평탄화(slack.ts line 82-85) 로직을 제거하고, NewMessage에 thread_ts 필드를 추가한다.
- **D-02:** 봇의 응답도 thread_ts를 사용하여 해당 스레드에 답글로 게시한다.

### Channel Interface
- **D-03:** 기존 `Channel.sendMessage(jid, text)` 시그니처에 선택적 options 객체를 추가한다 (예: `sendMessage(jid, text, options?)`). options에 thread_ts, blocks 등을 포함한다. 기존 채널(WhatsApp, Telegram 등)의 하위호환성을 유지한다.

### Interactive Components
- **D-04:** v1은 버튼(actions block)만 지원한다. 모달, 드롭다운 메뉴 등은 추후 필요 시 추가한다.
- **D-05:** `app.action()` 핸들러를 SlackChannel 내부에 등록하는 인프라를 구축한다.

### Button Callback Handling
- **D-06:** 버튼 클릭 이벤트는 오케스트레이터(호스트 프로세스)에서 직접 처리한다. 컨테이너가 이미 종료되었을 수 있으므로, 비동기 버튼 이벤트를 컨테이너에 전달하지 않는다.
- **D-07:** 버튼 콜백을 외부에서 등록할 수 있는 메커니즘을 SlackChannel에 제공한다 (콜백 레지스트리 패턴).

### Claude's Discretion
- Block Kit 메시지 빌더의 구체적 구현 방식
- app.action() 핸들러의 내부 라우팅 구조
- 스레드 컨텍스트 전달을 위한 IPC 프로토콜 확장 방식
- 테스트 전략 (기존 slack.test.ts 확장)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Slack Integration
- `src/channels/slack.ts` — 현재 Slack 채널 구현. thread 평탄화 로직(line 82-85), sendMessage(line 159-191), setupEventHandlers(line 68-133)
- `src/channels/slack.test.ts` — 기존 Slack 테스트. 새 기능 테스트 추가 시 참고
- `src/channels/registry.ts` — 채널 등록 메커니즘

### Core Interfaces
- `src/types.ts` — Channel 인터페이스, NewMessage 타입, RegisteredGroup 타입 정의
- `src/ipc.ts` — IPC 워처. sendMessage deps 시그니처, 메시지/태스크 처리 흐름

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 전체 아키텍처 (오케스트레이터, 채널, 컨테이너 레이어)
- `.planning/codebase/CONVENTIONS.md` — 코딩 컨벤션 (네이밍, 임포트, 에러 처리 패턴)
- `.planning/research/ARCHITECTURE.md` — Jira 통합 아키텍처 리서치 (컴포넌트 경계, 데이터 플로우)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SlackChannel` 클래스: Socket Mode 연결, 메시지 수신/발신 기본 구조가 이미 존재
- `readEnvFile()`: 환경변수 관리 패턴
- `@slack/bolt` 4.3.x: Block Kit, interactive components 이미 내장 (추가 의존성 불필요)
- `outgoingQueue`: 연결 전 메시지 큐잉 패턴 — 확장 시 참고

### Established Patterns
- 채널 자체 등록 (`registerChannel` in `registry.ts`)
- 이벤트 기반 메시지 수신 (`app.event('message')`)
- JID 네이밍: `slack:{channel_id}` 형식
- 메시지 분할: 4000자 제한 처리
- bot mention → trigger pattern 변환 (line 109-121)

### Integration Points
- `onMessage` 콜백: NewMessage에 thread_ts 추가 필요
- `sendMessage` → `chat.postMessage`: thread_ts 파라미터 추가 필요
- `IpcDeps.sendMessage`: options 전파를 위한 시그니처 변경 필요
- `container-runner.ts`: ContainerInput에 thread_ts 포함 필요

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

*Phase: 01-thread-aware-slack-infrastructure*
*Context gathered: 2026-04-02*
