# Phase 3: Jira Client & Draft Persistence - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Jira REST API v3를 통해 고정 프로젝트에 이슈를 생성하고, 컨테이너에서 전달받은 초안 데이터를 SQLite에 저장하여 비동기 버튼 클릭에 대응한다. Jira API 실패 시 사용자 친화적 에러 메시지를 스레드에 표시한다. Slack UI(미리보기, 버튼)와 이모지 트리거는 Phase 4에서 구현한다.

</domain>

<decisions>
## Implementation Decisions

### Jira 클라이언트 접근 방식
- **D-01:** jira.js 라이브러리를 사용하여 Jira REST API v3 호출. 타입 안전성과 ADF 지원 내장.
- **D-02:** Jira 크리덴셜(host, email, API token)은 credential proxy를 확장하여 주입. 기존 Anthropic API 프록시 패턴과 동일하게 .env에서 읽음.
- **D-03:** 프로젝트 키는 `JIRA_PROJECT_KEY` 환경변수로 설정. v1 고정 프로젝트이므로 가장 단순한 방식.
- **D-04:** Jira 클라이언트 코드는 `src/jira-client.ts` 단일 모듈. 기존 NanoClaw 패턴(db.ts, credential-proxy.ts)과 일관.

### ADF 변환 전략
- **D-05:** ADF 변환은 수동 빌더 함수로 구현. 단순 paragraph 노드 래핑, 외부 의존성 없음.
- **D-06:** 변환 수준은 단순 텍스트→paragraph. v1 설명은 에이전트가 수집한 플레인 텍스트이므로 복잡한 포맷 불필요.
- **D-07:** ADF 빌더 코드는 jira-client.ts 내부 헬퍼 함수. ADF 변환은 Jira 생성에서만 사용.

### 초안 저장 & 수명 관리
- **D-08:** `jira_drafts` SQLite 테이블 신규 생성. thread_ts PK, chat_jid, draft JSON, status, timestamps.
- **D-09:** 초안 키는 thread_ts. Phase 2 D-04에서 thread_ts가 이미 초안 식별자, 스레드당 1개 초안.
- **D-10:** 7일 TTL 만료 정책, 정리는 수동/cron. v1은 간단히, 오래된 초안은 방치해도 무해.
- **D-11:** status 필드로 상태 관리 (draft → approved → created → expired). Phase 4에서 상태 전이 활용.

### 에러 핸들링 UX
- **D-12:** 간결한 한국어 에러 메시지 — "Jira 이슈 생성에 실패했습니다: {원인}" 형태. Phase 2 톤(D-06)과 일관.
- **D-13:** 3단계 에러 분류: 인증 실패, API 에러(400/404/500), 네트워크 에러. 각각 다른 사용자 메시지.
- **D-14:** 재시도 없음 (v1 단순). 네트워크 에러만 1회 자동 재시도.
- **D-15:** 에러 발생해도 초안 유지. Phase 4에서 재시도 가능.

### Claude's Discretion
- jira.js 클라이언트 초기화 패턴 (싱글턴 vs 요청별)
- credential proxy 확장의 구체적 구현 (별도 포트 vs 같은 프록시 경로)
- jira_drafts 테이블 마이그레이션 전략 (기존 db.ts createSchema 패턴)
- IPC actions/ 폴링에서 초안 저장까지의 구체적 연결 흐름
- 테스트 전략 (유닛 테스트, 모킹 범위)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Jira Integration (New)
- `src/jira-client.ts` — 신규 생성 예정. Jira REST API v3 클라이언트, ADF 빌더, 이슈 생성

### Credential & Config
- `src/credential-proxy.ts` — 기존 크리덴셜 프록시. Jira 크리덴셜 주입 확장 필요
- `src/config.ts` — JIRA_PROJECT_KEY 등 새 설정값 추가 위치
- `src/env.ts` — readEnvFile() 패턴. Jira 관련 환경변수 추가

### Data Persistence
- `src/db.ts` — SQLite 스키마 및 쿼리. jira_drafts 테이블 추가 위치. 마이그레이션 패턴(line 87-108)
- `src/types.ts` — JiraDraft 타입 정의 추가 위치

### IPC & Actions
- `src/ipc.ts` — IPC 워처. actions/ 폴링 이미 존재(line 152-186). 초안 처리 로직 추가 필요

### Architecture
- `.planning/codebase/ARCHITECTURE.md` — 전체 아키텍처 참조
- `.planning/codebase/CONVENTIONS.md` — 코딩 컨벤션 (네이밍, 임포트, 에러 처리 패턴)

### Prior Phase Context
- `.planning/phases/01-thread-aware-slack-infrastructure/01-CONTEXT.md` — Phase 1 결정사항 (thread routing, Block Kit, callback registry)
- `.planning/phases/02-ai-conversation-agent/02-CONTEXT.md` — Phase 2 결정사항 (actions/ IPC, 초안 JSON 스키마, 에이전트 톤)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `credential-proxy.ts`: .env에서 크리덴셜 읽어 프록시 주입하는 패턴 — Jira 크리덴셜에 동일 적용
- `db.ts createSchema()`: 테이블 생성 + ALTER TABLE 마이그레이션 패턴 — jira_drafts에 동일 적용
- IPC actions/ 폴링: `ipc.ts` line 152-186에 이미 actions 디렉토리 폴링 구조 존재
- `SendMessageOptions.thread_ts`: 에러 메시지를 올바른 스레드에 전송 가능

### Established Patterns
- 모듈별 단일 책임: db.ts(저장), credential-proxy.ts(인증), ipc.ts(통신) — jira-client.ts도 동일 패턴
- 에러 로깅 후 복구: `catch (err) { logger.error({ err }, 'message') }` — Jira API 에러도 동일
- 환경변수 읽기: `readEnvFile()` — JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY

### Integration Points
- `ipc.ts actions/` 핸들러: 초안 JSON 수신 → db에 저장 → (Phase 4: 미리보기 표시)
- `db.ts`: jira_drafts 테이블 추가, CRUD 함수 (saveDraft, getDraft, updateDraftStatus)
- `credential-proxy.ts` 또는 별도 모듈: Jira API 호출 시 크리덴셜 주입

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
