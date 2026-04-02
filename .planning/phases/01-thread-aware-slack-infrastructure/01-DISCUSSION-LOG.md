# Phase 1: Thread-Aware Slack Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-Thread-Aware Slack Infrastructure
**Areas discussed:** Thread Routing, Channel Interface, Interactive Scope, Button Callback Handling

---

## Thread Routing

| Option | Description | Selected |
|--------|-------------|----------|
| 스레드도 전달 (추천) | 모든 스레드 답글을 thread_ts와 함께 에이전트에 전달 | ✓ |
| Jira 스레드만 | Jira 대화용 스레드만 다르게 처리 | |
| 네가 결정 | Claude가 기술적으로 최적의 방식을 판단 | |

**User's choice:** 스레드도 전달 (추천)
**Notes:** 없음

---

## Channel Interface

| Option | Description | Selected |
|--------|-------------|----------|
| 확장 (추천) | sendMessage에 선택적 options 객체 추가, 하위호환 유지 | ✓ |
| Slack만 확장 | Channel 인터페이스 그대로, SlackChannel에 별도 메서드 추가 | |
| 네가 결정 | Claude가 판단 | |

**User's choice:** 확장 (추천)
**Notes:** 없음

---

## Interactive Components Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 버튼만 (추천) | v1은 승인/수정 버튼만, 최소 인프라로 빠르게 검증 | ✓ |
| 버튼 + 메뉴 | 이슈타입 선택 드롭다운 등도 지원 | |
| 네가 결정 | Claude가 판단 | |

**User's choice:** 버튼만 (추천)
**Notes:** 없음

---

## Button Callback Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 오케스트레이터 (추천) | 호스트 프로세스에서 app.action() 직접 처리 | ✓ |
| IPC 전달 | 버튼 이벤트를 IPC로 컨테이너에 전달 | |
| 네가 결정 | Claude가 판단 | |

**User's choice:** 오케스트레이터 (추천)
**Notes:** 없음

---

## Claude's Discretion

- Block Kit 메시지 빌더 구현 방식
- app.action() 핸들러 내부 라우팅 구조
- 스레드 컨텍스트 IPC 프로토콜 확장 방식
- 테스트 전략

## Deferred Ideas

없음
