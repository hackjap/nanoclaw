# Phase 2: AI Conversation Agent - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the discussion.

**Date:** 2026-04-02
**Phase:** 02-ai-conversation-agent
**Mode:** discuss
**Areas discussed:** 대화 수집 전략, 초안 출력 메커니즘, 에이전트 성격/톤, 완료 판단 & 핸드오프

## Discussion Summary

### 대화 수집 전략
| Question | Answer |
|----------|--------|
| 수집 방식 | 추론 우선 — 초기 메시지에서 가능한 정보 추론 후 부족한 것만 질문 |
| 수집 필드 | 기본 3개만 (제목, 설명, 이슈타입) |

### 초안 출력 메커니즘
| Question | Answer |
|----------|--------|
| IPC 전달 방식 | 새 actions/ 디렉토리 신설 |
| JSON 스키마 | 최소한 — title, description, issueType + IPC 래퍼(chatJid, thread_ts) |

### 에이전트 성격/톤
| Question | Answer |
|----------|--------|
| 언어 | 한국어 |
| 대화 스타일 | 간결하고 직접적 |

### 완료 판단 & 핸드오프
| Question | Answer |
|----------|--------|
| 완료 기준 | 에이전트 자율 판단 — 3개 필드 확보 시 자동 초안 생성 |
| 핸드오프 | IPC 초안 전달만 — 오케스트레이터가 후속 처리 트리거 |
