# NanoClaw Configuration Guide

NanoClaw의 설정과 지침 관리 구조를 설명합니다.

## 설정 계층 구조

```
사용자 설정 경로
├── .env                              ← 런타임 변수
├── ~/.config/nanoclaw/               ← 보안 정책 (프로젝트 밖, 컨테이너 접근 불가)
│   ├── sender-allowlist.json
│   └── mount-allowlist.json
└── groups/                           ← 에이전트 행동 지침 (채널별 격리)
    ├── global/CLAUDE.md              ← 모든 그룹 공통
    ├── main/CLAUDE.md                ← 메인 채널 (관리자)
    ├── slack_main/CLAUDE.md          ← Slack 채널
    └── whatsapp_family/CLAUDE.md     ← WhatsApp 그룹 등
```

---

## 1. `.env` — 런타임 설정

프로젝트 루트의 `.env` 파일에서 런타임 동작을 제어합니다. 시크릿(API 키, 토큰)은 여기에 포함되지 않고 credential proxy가 별도 관리합니다.

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ASSISTANT_NAME` | `Andy` | 에이전트 이름. 트리거 패턴(`@이름`)에 사용 |
| `ASSISTANT_HAS_OWN_NUMBER` | `false` | 에이전트 전용 전화번호 사용 여부 |
| `TZ` | 시스템 감지 → `UTC` | 타임존 (IANA 형식, 예: `Asia/Seoul`) |
| `CONTAINER_IMAGE` | `nanoclaw-agent:latest` | 에이전트 컨테이너 이미지 |
| `CONTAINER_TIMEOUT` | `1800000` (30분) | 컨테이너 실행 타임아웃 (ms) |
| `CONTAINER_MAX_OUTPUT_SIZE` | `10485760` (10MB) | 에이전트 출력 최대 크기 |
| `CREDENTIAL_PROXY_PORT` | `3001` | 크레덴셜 프록시 포트 |
| `MAX_MESSAGES_PER_PROMPT` | `10` | 프롬프트당 포함할 최대 메시지 수 |
| `IDLE_TIMEOUT` | `1800000` (30분) | 컨테이너 유휴 유지 시간 (ms) |
| `MAX_CONCURRENT_CONTAINERS` | `5` | 동시 실행 가능한 컨테이너 수 |

---

## 2. `~/.config/nanoclaw/` — 보안 정책

보안 관련 설정은 프로젝트 디렉토리 밖에 저장되어 컨테이너에서 접근할 수 없습니다.

### `sender-allowlist.json` — 발신자 허용 목록

채팅별로 누가 에이전트를 트리거할 수 있는지 제어합니다.

```json
{
  "default": { "allow": "*", "mode": "trigger" },
  "chats": {
    "<chat-jid>": {
      "allow": ["sender-id-1", "sender-id-2"],
      "mode": "trigger"
    }
  },
  "logDenied": true
}
```

- **trigger 모드** (기본): 모든 메시지가 저장되지만, 허용된 발신자만 에이전트를 트리거
- **drop 모드**: 비허용 발신자의 메시지를 아예 저장하지 않음
- 파일이 없거나 유효하지 않으면 모든 발신자 허용 (fail-open)
- 본인 메시지(`is_from_me`)는 allowlist를 우회

### `mount-allowlist.json` — 마운트 허용 경로

그룹의 `containerConfig.additionalMounts`로 추가 디렉토리를 마운트할 때, 이 화이트리스트에 등록된 경로만 허용됩니다.

---

## 3. `groups/{folder}/CLAUDE.md` — 에이전트 행동 지침

에이전트가 컨테이너 안에서 읽는 지침 파일입니다. 사용자가 자유롭게 수정할 수 있습니다.

### 계층과 적용 범위

| 파일 | 적용 범위 | 쓰기 권한 |
|------|-----------|-----------|
| `groups/global/CLAUDE.md` | 모든 그룹 | main 채널만 |
| `groups/main/CLAUDE.md` | 메인 채널만 | main 채널 |
| `groups/{channel_name}/CLAUDE.md` | 해당 채널만 | 해당 채널 |

### 수정 방법

**방법 1: 호스트에서 직접 편집**

```bash
# 메인 채널 지침 수정
vim groups/main/CLAUDE.md

# 전체 그룹 공통 지침 수정
vim groups/global/CLAUDE.md
```

**방법 2: 채팅으로 지시**

- "한국어로 답변해줘, 기억해" → 해당 그룹의 `CLAUDE.md`에 기록
- "globally remember: 항상 한국어로 답변" → `groups/global/CLAUDE.md`에 기록

### 커스터마이즈 예시

```markdown
# groups/main/CLAUDE.md 에 추가

## 언어
항상 한국어로 답변하세요.

## 톤
격식체 대신 친근한 반말을 사용하세요.

## 금지 사항
- 이모지를 사용하지 마세요
- 영어 단어를 남발하지 마세요
```

### 폴더 네이밍 규칙

채널 prefix + underscore + 그룹명 (소문자, 하이픈):

| 채널 | 그룹명 | 폴더명 |
|------|--------|--------|
| WhatsApp | Family Chat | `whatsapp_family-chat` |
| Telegram | Dev Team | `telegram_dev-team` |
| Discord | General | `discord_general` |
| Slack | Engineering | `slack_engineering` |

### 채널별 메시지 포매팅

CLAUDE.md에 포함된 포매팅 규칙은 폴더 prefix로 자동 분기됩니다:

- **`slack_`**: Slack mrkdwn (`*bold*`, `<url|text>` 링크, `:emoji:`)
- **`whatsapp_`, `telegram_`**: 단일 asterisk (`*bold*`), `##` 헤딩 사용 금지
- **`discord_`**: 표준 Markdown (`**bold**`, `[text](url)`)

---

## 4. 격리 메커니즘

### 컨테이너 마운트 구조

각 그룹은 별도의 Linux 컨테이너에서 실행됩니다:

| 컨테이너 경로 | 호스트 경로 | 접근 |
|----------------|-------------|------|
| `/workspace/project` | 프로젝트 루트 | **read-only** |
| `/workspace/group` | `groups/{folder}/` | **read-write** |
| `/workspace/ipc` | IPC 디렉토리 | read-write |

- 에이전트는 자기 그룹 폴더만 쓸 수 있음
- 프로젝트 소스코드는 read-only로 마운트되어 수정 불가
- `.env` 파일은 shadow mount로 에이전트에서 보이지 않음

### 추가 마운트

그룹 등록 시 `containerConfig.additionalMounts`로 외부 디렉토리를 추가할 수 있습니다:

```json
{
  "containerConfig": {
    "additionalMounts": [
      {
        "hostPath": "~/projects/webapp",
        "containerPath": "webapp",
        "readonly": false
      }
    ]
  }
}
```

추가된 디렉토리는 `/workspace/extra/{containerPath}`로 마운트됩니다. `mount-allowlist.json`에 등록된 경로만 허용됩니다.

---

## 5. 프로젝트 루트 `CLAUDE.md`

프로젝트 루트의 `CLAUDE.md`는 에이전트용이 아니라 **NanoClaw 코드베이스 개발용** 지침입니다. 호스트 머신의 Claude Code가 개발 작업 시 참조합니다.

| 파일 | 대상 | 용도 |
|------|------|------|
| `/CLAUDE.md` | 호스트 Claude Code (개발자) | 코드베이스 구조, 빌드, 디버깅 |
| `groups/*/CLAUDE.md` | 컨테이너 에이전트 (사용자) | 에이전트 행동, 언어, 톤 |

---

## 6. 글로벌 vs Main 채널 CLAUDE.md 적용 규칙

`groups/global/CLAUDE.md`는 **모든 그룹에 자동 적용되지 않습니다**. Main 채널(`isMain: true`)은 제외됩니다.

### 적용 방식

| 그룹 유형 | 자체 CLAUDE.md | 글로벌 CLAUDE.md | 적용 방식 |
|-----------|---------------|-----------------|-----------|
| Main (`isMain: true`) | O | **X (무시)** | 프로젝트 전체가 read-only로 마운트되어 직접 접근 가능 |
| 일반 그룹 | O | **O** | `systemPrompt.append`로 시스템 프롬프트에 주입 |

### 배경

Main 채널은 프로젝트 루트를 read-only로 마운트받기 때문에 `groups/global/CLAUDE.md`에 파일시스템으로 직접 접근할 수 있습니다. 반면 일반 그룹은 자기 폴더만 마운트되므로, 에이전트 러너가 글로벌 CLAUDE.md를 읽어 시스템 프롬프트에 append하는 방식으로 주입합니다.

### 주의사항

글로벌에 지침을 추가해도 Main 채널에는 적용되지 않으므로, Main 채널의 지침은 해당 그룹 폴더의 CLAUDE.md에 직접 추가해야 합니다.

```
# 예: 한국어 지침을 모든 채널에 적용하려면
groups/global/CLAUDE.md      ← 일반 그룹용
groups/slack_main/CLAUDE.md  ← Main 채널이 slack_main인 경우 여기에도 추가
```

---

## 7. 설정 변경 후 반영

변경 유형에 따라 반영 방식이 다릅니다.

### 즉시 반영 (빌드/재시작 불필요)

| 변경 대상 | 조건 |
|-----------|------|
| `groups/*/CLAUDE.md` | **새 컨테이너가 뜰 때** 반영. 기존 실행 중인 컨테이너에는 적용되지 않음 |
| `~/.config/nanoclaw/*.json` | 다음 메시지 처리 시 반영 |

> **주의**: CLAUDE.md는 볼륨 마운트되어 있지만, Claude Agent SDK가 **세션 시작 시에만** 읽습니다. 기존 컨테이너가 `IDLE_TIMEOUT` (기본 30분) 동안 살아있으면 변경사항이 반영되지 않습니다.

기존 컨테이너를 즉시 종료하려면:

```bash
# 실행 중인 nanoclaw 컨테이너 확인
docker ps | grep nanoclaw-agent

# 특정 컨테이너 종료 (새 메시지 시 자동 재생성)
docker stop <container-name>
```

### 빌드 + 재시작 필요

| 변경 대상 | 명령 |
|-----------|------|
| `src/*.ts` (TypeScript 소스) | `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw` |
| `.env` (런타임 변수) | `launchctl kickstart -k gui/$(id -u)/com.nanoclaw` (빌드 불필요) |
| 컨테이너 이미지 (Dockerfile 등) | `./container/build.sh` |
