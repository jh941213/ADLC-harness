# 프로토콜

에이전트끼리 주고받는 흐름은 같은 모양을 따른다.

1. 내용을 만든 쪽이 **내용 전체**를 항목(Ask·Result)이나 PR 코멘트에 둔다.
2. 다음 차례를 같은 `--thread`의 새 항목으로 `post`한다. 라운드는 스크립트가 같은 역할의 순번으로 센다. 상태 envelope도 스크립트가 log에 남긴다.
3. 받는 쪽은 항목과 PR을 직접 읽고 한다. 리드를 거쳐 요약해 전하지 않는다.
4. 흐름이 멈추면(같은 라운드에서 진전 없음) 리드가 개입한다. 5라운드는 스크립트가 막는다.

| 프로토콜 | 주고받는 쪽 | 흐름 | 내용이 있는 곳 |
|---|---|---|---|
| 계획 검토 | planner ↔ plan-reviewer(다른 모델) | 계획 → 지적 → 수정 계획 | 항목, RUN.md `## Plan` |
| 코드 리뷰 | coder ↔ reviewer(다른 모델) | PR → 지적(`review` 스킬 방식) → 고침 → 재검토(같은 리뷰어) | PR 코멘트, 항목 Result |
| 질문 | 누구든 → planner·리드 | 질문 → 답 | 항목(`--kind question`) |
| 테스트 실패·충돌 | 합치는 쪽 → coder | 실패 출력·충돌 파일 → 고침 → 다시 합치기 | 항목 Ask, PR 코멘트 |
| 계획 수정 | coder → planner | 계획대로 안 되는 이유 → 고친 계획 | 항목, RUN.md |

## 코드 리뷰 예

```
리드:     post --run R --role coder --agent claude --title "토큰 발급 API" → A  (coder 1라운드)
coder:    claim A → 구현·PR #42 → done A (Result: PR #42, 검증 출력)
리드:     post --run R --role reviewer --agent codex --thread A --depends A --title "PR #42 리뷰" → B  (reviewer 1라운드)
reviewer: claim B → review 스킬로 PR 코멘트 → done B (Result: Important 2건, 위험 Medium) --outcome failed
리드:     (B를 읽고) post --run R --role coder --agent claude --thread A --title "PR #42 지적 반영" → C  (coder 2라운드)
coder:    claim C → 고침·push → done C
리드:     post ... --role reviewer --agent codex --thread A --depends C --title "PR #42 재검토" → D  (reviewer 2라운드)
```

`--outcome failed`는 "리뷰 통과 못 함"도 뜻한다. `--depends`는 성공한 선행만 통과시키므로 실패한 항목에 걸면 영원히 막힌다. 그래서 실패한 리뷰 다음의 수정 항목(C)은 리드가 B를 읽은 뒤 `--depends` 없이 올리고, 재검토(D)는 수정 항목(C)에 의존하게 둔다. 리뷰 기준·라운드 수렴은 `review` 스킬을 따른다(3라운드가 넘으면 접근을 다시 생각).

## 루프를 막는 습관

- 다음 행동이 필요할 때만 항목을 올리거나 말을 건다.
- 넘긴 뒤에는 조용히 기다린다. "확인 중", "대기 중" 같은 상태 알림을 보내지 않는다.
- 같은 지적을 다시 올리지 않는다. 같은 종류가 반복되면 종류로 묶는다.
