---
name: build-fix
description: 빌드·타입체크·컴파일이 실패해 에러를 고칠 때. Triggers - 빌드 에러, build error, 컴파일 에러, tsc 에러, 타입 에러, 빌드 실패, build fix. 런타임 에러·테스트 실패는 systematic-debugging.
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Edit, Bash, Grep
---

# 빌드 에러 수정

빌드·타입 에러를 원인 하나씩 고친다.

## 진행 순서

1. **빌드 실행**: AGENTS.md `## 명령`의 빌드·타입체크 명령을 쓴다. 없으면 매니페스트(`package.json` scripts와 lockfile로 고른 패키지 매니저, `pyproject.toml`, `Makefile` 등)에서 찾고, 무엇을 돌렸는지 적는다.

2. **에러 분석**
   - 파일별로 묶고, 같은 원인에서 나온 에러는 하나로 본다
   - 다른 에러를 일으키는 첫 에러(타입 정의·import·설정)부터

3. **원인별 수정**
   - 에러 위치의 앞뒤 코드를 읽고 원인을 한 줄로 설명
   - 수정 → 빌드 재실행 → 그 에러가 사라졌는지 출력으로 확인
   - 한 번 고쳐서 안 풀리면 추측 수정을 반복하지 말고 `systematic-debugging`으로 전환

4. **중단 조건** (멈추고 사용자에게 보고)
   - 수정이 새 에러를 만들었고 되돌려도 원인을 모를 때
   - 같은 에러가 세 번 시도 뒤에도 남을 때
   - 사용자 요청 시

5. **요약**: 고친 에러 수, 남은 에러 수, 새로 생긴 에러, 마지막 빌드 명령과 그 출력.

## 원칙

- 한 번에 한 원인만 고친다.
- 고친 뒤에는 반드시 빌드를 다시 돌린다. 끝낼 때는 AGENTS.md `## 명령`의 전체 검사까지 돌리고 그 출력으로 보고한다(`verification-before-completion`).
- 에러를 없애려고 `any`·`@ts-ignore`·`@ts-expect-error`·lint 끄기·검사 설정 완화를 쓰지 않는다. 불가피했다면 보고에 하나씩 이름을 대서 적는다.
- 새 에러가 생기면 그 수정을 되돌리는 것부터 생각한다.
