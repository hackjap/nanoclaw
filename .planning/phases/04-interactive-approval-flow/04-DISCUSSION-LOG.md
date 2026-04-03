# Phase 4: Interactive Approval Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 04-interactive-approval-flow
**Areas discussed:** 미리보기 레이아웃, 수정 플로우, 이모지 트리거 동작, 승인 후 피드백 UX

---

## 미리보기 레이아웃

| Option | Description | Selected |
|--------|-------------|----------|
| 구조화 카드 형태 | Section block으로 제목/설명/타입을 레이블+값 포맷. 하단 Approve/Edit 버튼 | ✓ |
| 컴팩트 인라인 | 한 줄 요약 + expandable. 제목/타입만 먼저, 설명은 펼치기 | |
| 풀 디테일 | 제목/설명/타입 모두 펼쳐서 표시 | |

**User's choice:** 구조화 카드 형태

| Option | Description | Selected |
|--------|-------------|----------|
| 200자 절단 + "..." | 미리보기는 간결하게, 전체는 Jira에서 | ✓ |
| 전체 표시 | 설명 전문을 그대로 표시 | |
| Claude 재량 | 설명 길이에 따라 적절히 판단 | |

**User's choice:** 200자 절단 + "..."

---

## 수정(Edit) 플로우

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 초안 + 수정 대화 | 컨테이너 재호출 시 기존 초안 컨텍스트 전달, 특정 필드만 수정 | ✓ |
| 처음부터 재수집 | 초안 삭제하고 대화 처음부터 | |
| 인라인 필드 수정 | 텍스트로 직접 수정 | |

**User's choice:** 기존 초안 + 수정 대화

| Option | Description | Selected |
|--------|-------------|----------|
| 미리보기 갱신 | chat.update로 기존 메시지 교체. 버튼 유지 | ✓ |
| 새 미리보기 추가 | 수정된 초안을 새 메시지로 추가 | |
| Claude 재량 | Claude가 적절히 판단 | |

**User's choice:** 미리보기 갱신

---

## 이모지 트리거 동작

| Option | Description | Selected |
|--------|-------------|----------|
| AI 대화 시작 | 메시지 내용을 컨텍스트로 AI가 부족한 정보 추가 질문 | ✓ |
| 즉시 초안 생성 | 메시지 내용으로 자동 추론, 바로 미리보기 | |
| Claude 재량 | 메시지 구체성에 따라 판단 | |

**User's choice:** AI 대화 시작

| Option | Description | Selected |
|--------|-------------|----------|
| 모든 채널 멤버 | 누구나 :jira: 리액션 가능. v1은 단순하게 | ✓ |
| 특정 사용자만 | allowlist 기반 권한 제어 | |

**User's choice:** 모든 채널 멤버

---

## 승인 후 피드백 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 미리보기 업데이트 | 기존 메시지를 "✅ 생성 완료" + Jira 링크로 교체. 버튼 제거 | ✓ |
| 미리보기 유지 + 새 답글 | 미리보기는 그대로(버튼 disabled), 새 답글로 링크 | |

**User's choice:** 미리보기 업데이트

| Option | Description | Selected |
|--------|-------------|----------|
| 에러 메시지 + 버튼 유지 | 에러 답글 게시, 미리보기 버튼 유지하여 재시도 가능 | ✓ |
| 에러 메시지 + 재시도 버튼 | 미리보기 업데이트하여 에러 표시 + 재시도 전용 버튼 | |
| Claude 재량 | 에러 타입에 따라 판단 | |

**User's choice:** 에러 메시지 + 버튼 유지

---

## Claude's Discretion

- Block Kit builder 함수의 구체적 구현 방식
- reaction_added 핸들러 등록 위치 및 구조
- 수정 대화 시 에이전트 프롬프트 설계
- 승인 처리 중 로딩 상태 표시 여부
- 에러 메시지의 구체적 문구

## Deferred Ideas

None — discussion stayed within phase scope
