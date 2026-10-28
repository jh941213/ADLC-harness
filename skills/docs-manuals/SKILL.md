---
name: docs-manuals
description: "사용자 매뉴얼(유저 가이드·튜토리얼·how-to)이나 운영 문서(런북·배포 가이드·설정 레퍼런스·온콜·인시던트 대응)를 만들거나 고칠 때 사용. API 명세는 docs-interfaces, 아키텍처는 docs-architecture."
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# 사용자/운영자 매뉴얼 스킬

읽는 사람(최종 사용자 vs 운영자)과 읽는 상황(학습 중 vs 장애 대응 중)에 맞는 문서를 만든다.

## 입력

$ARGUMENTS

## 사용자 매뉴얼 — Diátaxis 4분면

**핵심 규칙: 한 페이지에 두 모드를 섞지 않는다.** 페이지를 쓰기 전에 먼저 분류하라:

| 분면 | 목적 | 형태 | 위치 |
|------|------|------|------|
| Tutorial | 학습 (처음 온 사람) | 따라하면 성공하는 수업. 선택지 없이 한 길 | `docs/manuals/tutorials/` |
| How-to | 과제 해결 ("X 하려면?") | 목표 지향 단계. 전제조건 명시 | `docs/manuals/how-to/` |
| Reference | 정보 조회 | 사전식. 제품 구조를 그대로 반영 | `docs/manuals/reference/` |
| Explanation | 이해 ("왜 이렇게?") | 배경, 설계 이유, 트레이드오프 | `docs/manuals/explanation/` |

트리거 매핑: 새 기능 → how-to + reference / 새 개념 → explanation / 온보딩 갭 → tutorial

인덱스는 `docs/manuals/README.md` — 4분면으로 내비게이션 구성.

## 운영자 매뉴얼

위치: `docs/ops/`

### 1. 운영 개요 (`docs/ops/README.md`)
- 시스템 토폴로지 (docs-architecture의 배포 다이어그램 링크/포함)
- 용량/스케일링 노트, 정상 상태 지표 기준선

### 2. 설정 레퍼런스 (`docs/ops/configuration.md`)
모든 환경변수/플래그를 표로 — 코드에서 추출 (`.env.example`, config 파일, `process.env`/`os.environ` grep):

| 이름 | 타입 | 기본값 | 효과 | 유효값 |
|------|------|--------|------|--------|

### 3. 런북 (`docs/ops/runbooks/[알림명].md`)
**새벽 3시에 처음 보는 사람이 따라할 수 있어야 한다.** 템플릿: `templates/runbook.md`
- 알림당 1개 파일: 알림명/심각도/사용자 영향 → **진단**(대시보드 링크 + 복붙 가능한 쿼리) → **완화**(순서 있는 복붙 가능 명령 + 각 단계의 트레이드오프 경고) → **근본 해결/후속** → 에스컬레이션 경로
- 새 알림 룰이 생기면 런북도 같은 PR로. 인시던트에서 사용된 런북은 사후 반드시 갱신

### 4. 배포 가이드 (`docs/ops/deployment.md`)
환경 목록, 파이프라인 설명, 롤아웃 절차, 배포 후 검증(스모크 체크 명령), **롤백 절차**(가장 중요 — 복붙 가능하게)

### 5. 인시던트 플레이북 (`docs/ops/incident-playbook.md`)
심각도 매트릭스, 역할(지휘자/커뮤니케이션 담당), 커뮤니케이션 템플릿, 에스컬레이션 정책, 블레임리스 포스트모템 템플릿

## 실행 절차

1. 대상 판별: 인자에서 사용자 문서인지 운영 문서인지, 특정 문서인지 전체인지
2. 소스 수집: 코드(설정/알림 룰/배포 스크립트), 기존 docs/, CI 설정, docker/k8s 매니페스트
3. **코드에서 확인한 사실만 기술** — 알 수 없는 운영 값(대시보드 URL, 온콜 로테이션)은 `<!-- TODO: 운영팀 확인 -->` 마커로 남기고 목록으로 보고
4. 기존 문서는 Edit로 갱신, 신규만 Write
5. `docs/docs.yaml`이 있으면 해당 항목 갱신
6. 설명은 한국어(또는 프로젝트 언어), 명령/식별자는 원문

## 제약

- `docs/` 폴더만 수정
- 런북의 명령은 실제 실행 가능해야 함 — 존재하지 않는 스크립트/명령 금지
- 페이지당 Diátaxis 분면 1개 — 혼합 감지 시 분리 제안
