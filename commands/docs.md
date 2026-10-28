---
description: "문서 생성/동기화 라우터 — 코드 문서, 아키텍처 구성도, API 명세, 매뉴얼, 운영 문서, docs CI, 드리프트 sync"
argument-hint: "[code|arch|api|manual|ops|ci|sync|all]"
---

프로젝트 문서를 생성/동기화합니다. 코드 레벨 문서부터 아키텍처 구성도, API 명세, 매뉴얼, 운영 문서, docs CI까지.

입력: $ARGUMENTS

## 라우팅

| 호출 | 대상 | 실행 방법 |
|------|------|----------|
| `/docs` | 코드 문서 (최근 변경분)* | docs-writer 에이전트 |
| `/docs code` | 코드 문서 (전체)* | docs-writer 에이전트 |
| `/docs arch` | 아키텍처 구성도 + ARCHITECTURE.md + ADR + ERD | **docs-architecture 스킬** |
| `/docs api` | API 구성도 + OpenAPI/AsyncAPI 명세 + API CHANGELOG | **docs-interfaces 스킬** |
| `/docs manual` | 사용자 매뉴얼 (Diátaxis 4분면) | **docs-manuals 스킬** |
| `/docs ops` | 운영자 매뉴얼 + 런북 + 배포 가이드 + 인시던트 플레이북 | **docs-manuals 스킬** (운영 모드) |
| `/docs ci` | docs 검증 파이프라인 설치 (링크/OpenAPI/mermaid/신선도) | **docs-ci 스킬** |
| `/docs sync` | 문서 드리프트 감지 → stale 문서 갱신 | 아래 sync 절차 |
| `/docs all` | 전체 문서 세트 일괄 생성 | 아래 all 절차 |

\* `/docs`(무인자)와 `/docs code`는 같은 docs-writer 실행 — 무인자는 최근 변경분만 증분 갱신, `code`는 코드 레벨 문서 전체(components.md, utils.md, models.md 등)를 생성/갱신. API 레퍼런스는 `/docs api`.

## `/docs sync` 절차 (문서-코드 동기화)

1. `docs/docs.yaml` 존재 확인 — 없으면 docs-ci 스킬로 매니페스트부터 생성
2. `bash scripts/check-docs-freshness.sh` 실행 (없으면 docs.yaml의 covers vs git log 직접 대조)
3. stale 문서 목록을 영역별로 분류해 보고
4. 각 stale 영역을 해당 스킬/에이전트로 갱신:
   - `docs/ARCHITECTURE.md` → docs-architecture
   - `docs/api/*` → docs-interfaces
   - `docs/manuals/*`, `docs/ops/*` → docs-manuals
   - `docs/*.md` 코드 문서 → docs-writer
5. 갱신된 문서의 `last_reviewed`를 오늘로 갱신
6. 2번 검사를 다시 돌려 그 출력으로 보고

## `/docs all` 절차

프로젝트 전체를 분석해 문서 세트를 일괄 생성. 독립 영역은 병렬 실행:

```
Agent A (docs-writer): 코드 레벨 문서
Agent B (docs-architecture 스킬): ARCHITECTURE.md + 구성도 + ERD
Agent C (docs-interfaces 스킬): API 명세 + 구성도
Agent D (docs-manuals 스킬): 매뉴얼 + 운영 문서
```

완료 후 `docs/README.md` 인덱스를 갱신한다. docs-ci(매니페스트·CI 워크플로) 설치는 사용자에게 묻는다.

## 구현 에이전트와 병렬 실행

구현 중 docs-writer를 background 서브에이전트로 함께 돌릴 수 있다. 결과는 커밋 전에 확인해 같은 커밋에 넣는다(구현이 plan·docs와 달라지면 같은 커밋에서 문서를 고친다).

```
Agent(subagent_type: "docs-writer", run_in_background: true, prompt: "...")
```

## 중요 규칙

- `docs/` 폴더만 수정 (소스 코드 수정 금지)
- 기존 문서가 있으면 덮어쓰기가 아닌 업데이트 (Edit 우선)
- 설명은 한국어, 코드/변수명은 원문 유지
- 코드 읽으면 아는 것은 생략 — "왜"와 "언제"를 문서화
- 빈 유형은 문서 파일 생성하지 않음
- 문서를 만들거나 갱신하면 `docs/docs.yaml`이 있을 때 해당 항목도 갱신
- 코드에서 확인한 것만 쓰고, 확인하지 못한 것은 TODO로 남겨 보고한다
