---
name: techdebt
description: 기술 부채(디버그 출력, 안 쓰는 import·코드, TODO, any)를 찾아 정리할 때. Triggers - 기술 부채, techdebt, console.log 정리, 데드코드 정리, 안 쓰는 import, 기술부채 스캔. 새 기능·리팩터링에는 쓰지 않는다.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash
user-invocable: true
---

# 기술 부채 정리

코드베이스의 기술 부채를 찾아 보고하고, 승인받은 범위만 고친다.

## 검사 항목

### 1. 중복 코드
- 같거나 거의 같은 함수·로직이 여러 파일에 있는지
- 이미 있는 헬퍼로 바꿀 수 있는 코드(새 추상화를 만들자는 제안은 하지 않는다)

### 2. 사용하지 않는 코드
- 사용하지 않는 import·변수·함수·export
- 주석 처리된 코드 블록

### 3. 디버그 코드
- `console.log`·`console.debug`·`print` 디버그 출력, `debugger`·`breakpoint()`
- 임시 주석 (TODO, FIXME, HACK, XXX)

### 4. 코드 품질
- `any` 타입 (TypeScript)
- 하드코딩된 값 (매직 넘버/스트링)
- 너무 긴 함수 (50줄 초과), 깊은 중첩 (4단계 초과)

## 검사 방법

먼저 프로젝트에 이미 있는 도구를 쓴다: AGENTS.md `## 명령`의 lint, 설치돼 있으면 `knip`(JS/TS 안 쓰는 파일·export·의존성), `ruff`(Python). 이 정리를 위해 새 도구를 설치하지 않는다. 그 밖에는 추적 중인 파일만 grep한다(빌드 결과물·vendor 제외):

```bash
git grep -nE "console\.(log|debug)|debugger" -- '*.ts' '*.tsx' '*.js' '*.jsx'
git grep -nE "TODO|FIXME|HACK|XXX"
git grep -nE ":[[:space:]]*any([^[:alnum:]_]|$)|as any([^[:alnum:]_]|$)" -- '*.ts' '*.tsx'
```

제외: 테스트 픽스처, 생성된 코드, CLI·스크립트처럼 콘솔 출력이 기능인 곳, `console.error`·`console.warn`처럼 의도된 오류 로깅.

## 출력 형식

```
## 기술 부채 리포트

### 중복 코드 (3건)
- src/utils.ts:formatDate ↔ src/helpers.ts:formatDateTime

### 사용하지 않는 import (12건)
- src/components/Button.tsx:1 - React (unused)

### 디버그 코드 (5건)
- src/api/auth.ts:23 - console.log

### 코드 품질 이슈 (8건)
- src/services/user.ts:45 - any 타입 사용

총 28건. 아래 자동 수정 범위를 적용할까요?
```

## 자동 수정 범위 (승인 뒤)

- 사용하지 않는 import 제거
- 디버그용 `console.log`·`console.debug`·`debugger` 제거
- 중복 코드·주석 처리된 코드·TODO·`any`는 리포트만 (사람이 판단)

수정 뒤 AGENTS.md `## 명령`의 전체 검사를 돌리고 그 출력으로 결과를 보고한다(`verification-before-completion`).
