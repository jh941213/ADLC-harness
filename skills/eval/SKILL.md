---
name: eval
description: 구현 결과를 만든 컨텍스트와 분리해 점수로 평가받을 때(spec·plan 대비 PASS/FAIL). Triggers - eval, 평가, 품질 점수, 코드 평가, quality score. 병합 전 diff 리뷰는 review.
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Bash, Grep, Glob, Agent
---

# 코드 Eval (독립 평가)

구현한 컨텍스트와 분리된 `evaluator` 에이전트가 산출물을 평가한다. 구현한 세션이 스스로 채점하지 않는다.

## 1. 평가 의뢰

브리프에 넣을 것: 평가 범위(기본 브랜치 대비 `git diff <base>...HEAD`, 또는 사용자가 지정한 파일·커밋), spec·plan 경로(`docs/work/*/`에 있으면), 전체 검사 명령(AGENTS.md `## 명령`). 구현 중의 추론·변명은 넘기지 않는다.

```
Agent(subagent_type="evaluator",
  prompt="범위: <base>...HEAD. spec: <경로>, plan: <경로>. 전체 검사: <명령>.
         네 축(기능 정확성 40 / 코드 품질 25 / 간결성 20 / 보안·사용성 15)으로 100점 채점하고
         보고서를 마지막 메시지로 돌려줘.")
```

서브에이전트가 없는 호스트에서는 새 세션(`claude -p`, `codex exec`)에 이 플러그인의 `agents/evaluator.md` 본문과 같은 브리프를 넘긴다.

## 2. 결과 보고

보고서를 읽고 사용자에게 요약한다(파일 저장은 사용자가 원할 때만):

```
Eval 결과: PASS | CONDITIONAL | FAIL — N/100
기능 정확성 N/40 · 코드 품질 N/25 · 간결성 N/20 · 보안·사용성 N/15
실행한 검사: <명령> → <결과 한 줄>
수정 필요: <file:line — 문제> ...
```

## 3. CONDITIONAL / FAIL

수정 항목을 구체적으로(file:line, 기대 vs 실제) 안내하고 고친 뒤 재평가할지 묻는다. 재평가는 새 evaluator에 같은 기준으로 맡기고 최대 3라운드. 3라운드 뒤에도 85점 미만이면 사용자가 판단한다.

## 일관성 측정 (선택)

같은 요청으로 구현을 k번(예: 3) 따로 만들어 각각 평가하면 결과 품질이 일정한지 볼 수 있다. 같은 코드가 나오는지가 아니라 같은 품질 수준인지를 본다. 모두 85점 이상이면 안정, 점수 차가 15점을 넘으면 spec·plan이 모호하다는 신호다.
