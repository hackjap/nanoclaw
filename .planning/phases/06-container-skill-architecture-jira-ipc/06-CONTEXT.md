# Phase 6: Container Skill Architecture — Jira IPC - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

컨테이너 스킬 기반으로 Jira 에이전트를 구현. 현재 그룹 CLAUDE.md에 하드코딩된 Jira 인스트럭션을 `container/skills/jira/SKILL.md`로 분리하여 스킬 아키텍처로 전환한다. IPC actions/ 파이프라인과 오케스트레이터 측 코드(jira-client.ts, approval-flow.ts, db.ts)는 그대로 유지한다.

</domain>

<decisions>
## Implementation Decisions

### 스킬 구조 설계
- **D-01:** SKILL.md 인스트럭션 전용 스킬로 구성. 별도 구현 파일(MCP 도구, 헬퍼 스크립트) 없이 SKILL.md만으로 에이전트에게 Jira 정보 수집 플로우를 지시한다.
- **D-02:** 스킬 위치는 `container/skills/jira/SKILL.md`. 기존 container/skills/ 패턴(agent-browser, capabilities 등)과 동일하게 컨테이너 실행 시 `.claude/skills/`로 복사된다.

### IPC→스킬 전환 범위
- **D-03:** IPC actions/ 파이프라인은 현재 방식 그대로 유지. 에이전트가 IPC actions/에 `jira_draft` JSON을 작성하는 패턴은 검증된 방식이므로 변경하지 않는다.
- **D-04:** 변경 범위는 CLAUDE.md의 인스트럭션을 SKILL.md로 분리/캡슐화하는 것에 한정. 오케스트레이터 측 코드(ipc.ts, jira-client.ts, approval-flow.ts, db.ts)는 수정하지 않는다.

### 에이전트 호출 방식
- **D-05:** 그룹 CLAUDE.md에 스킬 참조를 명시하여 에이전트가 Jira 스킬을 발견. "사용자가 Jira/티켓 관련 요청을 하면 /jira 스킬을 사용하라"는 한 줄 참조.
- **D-06:** 에이전트가 Skill 도구로 SKILL.md를 로드하여 실행. SDK의 기존 스킬 매커니즘 활용.
- **D-07:** 추론 우선 방식 유지 (Phase 2 D-01). 사용자 메시지에서 가능한 필드를 자동 추론한 뒤, 부족한 정보만 추가 질문.

### 기존 코드 마이그레이션
- **D-08:** 스킬 분리만 수행. 그룹 CLAUDE.md의 Jira 인스트럭션을 SKILL.md로 이동하고, CLAUDE.md에는 스킬 참조 한 줄만 남긴다.
- **D-09:** 기존 오케스트레이터 코드(ipc.ts actions/ 핸들러, jira-client.ts, approval-flow.ts, db.ts jira_drafts)는 그대로 유지. 리팩터링 없음.

### Claude's Discretion
- SKILL.md의 구체적 프롬프트 설계 (정보 수집 흐름, 추론 패턴, IPC JSON 작성 가이드)
- 그룹 CLAUDE.md에서 Jira 스킬 참조 문구의 구체적 표현
- 스킬 트리거 키워드 패턴 설계 (어떤 메시지가 Jira 플로우를 활성화할지)
- 테스트 전략 (스킬 통합 테스트 범위)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Container Skills (스킬 패턴 참조)
- `container/skills/agent-browser/SKILL.md` — 기존 스킬 구조 참조. SKILL.md 형식, 디렉토리 구성
- `container/skills/capabilities/SKILL.md` — 인스트럭션 전용 스킬 예시 (구현 파일 없이 SKILL.md만)
- `container/skills/slack-formatting/SKILL.md` — 포맷팅 관련 스킬 예시

### Container Runner (스킬 복사 메커니즘)
- `src/container-runner.ts` line 150-160 — 컨테이너 실행 시 `container/skills/` → `.claude/skills/` 복사 로직
- `src/container-runner.ts` line 167-178 — IPC 디렉토리 구조 (actions/ 포함)

### IPC & Actions (현재 초안 전달 메커니즘)
- `src/ipc.ts` line 170-210 — actions/ 폴링, `jira_draft` 타입 처리, `saveDraft()` 호출, Block Kit 미리보기 트리거
- `container/agent-runner/src/index.ts` — 컨테이너 에이전트 실행, IPC 출력 패턴

### Jira Integration (유지되는 코드)
- `src/jira-client.ts` — Jira REST API 클라이언트, ADF 빌더, 이슈 생성
- `src/approval-flow.ts` — Block Kit 미리보기, 승인/수정 버튼 핸들러
- `src/db.ts` line 86-108 — jira_drafts 테이블 스키마 및 CRUD

### Prior Phase Context
- `.planning/phases/02-ai-conversation-agent/02-CONTEXT.md` — 초안 JSON 스키마(D-04), 추론 우선(D-01), 에이전트 톤(D-05/D-06)
- `.planning/phases/04-interactive-approval-flow/04-CONTEXT.md` — 승인 플로우, 이모지 트리거, 버튼 UX

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `container/skills/` 디렉토리: 기존 스킬 패턴 그대로 활용. SKILL.md만 추가하면 자동 복사
- `container-runner.ts` 스킬 sync 로직: `container/skills/` → `.claude/skills/` 자동 복사 이미 구현
- Phase 2 CLAUDE.md Jira 인스트럭션: SKILL.md의 초안으로 직접 활용 가능

### Established Patterns
- 스킬 디렉토리 구조: `container/skills/{name}/SKILL.md` + 선택적 구현 파일
- 에이전트 IPC 출력: JSON 파일을 `/workspace/ipc/actions/`에 작성 → 오케스트레이터 폴링
- 그룹 CLAUDE.md: 에이전트 행동 지시의 주 진입점. 스킬 참조 추가 위치

### Integration Points
- `container/skills/jira/SKILL.md` — 신규 생성. Jira 정보 수집 + IPC 초안 작성 인스트럭션
- 그룹 CLAUDE.md — Jira 하드코딩 인스트럭션 제거, 스킬 참조 한 줄 추가
- 기존 오케스트레이터 코드 — 변경 없음 (IPC actions/ 핸들러, jira-client, approval-flow, db)

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

*Phase: 06-container-skill-architecture-jira-ipc*
*Context gathered: 2026-04-04*
