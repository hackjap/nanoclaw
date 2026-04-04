# Phase 6: Container Skill Architecture — Jira IPC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 06-container-skill-architecture-jira-ipc
**Areas discussed:** 스킬 구조 설계, IPC→스킬 전환 범위, 에이전트 호출 방식, 기존 코드 마이그레이션

---

## 스킬 구조 설계

| Option | Description | Selected |
|--------|-------------|----------|
| 인스트럭션 전용 | SKILL.md만으로 구성. 에이전트가 IPC actions/로 초안 JSON을 작성하는 현재 방식을 스킬 인스트럭션으로 캡슐화 | ✓ |
| MCP 도구 기반 | Jira 기능을 MCP 도구로 노출. 에이전트가 도구를 직접 호출. 오케스트레이터 승인 플로우와 통합이 복잡 | |
| 하이브리드 | SKILL.md + 헬퍼 스크립트. Bash로 Jira API 직접 호출. IPC 우회 가능하지만 컨테이너 내 크리덴셜 관리 필요 | |

**User's choice:** 인스트럭션 전용 (추천)
**Notes:** 없음

### 스킬 트리거 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 자동 활성화 | 그룹 CLAUDE.md에 스킬 참조 포함. 에이전트가 자동으로 Jira 플로우 진입 | ✓ |
| 슬래시 커맨드 | /jira 커맨드로 명시적 호출 | |
| 키워드 감지 | 메시지 내 Jira/티켓/이슈 키워드로 자동 활성화 | |

**User's choice:** 자동 활성화 (추천)
**Notes:** 사용자가 "자동 활성화"의 의미에 대해 설명 요청. CLAUDE.md에 스킬 참조를 넣어서 에이전트가 사용자 메시지를 분석하여 자동으로 Jira 플로우에 들어가는 방식임을 설명함.

### 스킬 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 초안까지만 | 에이전트: 정보 수집+초안 JSON → IPC 전달. 오케스트레이터: DB 저장+버튼 UI+Jira 생성 | ✓ |
| 전체 플로우 포함 | 에이전트가 수집+승인+Jira생성까지 전체 담당 | |

**User's choice:** 초안까지만 (추천)
**Notes:** 사용자가 보안 이유인지 NanoClaw 아키텍처 특성인지 질문. 둘 다라고 설명 — (1) 컨테이너는 대화 후 종료되어 비동기 버튼 처리 불가 (2) 크리덴셜이 호스트에만 존재. 사용자는 기능 구현이 최우선이라 보안보다 기능에 문제 없는지 확인. 이 방식이 기능적으로도 더 나은 UX(Block Kit 버튼, 비동기 승인)를 제공함을 설명.

---

## IPC→스킬 전환 범위

| Option | Description | Selected |
|--------|-------------|----------|
| IPC 유지 + 스킬로 캡슐화 | CLAUDE.md 하드코딩 → SKILL.md 분리. IPC 통신은 검증된 패턴 유지 | ✓ |
| IPC 제거 + MCP 도구 | MCP 도구(submit_jira_draft)로 동기적 호출. IPC 폴링 대신. NanoClaw MCP 서버 확장 필요 | |
| IPC 간소화 | IPC 유지 + 헬퍼 스크립트로 JSON 작성 추상화 | |

**User's choice:** IPC 유지 + 스킬로 캡슐화 (추천)
**Notes:** 없음

---

## 에이전트 호출 방식

### 인스트럭션 전달 방식

| Option | Description | Selected |
|--------|-------------|----------|
| CLAUDE.md에 스킬 참조 | 그룹 CLAUDE.md에 'Jira 요청 시 /jira 스킬 사용' 참조 명시 | ✓ |
| SKILL.md 자동 로드 | SDK가 .claude/skills/ 스킬 자동 인식. CLAUDE.md 수정 불필요 | |
| CLAUDE.md에 직접 포함 | 현재 Phase 2 방식 유지. 스킬 아키텍처 전환 목적에 안 맞음 | |

**User's choice:** CLAUDE.md에 스킬 참조 (추천)
**Notes:** 없음

### 응답 패턴

| Option | Description | Selected |
|--------|-------------|----------|
| 추론 우선 | Phase 2 D-01 유지. 메시지 분석 → 필드 자동 추론 → 부족분만 질문 | ✓ |
| 순차적 수집 | 제목→설명→이슈타입 순서로 하나씩 질문 | |

**User's choice:** 추론 우선 (현재 유지)
**Notes:** 없음

---

## 기존 코드 마이그레이션

### 마이그레이션 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 스킬 분리만 | CLAUDE.md 인스트럭션 → SKILL.md 이동. 나머지 오케스트레이터 코드 유지 | ✓ |
| 모듈 정리 | Jira 관련 코드 통합 + 스킬 연동 구조 정리 | |
| 전체 리팩터링 | IPC, 초안, 승인을 스킬 중심 전면 재설계 | |

**User's choice:** 스킬 분리만 (추천)
**Notes:** 없음

### CLAUDE.md 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 스킬 참조만 | CLAUDE.md에 'Jira 요청 시 /jira 스킬 사용' 한 줄만 남김 | ✓ |
| 기본 컨텍스트 유지 | 프로젝트키, 언어 설정 등 기본 정보는 CLAUDE.md에 유지 | |

**User's choice:** 스킬 참조만 (추천)
**Notes:** 없음

---

## Claude's Discretion

- SKILL.md의 구체적 프롬프트 설계
- 스킬 트리거 키워드 패턴 설계
- 그룹 CLAUDE.md 참조 문구
- 테스트 전략

## Deferred Ideas

None — discussion stayed within phase scope
