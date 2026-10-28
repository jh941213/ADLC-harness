---
name: docs-interfaces
description: "API·이벤트 인터페이스 문서(OpenAPI·swagger·AsyncAPI 명세, 엔드포인트 레퍼런스, API 구성도·시퀀스, API CHANGELOG)를 만들거나 코드와 맞출 때 사용. 시스템 구성도는 docs-architecture, API 설계 원칙은 api-design-principles."
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# 인터페이스/API 문서 스킬

시스템 간 계약을 문서화한다. 명세는 Git이 단일 진실 소스(docs-as-code).

## 입력

$ARGUMENTS

## 산출물 맵

| 대상 | 산출물 | 위치 |
|------|--------|------|
| REST API | OpenAPI 3.1 명세 | `docs/api/openapi.yaml` |
| 이벤트/메시지 인터페이스 | AsyncAPI 3.0 명세 | `docs/api/asyncapi.yaml` |
| API 구성도 (시스템 간 호출 관계) | C4 Container + 핵심 플로우별 시퀀스 다이어그램 | `docs/api/README.md` |
| 사람이 읽는 레퍼런스 | 엔드포인트별 요청·응답 표 + 복붙 가능한 호출 예시 | `docs/api/reference.md` |
| API 변경 이력 | breaking/non-breaking 구분 + deprecation 일정 | `docs/api/CHANGELOG.md` |

## Spec-first vs Code-first 판단

- **여러 팀/외부가 계약을 소비** → spec-first: `docs/api/openapi.yaml`을 먼저 작성·리뷰, 코드가 명세를 따른다
- **단일 팀 내부 서비스** → code-first 허용. 단, 코드에서 생성한 명세를 반드시 커밋하고 CI에서 diff (드리프트 게이트는 docs-ci 스킬이 설치)
- 어느 쪽이든 명세 파일이 레포에 존재해야 한다 — "코드가 곧 문서"는 인정하지 않음

## OpenAPI 작성 규칙

1. 코드에서 실제 라우트/스키마를 읽고 작성 — 추측 금지. 확인 불가한 필드는 TODO 주석으로 표시
2. `operationId` 필수, 태그로 리소스 그룹화, 4xx/5xx 응답 포함
3. 예시(example)는 실제 동작하는 값으로
4. 인증 스킴(`securitySchemes`) 명시
5. 이벤트 기반 인터페이스(큐, 웹소켓, 웹훅)는 OpenAPI에 우겨넣지 말고 AsyncAPI로 분리

## API 구성도 + 흐름도

- 시스템 간 토폴로지: C4 Container 다이어그램 1개
- 핵심 플로우(인증, 주문 생성 등)마다 시퀀스 다이어그램 1개 — 문법은 `../docs-architecture/references/mermaid-conventions.md` 공용 관례 사용
- 에러 경로(`alt` 블록)를 최소 1개 포함 — 행복 경로만 그리지 않는다

## API CHANGELOG 규칙

```markdown
## [v1.4.0] - 2026-07-27
### Breaking
- `GET /users` 응답에서 `nickname` 제거 → `profile.nickname` (마이그레이션: …)
### Added
- `POST /invoices/bulk`
### Deprecated
- `GET /v1/legacy-search` — 2026-10-01 sunset
```

- breaking 변경은 반드시 마이그레이션 경로를 함께 기술
- oasdiff가 설치돼 있으면 `oasdiff changelog <base> <rev>`로 초안 생성 후 다듬기

## 실행 절차

1. 라우트/핸들러/스키마 파일 탐색 (`**/routes/**`, `**/api/**`, `**/controllers/**`, 프레임워크별 패턴)
2. 기존 명세가 있으면 실제 코드와 대조 → 불일치 목록 먼저 보고 후 갱신
3. 신규면 OpenAPI 3.1 골격 생성 → 리소스별 채움
4. `docs/api/README.md`에 구성도 + 플로우 다이어그램
5. `docs/docs.yaml`이 있으면 `docs/api/*` 항목 갱신 (covers: 라우트 경로 글롭)
6. 명세 검증: `npx @redocly/cli lint docs/api/openapi.yaml`(프로젝트가 spectral을 쓰면 `npx @stoplight/spectral-cli lint`)을 돌리고 출력으로 보고한다. 돌릴 수 없으면 "검증 안 함"이라고 보고하고, 반복 검증이 필요하면 docs-ci를 제안한다

## 제약

- `docs/` 폴더만 수정. 소스 코드 수정 금지
- 코드에 없는 엔드포인트를 명세에 넣지 않는다
