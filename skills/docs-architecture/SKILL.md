---
name: docs-architecture
description: "아키텍처 문서(ARCHITECTURE.md 코드맵, C4 구성도, ADR, ERD)를 만들거나, 구조를 바꾼 뒤 문서를 맞출 때 사용. API 명세는 docs-interfaces, 매뉴얼은 docs-manuals."
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# 아키텍처 문서 스킬

프로젝트의 구조적 사실을 문서화한다. 산출물은 `docs/` 아래, 다이어그램은 mermaid(레포에서 네이티브 렌더).

## 입력

$ARGUMENTS

## 산출물 선택 (결정 트리)

| 상황 | 산출물 |
|------|--------|
| 소규모 프로젝트(<10k LOC) | README 아키텍처 섹션 + 컨텍스트 다이어그램 1개면 충분 — 과잉 문서화 금지 |
| 기여자가 길을 잃는 규모 | `docs/ARCHITECTURE.md` (코드맵) |
| 시스템 경계/외부 연동 설명 필요 | C4 Context + Container 다이어그램 |
| 중요한 설계 결정 발생 | `docs/design-docs/ADR-NNN-[제목].md` (MADR) |
| 영속 데이터 구조 변경 | `docs/ARCHITECTURE.md` 내 ERD 섹션 또는 `docs/data-model.md` |
| 대규모/규제 시스템 | arc42 12섹션 문서 (명시 요청 시에만) |

## ARCHITECTURE.md 작성 규칙 (코드맵)

1. **지도이지 지도책이 아니다** — 굵직한 모듈과 관계만. 파일별 나열 금지
2. 먼저 "이 시스템이 푸는 문제"를 조감, 그다음 코드맵
3. 중요 심볼은 이름만 언급, 하이퍼링크 금지 (링크는 썩는다 — 독자는 심볼 검색을 쓴다)
4. **아키텍처 불변식**을 명시 (예: "domain 레이어는 infra를 import하지 않는다")
5. 코드를 읽으면 아는 것은 쓰지 않는다 — 구조만으로 알 수 없는 결정/이유를 쓴다

구조:
```markdown
# Architecture

## 개요        ← 시스템이 푸는 문제, 1-2문단
## 구성도      ← C4 Context/Container mermaid
## 코드맵      ← 모듈별 역할 + 경계 (디렉토리 ≈ 문단 1개)
## 불변식      ← 지켜야 할 구조 규칙
## 크로스커팅  ← 로깅, 에러 처리, 인증 등 공통 관심사
```

## 다이어그램

mermaid 문법과 관례는 `references/mermaid-conventions.md` 참조 (C4Context/C4Container, sequenceDiagram, erDiagram, architecture-beta).

핵심 관례:
- 다이어그램 1개 = 관심사 1개, 노드 15-20개 이하
- C4는 Context → Container 2레벨까지가 기본. Component 레벨은 flowchart + subgraph가 더 잘 그려짐
- 인프라/배포 토폴로지는 `architecture-beta` 우선

## ADR (MADR 형식)

- 위치: `docs/design-docs/ADR-NNN-[kebab-제목].md` — 번호는 3자리 제로패딩 (예: `ADR-001-use-postgres.md`), `docs/design-docs/index.md`에 인덱스 갱신
- 템플릿: `templates/adr.md` (기본은 minimal — Context/Decision/Consequences. 논쟁적 결정만 full MADR)
- **ADR은 불변** — 뒤집을 땐 새 ADR로 supersede, 기존 문서 수정 금지
- status: proposed → accepted → superseded by ADR-NNN

## 실행 절차

1. 대상 파악: 인자 없으면 기본 브랜치 대비 변경(`git diff --name-only <base>...HEAD`) + 프로젝트 구조 스캔으로 변경된 구조 요소 탐지
2. 기존 `docs/ARCHITECTURE.md`가 있으면 Edit로 갱신 (전면 재작성 금지 — 변경된 섹션만)
3. 다이어그램의 노드가 실제 코드 구조와 일치하는지 확인 후 생성
4. `docs/docs.yaml` 매니페스트가 있으면 해당 항목 갱신 (매니페스트를 새로 두는 것은 docs-ci):
   ```yaml
   docs:
     - path: docs/ARCHITECTURE.md
       covers: ["src/**", "!src/**/*.test.*"]
       last_reviewed: 2026-07-27
   ```
5. 설명은 한국어, 코드/식별자는 원문

## 제약

- `docs/`(소규모 프로젝트면 README의 아키텍처 절)만 수정. 소스 코드 수정 금지
- 추측으로 다이어그램을 그리지 않는다 — 코드에서 확인한 관계만
