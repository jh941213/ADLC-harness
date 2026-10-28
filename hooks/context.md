# 작업 흐름 (크기에 맞춰)

- 바로 끝나는 일은 바로 한다. 작은 변경은 채팅에서 짧은 설계를 승인받고 한다. 큰 작업은 `docs/work/YYYY-MM-DD-<주제>/`에 `intent.md` → `spec.md`(화면이면 `design.md`도) → `plan.md`를 하나씩 승인받으며 만든다(`brainstorming`, `writing-plans`). PR까지 루프로 돌리면 `loopeng`, 흐름·서브에이전트·메모리 쓰는 법은 `harness-guide`, 새 뼈대는 `scaffold`.
- 여러 에이전트에 나눌 때는 `memorybox`, 병합 전 리뷰는 `review`.
- 버그는 `systematic-debugging`: 재현 테스트가 먼저 실패하는 것을 보고 고치며, 고치는 동안 그 테스트는 수정하지 않는다.
- 완료는 이번에 실행한 검사 출력으로만 말한다(`verification-before-completion`, 기준은 AGENTS.md `## 명령`의 전체 검사). 약하게 한 테스트·늘린 타임아웃·갱신한 스냅샷·억제한 경고는 하나씩 이름을 댄다. 큰 작업은 새 컨텍스트의 `evaluator`가 검토한다.
- 구현이 문서와 달라지면 같은 커밋에서 문서를 고친다. 요구가 바뀌면 가장 앞 문서부터 고치고 다시 승인받는다.

# 메모리 (세 호스트가 아래 "메모리 폴더"를 같이 쓴다)

- `MEMORY.md`는 한 줄 색인이고, 메모는 사실 하나에 파일 하나다(`metadata.type`, `metadata.hits`).
- 단기 `handoff.md`(지금·다음·막힘 5줄): `/clear`·세션 종료 전에 고치고, 작업이 끝나면 지운다.
- 중기 메모: 코드로 알 수 없고 오래 유효하며 잊으면 손해인 교정·의외만 쓴다. 쓰기 전에 색인에서 같은 것을 찾아 고치고 `hits`를 올린다.
- 장기: `hits` 2 이상이거나 사용자가 "항상/절대"라고 하면 `AGENTS.md`(팀)나 `~/.claude/CLAUDE.md`(개인)로 올리고 메모는 지운다. 형식·정리는 `memory` 스킬.
