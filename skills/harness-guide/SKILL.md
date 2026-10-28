---
name: harness-guide
description: 작업 흐름을 잊었거나 하네스 특성을 다시 확인할 때 사용. SDLC 단계·문서 규칙, 서브에이전트 띄우는 법, 메모리 쓰는 법, 문서 스킬, 리뷰·검증, hook·호스트 차이를 한 곳에 둔다. Triggers - harness-guide, 하네스 가이드, 하네스 사용법, 흐름이 뭐였지, 다음에 뭐 해, 어떤 스킬 써, 서브에이전트 어떻게, 메모리 어떻게.
---

# 하네스 가이드

흐름이 헷갈리거나 특성을 잊었을 때 다시 읽는 곳이다. 필요한 절만 읽는다. 일을 처음부터 끝까지 돌리려면 `loopeng`.

## 1. 크기 판정 (먼저)

| 크기 | 기준 | 흐름 |
|---|---|---|
| 바로 끝나는 일 | 한두 파일, 정답이 하나 | 바로 하고 검증 출력으로 보고 |
| 작은 변경 | 범위가 분명하고 설계 판단이 한두 개 | 채팅에서 짧은 설계(수용 기준 한두 줄) 승인 → 구현(테스트 먼저) → 전체 검사 → `review` Quick → 커밋·PR(푸시는 묻고) → 배운 것은 `memory` |
| 큰 작업 | 여러 파일·여러 결정, 요구가 덜 정해짐 | 아래 SDLC 전 단계 |

판정이 애매하면 한 단계 큰 쪽으로 하고, 사용자에게 한 줄로 알린다.

## 2. SDLC 단계와 문서

작업 폴더: `docs/work/YYYY-MM-DD-<주제>/`. 단계마다 문서를 커밋하고, 다음 단계는 그 문서를 읽고 시작한다.

| # | 단계 | 스킬·에이전트 | 산출물 | 게이트 |
|---|---|---|---|---|
| 1 | 의도 | `brainstorming` | `intent.md`: 사용자 말 그대로의 문제·원하는 결과·영향 대상·제약·열린 질문 | 사람 승인 |
| 2 | 설계 | `brainstorming` | `spec.md`: 동작·구조, `## 수용 기준`(R1…, 숫자 목표), `## 우려 사항` | 사람 승인 |
|  | 디자인 | `design-md`(참고 사이트 캡처·디자인 시스템 반영), impeccable | 화면 작업이면 `design.md`: 디자인 방향·토큰·컴포넌트·화면 흐름과 상태. 프로젝트 `DESIGN.md`가 있으면 따른다 | 사람 승인 |
| 3 | 계획 | `writing-plans` | `plan.md`: Task마다 R#, 파일·테스트·검증 명령, 체크박스, `승인:`·`재개:` 줄 | 사람 승인 |
| 4 | 구현 | `test-driven-development`, `systematic-debugging`, `build-fix` | 코드·테스트, 체크된 plan | 자동 |
| 5 | 검증 | `verification-before-completion`, `evaluator` | 전체 검사 출력, R#별 판정 | 자동 |
| 6 | 리뷰 | `review`, `receiving-code-review`, `security-reviewer` | 지적·위험 등급 | 자동 |
| 7 | 출시 | `commit-push-pr` | PR(Testing·Risk·How to revert) | 사람 승인. 병합·배포는 사람 |
| 8 | 학습 | `memory` | 메모·`hits`, REVIEW.md에 놓친 사례, 다음 의도 후보 | — |

규칙:
- **승인**: 승인한 문서는 제목 아래에 `승인: YYYY-MM-DD`를 적고 커밋한다. 승인 날짜가 없는 plan은 실행하지 않는다.
- **재개**: plan의 첫 미체크 단계부터 한다. 그 전에 체크된 단계가 만든 파일·테스트가 실제로 있는지 확인한다. 인계의 `지금:`에 작업 폴더와 Task를 적어 둔다.
- **문서 동기화**: 구현이 plan과 달라지면 같은 커밋에서 plan을 고친다. 요구가 바뀌면 영향받는 가장 앞 문서부터 고치고, 뒤 문서는 다시 승인받는다.
- **새 프로젝트**: 설계를 승인받은 뒤 `scaffold`(질문으로 스택을 정하고 공식 생성기로 만든다). 반드시 지켜야 할 것(보호 경로, 배포 승인, 편집 뒤 포매터)은 규칙 문장 대신 설정으로 강제한다: `scaffold`의 `references/guardrails.md`.
- **끝난 작업 폴더**: 지우지 않는다. 많아지면 `docs/work/archive/YYYY/`로 옮긴다.
- **조사**: 결정에 근거가 필요하면 어느 단계에서든 `research`(원문 인용이 있는 출처 대장).
- **완료 보고**: 이번에 실행한 검사 출력으로만 말한다. 약하게 한 테스트·늘린 타임아웃·갱신한 스냅샷·억제한 경고는 하나씩 이름을 댄다.

## 3. 서브에이전트

**언제 띄우나**: 서로 독립인 일이 둘 이상일 때, 큰 탐색이나 조사로 메인 컨텍스트를 채우고 싶지 않을 때, 만든 사람과 분리된 판정이 필요할 때(검증·리뷰). 한두 번의 도구 호출로 끝날 일, 같은 맥락을 계속 나눠야 하는 일은 직접 한다.

**브리프가 전부다**: 서브에이전트는 auto memory도 SessionStart 규칙도 받지 못한다. 브리프에 다섯 가지를 넣는다.
1. 목표, 그리고 왜 하는지
2. 범위: 읽을 파일과 고쳐도 되는 파일, 건드리지 말 것
3. 이미 아는 것과 이미 배제한 것
4. 완료 기준: 돌릴 명령과 기대 출력
5. 돌려받을 형식과 길이

결론을 넘겨 주면 그것을 확인하고 돌아오기 쉽다. 판정을 맡길 때는 결론이 아니라 코드와 기준을 넘긴다.

| 호스트 | 띄우는 법 |
|---|---|
| Claude Code | Agent 도구(`subagent_type`). 코드를 고치는 병렬 작업은 `isolation: worktree`. 이 하네스의 에이전트: `evaluator`(R# 판정·채점), `security-reviewer`, `docs-writer` |
| Codex | `codex exec -s workspace-write "<브리프>"`. 저장소 밖에 써야 하면 `--add-dir <폴더>` |
| Copilot CLI | `/agent`로 사용자 정의 에이전트, 또는 `copilot -p "<브리프>"` |
| Orca | `orchestration`의 워커. 소유권은 Orca Dispatch가 맡는다(`memorybox` 스킬 `references/orca.md`) |

**여러 워커가 주고받으면 `memorybox`**: 리드가 run과 항목을 올리고, 워커가 가져가 결과와 배운 점을 남긴다. 가져가기·라운드 상한·선행 조건은 스크립트가 강제한다. 코더와 리뷰어는 다른 모델로 짝짓는다. 여러 부분을 잇는 일이면 먼저 끝에서 끝까지 도는 가장 얇은 경로를 만들고 나서 나눈다.

## 4. 메모리

| 층 | 어디 | 쓰는 때 |
|---|---|---|
| 단기 | `handoff.md`: 지금·다음·막힘 5줄 | `/clear`·세션 종료 전, 큰 단계를 끝낼 때. 작업이 끝나면 지운다 |
| 중기 | 메모 파일(사실 하나에 파일 하나, `type`·`hits`) + `MEMORY.md` 한 줄 색인 | 코드만 봐서는 알 수 없고, 오래 유효하고, 잊으면 손해인 교정·의외 |
| 장기·팀 | 프로젝트 `AGENTS.md`의 `## 명령`·`## 자주 틀리는 것`·`## 지식 지도` | `hits` 2 이상이거나 사용자가 "항상/절대"라고 할 때 승격 |
| 장기·개인 | `~/.claude/CLAUDE.md`(Codex는 `~/.codex/AGENTS.md`) | 모든 프로젝트에 해당하는 개인 규칙 |
| 원본 | `docs/`, `docs/work/*/` | 메모리는 위치만 가리키고 내용을 옮기지 않는다 |

- **위치**: 세션 시작 문맥의 "메모리 폴더". 기본은 `~/.claude/projects/<저장소>/memory/`이고, 세 호스트가 같은 폴더를 본다.
- **쓰기 전**: 색인에서 같은 것을 찾는다. 있으면 그 메모를 고치고 `hits`를 올린다. 틀린 메모는 지운다.
- **정리·승격·인계 형식**은 `memory` 스킬에 있다. 세션 시작에 "메모리 점검"이 뜨면 그 스킬로 정리한다.
- **여러 호스트**: Codex 샌드박스는 저장소 밖에 쓰지 못한다. 함께 쓰는 프로젝트는 `.claude/settings.local.json`의 `autoMemoryDirectory`를 저장소 안 `.agents/memory`의 절대 경로로 둔다(gitignore). 새 worktree에도 같은 줄을 둔다.
- **넣지 않는 것**: 코드·git 기록·문서에 이미 있는 것, 이번 대화에서만 쓰는 것.

## 5. 문서

| 무엇 | 스킬·에이전트 |
|---|---|
| 작업 문서(intent·spec·design·plan) | 위 SDLC 단계 |
| 시스템 구조: ARCHITECTURE.md 코드맵, C4, ADR, ERD | `docs-architecture` |
| API·이벤트 명세: OpenAPI, AsyncAPI, API CHANGELOG | `docs-interfaces` |
| 사용자 매뉴얼, 런북·배포·운영 문서 | `docs-manuals` |
| 문서 CI·드리프트 감지 | `docs-ci` |
| 코드 레벨 문서(컴포넌트·훅·모델·CHANGELOG) | `docs-writer` 에이전트, `/docs` |
| 고객 제출 산출물 | `client-docs` |

문서가 원본이다. 구현을 바꾼 커밋에서 문서도 고친다.

## 6. 리뷰·검증

- **매 작업**: `verification-before-completion`. 통과 기준은 AGENTS.md `## 명령`의 전체 검사다.
- **큰 작업 구현 뒤**: 새 컨텍스트의 `evaluator`가 R#마다 충족·미충족·미검증으로 판정하고, 화면·서버 변경이면 앱을 띄워 바뀐 흐름을 직접 실행한다. 미검증은 통과가 아니다.
- **병합 전**: `review`. 깊이는 위험에 맞춘다(Quick 2·Standard 7·Deep 9 서브에이전트). 위험 등급에 따라 사람 승인이 Low 0명, Medium 1명, High 2명 필요하다. 받은 지적은 `receiving-code-review`로 근거를 확인하고 반영한다.
- **보안 변경**: Claude Code는 `/security-review`, 다른 호스트는 `security-reviewer`.
- **막혔을 때**: 버그·테스트 실패는 `systematic-debugging`(재현 테스트 먼저, 고치는 동안 그 테스트는 수정하지 않는다), 빌드·타입 에러는 `build-fix`, 정리는 `techdebt`.

## 7. 하네스 특성

- **세션 시작 hook**: Ponytail과 작업 규칙(4,000자 이하)을 넣고, 이어서 메모리 폴더·인계·점검 알림·메모리박스 요약을 붙인다. Codex·Copilot에는 `MEMORY.md` 색인도 넣는다. 압축·`/clear`·재개 뒤에도 다시 들어간다.
- **화면 파일 hook**: `.tsx`·`.jsx`·`.vue`·`.svelte`·`.css`·`.html`을 처음 고칠 때, impeccable을 쓸지 정하지 않은 프로젝트면 세션에 한 번 물어보라고 알린다(Claude Code만).
- **Ponytail**: 필요 없는 코드는 만들지 않는다. 먼저 "만들 필요가 있나"를 묻고, 있는 것을 고치고, 한 줄로 되면 한 줄로 쓴다.
- **호스트 차이**: 스킬은 세 호스트가 같이 쓴다. Claude Code는 `/이름`, Codex는 `$이름`으로 부른다. `if`로 좁힌 hook과 Agent 도구는 Claude Code 기능이다.
- **Codex 샌드박스**: workspace-write는 `.git` 쓰기를 막아 승인 커밋이 실패한다. `codex --add-dir "$(git rev-parse --git-common-dir)"`로 열거나, 커밋할 때 권한 상승을 승인한다. 저장소 밖 메모리 폴더도 `--add-dir`로 연다. Codex는 압축 뒤에 세션 시작 hook을 다시 부르지 않는 것으로 보이니, 규칙이 흐려지면 resume하거나 새 세션을 연다.
- **예산**: 매 세션 고정 문맥 4,000자, 스킬 설명 합계 7,000자. 하네스를 고칠 때는 하네스 저장소의 AGENTS.md를 따른다.
