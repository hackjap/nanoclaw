# DevOps Slack-to-Jira Agent

## What This Is

NanoClaw 기반 Slack 봇 에이전트로, DevOps 작업 요청을 Slack 대화를 통해 Jira 이슈로 변환하는 워크플로우를 자동화한다. 요청자가 Slack 채널에서 봇을 멘션하면, 스레드에서 대화형으로 Jira 초안을 작성하고, 승인 버튼을 통해 Jira 이슈를 생성한다.

## Core Value

요청자가 Slack에서 자연어로 DevOps 작업을 요청하면, AI 대화를 통해 구조화된 Jira 이슈가 생성되어야 한다.

## Requirements

### Validated

- ✓ Slack 채널 연동 (Socket Mode) — existing (`src/channels/slack.ts`)
- ✓ 메시지 수신/발신 — existing (channel registry)
- ✓ 컨테이너 격리 에이전트 실행 — existing (`src/container-runner.ts`)
- ✓ SQLite 메시지/세션 저장 — existing (`src/db.ts`)
- ✓ 크리덴셜 프록시를 통한 API 키 관리 — existing (`src/credential-proxy.ts`)
- ✓ @bot 멘션으로 에이전트 호출 시 스레드에서 대화 시작 — Validated in Phase 2
- ✓ AI가 대화형으로 질문하며 Jira 이슈 정보 수집 (제목, 설명, 이슈타입) — Validated in Phase 2
- ✓ 수집된 정보로 Jira 이슈 초안 생성 및 미리보기 제시 — Validated in Phase 4
- ✓ 승인/수정 버튼(Slack interactive components) 제공 — Validated in Phase 4
- ✓ 승인 시 Jira API를 통해 고정 프로젝트에 이슈 생성 — Validated in Phase 4
- ✓ 생성된 Jira 이슈 링크를 스레드에 답글로 알림 — Validated in Phase 4

### Active

(All requirements validated — see below)

### Out of Scope

- 다중 Jira 프로젝트 선택 — v1은 고정 1개 프로젝트
- 우선순위/라벨/담당자 등 추가 필드 — 기본 필드(제목/설명/타입)부터 시작
- DM 기반 대화 — 스레드에서만 진행
- Jira 이슈 수정/삭제 — 생성만 지원
- 슬래시 커맨드 호출 — 멘션 방식만 지원

## Context

- NanoClaw는 이미 Slack 채널 통합이 되어있음 (`@slack/bolt` Socket Mode)
- 컨테이너 에이전트가 Claude Agent SDK를 통해 대화를 처리하는 구조
- Jira API 연동은 새로 추가해야 함 (Atlassian MCP 또는 REST API)
- Slack interactive components (버튼/블록)는 현재 NanoClaw에 없어 새로 구현 필요
- 스레드 기반 대화는 기존 Slack 채널의 메시지 처리 흐름을 확장해야 함

## Constraints

- **Tech stack**: NanoClaw 기존 아키텍처 (TypeScript, Node.js, Slack Bolt) 위에 구축
- **Auth**: 크리덴셜은 OneCLI/credential proxy를 통해 관리
- **Jira API**: Atlassian REST API v3 또는 MCP 도구 활용
- **Slack**: Socket Mode 유지, interactive components 추가 필요

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 스레드 기반 대화 | 채널 noise 최소화, 요청별 컨텍스트 격리 | ✓ Phase 2 |
| 버튼 기반 승인 | 텍스트보다 명확한 UX, 실수 방지 | ✓ Phase 4 |
| 고정 프로젝트 | v1 복잡도 최소화, 추후 확장 가능 | ✓ Phase 3 |
| 기본 필드만 | MVP 빠른 구현, 추후 필드 확장 | ✓ Phase 3 |
| :jira: 이모지 리액션 | 멘션 외 대안적 진입점, UX 편의성 | ✓ Phase 4 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-03 after Phase 4 completion*
