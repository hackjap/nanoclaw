# Requirements: DevOps Slack-to-Jira Agent

**Defined:** 2026-04-02
**Core Value:** 요청자가 Slack에서 자연어로 DevOps 작업을 요청하면, AI 대화를 통해 구조화된 Jira 이슈가 생성되어야 한다.

## v1 Requirements

### Slack Infrastructure

- [x] **SLCK-01**: 봇이 @멘션에 응답할 때 스레드에서 대화를 시작한다 (thread_ts 지원)
- [x] **SLCK-02**: 봇이 스레드 내 후속 메시지에 스레드 답글로 응답한다
- [ ] **SLCK-03**: Slack interactive components 인프라 구축 (app.action() 핸들러 등록)
- [ ] **SLCK-04**: Block Kit 포맷으로 구조화된 메시지를 발송할 수 있다
- [ ] **SLCK-05**: 특정 이모지 리액션(:jira:)으로 해당 메시지 기반 티켓 생성을 시작한다

### AI Conversation

- [ ] **CONV-01**: @멘션 시 AI 에이전트가 스레드에서 대화를 시작하여 필요한 정보를 질문한다
- [ ] **CONV-02**: AI가 제목, 설명, 이슈타입(Bug/Task/Story) 정보를 대화형으로 수집한다
- [ ] **CONV-03**: 정보 수집이 완료되면 구조화된 Jira 초안 JSON을 IPC로 오케스트레이터에 전달한다

### Jira Integration

- [ ] **JIRA-01**: jira.js를 통해 Jira REST API v3로 고정 프로젝트에 이슈를 생성한다
- [ ] **JIRA-02**: 이슈 설명을 ADF(Atlassian Document Format)로 변환하여 전송한다
- [ ] **JIRA-03**: Jira 크리덴셜(host, email, API token, project key)을 .env/credential proxy로 관리한다

### Draft & Approval

- [ ] **DRFT-01**: 수집된 정보로 Jira 초안 미리보기를 Block Kit 메시지로 스레드에 제시한다
- [ ] **DRFT-02**: 미리보기에 승인/수정 버튼을 포함한다
- [ ] **DRFT-03**: 승인 버튼 클릭 시 오케스트레이터가 Jira 이슈를 생성한다
- [ ] **DRFT-04**: 수정 버튼 클릭 시 컨테이너 에이전트를 재호출하여 수정 대화를 시작한다
- [ ] **DRFT-05**: 초안 데이터를 SQLite에 저장하여 비동기 버튼 클릭에 대응한다

### Notification & Error

- [ ] **NOTF-01**: Jira 이슈 생성 후 스레드에 이슈 링크가 포함된 확인 답글을 게시한다
- [ ] **ERRH-01**: Jira API 실패 시 스레드에 사용자 친화적 에러 메시지를 표시한다
- [ ] **ERRH-02**: Slack interactive component 에러 시 사용자에게 피드백을 제공한다

## v2 Requirements

### Enhanced AI

- **CONV-10**: AI가 대화 내용 분석하여 이슈타입(Bug/Task/Story) 자동 추론
- **CONV-11**: 스레드 컨텍스트 요약으로 이슈 설명 자동 작성
- **CONV-12**: "제목 바꿔줘" 같은 수정 대화 지원

### Extended Fields

- **JIRA-10**: 우선순위(Priority) 필드 지원
- **JIRA-11**: 라벨(Labels) 필드 지원
- **JIRA-12**: 담당자(Assignee) 자동 할당 (Slack-Jira 사용자 매핑)

### Multi-Project

- **JIRA-13**: 대화 중 Jira 프로젝트 선택 지원

## Out of Scope

| Feature | Reason |
|---------|--------|
| 양방향 Jira 동기화 (상태 변경 알림) | 네이티브 Jira Cloud for Slack 앱이 이미 제공. 아키텍처가 완전히 다름 |
| 슬래시 커맨드 (/jira create) | 모달 기반이라 대화형 UX 핵심 가치와 충돌. 네이티브 앱이 이미 제공 |
| DM 기반 대화 | 팀 가시성 상실, 스레드 아키텍처와 충돌 |
| 승인 없이 자동 생성 | 실수로 쓰레기 티켓 생성 위험. 승인은 기능이지 제한이 아님 |
| Jira 이슈 수정/삭제 | 생성 도구이지 Jira 클라이언트가 아님. 수정은 Jira에서 직접 |
| Component/Sprint 필드 | v1 복잡도 폭발. Board 컨텍스트 필요 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SLCK-01 | Phase 1 | Complete |
| SLCK-02 | Phase 1 | Complete |
| SLCK-03 | Phase 1 | Pending |
| SLCK-04 | Phase 1 | Pending |
| SLCK-05 | Phase 4 | Pending |
| CONV-01 | Phase 2 | Pending |
| CONV-02 | Phase 2 | Pending |
| CONV-03 | Phase 2 | Pending |
| JIRA-01 | Phase 3 | Pending |
| JIRA-02 | Phase 3 | Pending |
| JIRA-03 | Phase 3 | Pending |
| DRFT-01 | Phase 4 | Pending |
| DRFT-02 | Phase 4 | Pending |
| DRFT-03 | Phase 4 | Pending |
| DRFT-04 | Phase 4 | Pending |
| DRFT-05 | Phase 3 | Pending |
| NOTF-01 | Phase 4 | Pending |
| ERRH-01 | Phase 3 | Pending |
| ERRH-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
