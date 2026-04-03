# Phase 5: Bot Liveness Reactions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 05-bot-liveness-reactions
**Areas discussed:** 수신 확인 리액션, 진행 상태 이모지 전환, 진행 중 텍스트 메시지, 범위

---

## 수신 확인 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 해당 메시지에 리액션 추가 | 요청 메시지에 👀 이모지 리액션을 달아서 '봤다'는 신호 | ✓ |
| 스레드에 텍스트 답글 | 스레드에 '요청을 확인했습니다' 같은 텍스트 메시지 | |
| 둘 다 | 리액션(👀)으로 빠르게 확인 + 진행이 길어지면 텍스트로 상태 업데이트 | |

**User's choice:** 해당 메시지에 리액션 추가
**Notes:** 사용자는 눈이모지(👀)로 수신 확인을 원함

## 수신 확인 이모지 선택

| Option | Description | Selected |
|--------|-------------|----------|
| 👀 (eyes) | 가장 직관적인 '봤다' 신호 | ✓ |
| ✅ (check) | 수신 확인 + 처리 예정 | |
| 🤖 (robot) | 봇이 인지했다는 신호 | |

**User's choice:** 👀 (eyes)

## 진행 상태 표시 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 이모지 리액션만 | 요청 메시지에 작업 중(⚙️) 이모지 추가, 완료 시 체크(✅)로 교체 | |
| 텍스트 답글 | 스레드에 '작업 중입니다...' 답글 후, 완료되면 결과 답글 | |
| 이모지 + 텍스트 병행 | 이모지로 즉시 피드백 + 오래 걸리면 텍스트로 상세 상태 | ✓ |

**User's choice:** 이모지 + 텍스트 병행

## 진행 중 텍스트 스타일

| Option | Description | Selected |
|--------|-------------|----------|
| 간결 상태만 | '작업 중입니다...' 정도의 간단한 메시지 | |
| 작업 내용 포함 | '요청 분석 중입니다...', 'Jira 초안 작성 중...' 등 구체적 | |
| Claude에게 위임 | 상황에 맞게 Claude가 결정 | ✓ |

**User's choice:** Claude에게 위임

## 이모지 전환 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 단계별 전환 | 수신(👀) → 진행 중(⚙️) → 완료(✅)/실패(❌) 순서로 이모지 교체 | ✓ |
| 누적 추가 | 수신(👀) 유지 + 진행(⚙️) 추가 + 완료(✅) 추가 — 모든 리액션 남김 | |
| Claude에게 위임 | 상황에 맞게 Claude가 결정 | |

**User's choice:** 단계별 전환

## 범위

| Option | Description | Selected |
|--------|-------------|----------|
| @멘션 요청만 | 봇을 멘션한 메시지에만 리액션 추가 | |
| @멘션 + :jira: 이모지 | 멘션과 :jira: 이모지 트리거 모두에 리액션 | |
| 모든 트리거 | 봇이 반응하는 모든 경우에 리액션 추가 | ✓ |

**User's choice:** 모든 트리거

## Claude's Discretion

- 진행 중 텍스트 메시지의 구체적 문구와 타이밍
- 리액션 에러 핸들링 방식
- `reactions.add`/`reactions.remove` 구현 위치

## Deferred Ideas

None
