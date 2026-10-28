# ADLC Harness

<p align="center"><img src="assets/adlc-loop.jpg" alt="세 터미널(Claude Code·Codex·Copilot CLI)이 의도·설계·계획·구현·검증·리뷰·출시·학습 여덟 단계의 무한 루프로 이어지는 그림" width="100%"></p>

**AI SDLC 루프**(의도 → 설계 → 계획 → 구현 → 검증 → 리뷰 → 출시 → 학습)를 Claude Code·Codex·GitHub Copilot CLI에서 같은 방식으로 돌리는 개발 하네스 플러그인이다. 상시 컨텍스트와 hook은 최소로 두고, 나머지는 필요할 때만 읽히는 스킬로 둔다.

- **루프**: `/loopeng <요청>` 하나로 의도부터 PR·학습까지 간다. 사람은 의도·설계·계획·출시 게이트에서만 승인하고, 단계마다 문서와 승인 기록이 커밋으로 남는다.
- **일하는 방식**: 필요 없는 코드는 만들지 않는다(Ponytail). 작업 크기에 맞춰 흐름을 줄이고, 완료는 이번에 실행한 검증 출력으로만 말한다.
- **기억**: 단기·중기 기억은 Claude Code auto memory 폴더 한 곳에 두고, 반복해서 나온 것만 AGENTS.md로 올린다. 세 호스트가 같은 폴더를 본다.
- **여러 에이전트**: 리드와 워커는 파일로 된 메모리박스로 일을 주고받는다(서브에이전트·Codex·Orca 워커). 작업 중 알게 된 것과 배운 점이 메모리로 올라간다.
- **리뷰**: 렌즈별 병렬 탐색 → 검증 에이전트 투표 → 심각도·위험 등급.

hook 2개, 스킬 29개, 에이전트 3개, 런타임 의존성 0.

쓰다가 흐름이나 특성이 헷갈리면 `harness-guide` 스킬을 본다. SDLC 단계와 문서, 서브에이전트 띄우는 법, 메모리 쓰는 법, 문서·리뷰 스킬을 한 곳에 모았다. `scaffold`와 `memory` 스킬이 만드는 프로젝트 AGENTS.md에도 이 가이드를 가리키는 `## 하네스 가이드` 절이 들어간다.

## 설치

Node.js 22 이상이 필요하다.

| 호스트 | 명령 | 비고 |
|---|---|---|
| Claude Code | `claude plugin marketplace add jh941213/ADLC-harness` → `claude plugin install adlc-harness@adlc-harness` | 다음 세션부터 적용 |
| Codex | `codex plugin marketplace add jh941213/ADLC-harness` → `codex plugin add adlc-harness@adlc-harness` | `codex`의 `/hooks`에서 한 번 신뢰(trust)해야 hook이 돈다 |
| Copilot CLI | `copilot plugin marketplace add jh941213/ADLC-harness` → `copilot plugin install adlc-harness@adlc-harness` | `.claude-plugin/` manifest를 읽는다 |

로컬 사본으로 설치할 때는 `jh941213/ADLC-harness` 자리에 폴더 경로를 쓴다. 갱신은 각 호스트의 plugin update(또는 marketplace update) 명령으로 한다.

### 1.x(my-cc-harness)에서 옮기기

1.x는 플러그인이 아니라 `install.sh`가 `~/.claude` 아래로 파일을 복사하는 방식이었다. 새 플러그인과 겹치지 않게 먼저 정리한다.

1. `~/.claude`를 통째로 백업한다.
2. 1.x가 복사한 것을 지우거나 되돌린다: `~/.claude/rules/`, `hooks/`(스크립트 20개), `team-roles/`, `templates/`, `scripts/`, `semgrep-rules/`, 그리고 `agents/`·`skills/`·`commands/` 안의 1.x와 같은 이름 파일. 직접 고친 파일은 남긴다.
3. `~/.claude/settings.json`의 `hooks`에서 1.x 스크립트(`~/.claude/hooks/*.sh`)를 부르는 항목을 지운다. `~/.claude/CLAUDE.md`를 1.x가 덮어썼다면 개인 규칙만 남긴다.
4. 1.x를 플러그인(`my-cc-harness@my-cc-harness`)으로 설치했다면 `claude plugin uninstall my-cc-harness@my-cc-harness`와 `claude plugin marketplace remove my-cc-harness`.
5. 위 설치 표대로 새로 설치한다.

### 함께 쓰면 좋은 것 (PC에 한 번)

**RTK**: git·테스트·빌드 출력을 명령별로 줄여 준다.

1. `brew install rtk`(Windows는 `winget install rtk-ai.rtk`)
2. `rtk init -g`(Codex는 `--codex`, Copilot은 `--copilot`). telemetry에는 동의하지 않는다.
3. `rtk config` 첫 줄에 나오는 설정 파일에 [`rtk/rtk-config.toml`](rtk/rtk-config.toml)의 `[hooks]`를 넣는다. RTK는 재작성한 명령을 권한 확인 없이 허용한다. 그래서 `git push`·`gh` 같은 쓰기·외부 명령은 재작성 대상에서 뺀다.
4. 확인: `rtk rewrite "git push --force"`는 빈 결과, `rtk rewrite "git status"`는 `rtk git status`가 나와야 한다.

**Impeccable**: 화면 진단과 마감. 기본은 꺼 두고 프론트 프로젝트에서만 켠다.

1. `claude plugin marketplace add https://github.com/pbakaus/impeccable.git` → `claude plugin install impeccable@impeccable`
2. `~/.claude/settings.json`의 `env`에 `"IMPECCABLE_HOOK_DISABLED": "1"`, `"IMPECCABLE_HOOK_QUIET": "1"`을 넣는다.
3. 화면 파일을 처음 고치려 할 때 이 하네스가 "켤까요?"를 한 번 묻는다. 켜면 그 프로젝트 `.claude/settings.local.json`의 `env`에 `"IMPECCABLE_HOOK_DISABLED": "0"`이 들어간다. 프로젝트 `env`가 사용자 `env`보다 우선하고, hook은 다음 세션부터 돈다.

## 작업 흐름

바로 끝나는 일은 바로 한다. 작은 변경은 채팅에서 짧은 설계만 승인받는다. 큰 작업만 아래 단계를 하나씩 승인받으며 진행한다.

| 단계 | 산출물 | 스킬 |
|---|---|---|
| 의도 | `docs/work/<날짜>-<주제>/intent.md`: 사용자 말 그대로의 문제·결과·대상·제약·열린 질문 | `brainstorming` |
| 설계 | 같은 폴더의 `spec.md`: 동작·구조, 번호 붙은 수용 기준(R1…, 숫자 목표 포함)과 우려 사항 | `brainstorming` |
| 디자인 | 화면 작업이면 같은 폴더의 `design.md`: 디자인 방향·토큰·컴포넌트·화면 흐름과 상태. 참고 사이트를 Playwright·REA로 캡처해 색·글꼴·간격을 측정하거나, 주어진 디자인 시스템(링크·패키지·Figma·DESIGN.md)을 기준으로 삼는다 | `design-md`, impeccable |
| 뼈대 | 새 프로젝트일 때. 질문으로 스택을 정하고 공식 생성기로 만든다. 전체 검사 명령과 AGENTS.md까지. 원하면 가드레일(보호 경로 차단, 배포·푸시는 사람 승인, 편집 뒤 포매터)을 `.claude/settings.json`에 넣는다 | `scaffold` |
| 계획 | `plan.md`: Task마다 채우는 R#, 파일·시그니처·테스트 assertion·검증 명령 | `writing-plans` |
| 구현·테스트 | 재현 테스트를 먼저 쓴다. 통과 기준은 전체 검사 | `test-driven-development`, `systematic-debugging`, `verification-before-completion` |
| 나눠 맡기기 | 서로 독립인 일이 여럿일 때 | `memorybox` |
| 리뷰 | 병렬 탐색 → 검증 투표 → 보안 → 위험 등급 | `review`, `receiving-code-review` |
| 조사 | 원문 인용이 있는 출처 대장, 핵심 주장은 다시 확인 | `research` |

승인한 문서에는 `승인: 날짜`를 적고 커밋하므로 git 기록이 곧 승인 기록이다. 구현 중에는 plan 체크박스와 handoff가 진행 위치를 잡아 두어서, 압축하거나 다른 호스트로 넘어가도 첫 미체크 단계부터 이어 간다. evaluator는 R#마다 충족·미충족·미검증으로 판정한다.

구현이 plan·docs와 달라지면 같은 커밋에서 문서를 고친다. 요구가 바뀌면 영향받는 가장 앞 문서부터 고치고 뒤 문서는 다시 승인받는다. 문서가 원본이고, 메모리는 문서 위치만 가리킨다.

### `/loopeng`: AI SDLC 루프

`/loopeng <요청>`은 위 단계를 의도 → 설계 → 계획 → 구현 → 검증 → 리뷰 → 출시 → 학습 순서로 끝까지 돌린다.

- **게이트**: 의도·설계·계획·출시(푸시·PR)에서만 멈추고 승인을 받는다. 그 사이의 구현·검증·리뷰는 묻지 않고 이어 간다.
- **되돌아가기**: 검증이나 리뷰에서 실패하면 구현으로 돌아간다. 같은 원인으로 세 번 실패하면 멈추고 보고한다.
- **상태**: 작업 폴더의 문서, `승인:` 줄, plan 체크, `loop.md`(단계마다 한 줄씩 붙이는 기록)로 판단한다. 그래서 압축하거나 다른 호스트로 넘어가도 `/loopeng`만 치면 이어 간다.
- **상태**: `/loopeng status`는 루프가 지금 어디인지 보여 준다. 단계별 스킬 지도는 `harness-guide`에 있다. Codex에서는 `$loopeng`으로 부른다.

## 메모리

Claude Code auto memory의 형식(`MEMORY.md` 색인 + 사실 하나에 파일 하나)을 그대로 쓰고 층을 넓혔다. 폴더는 기본이 `~/.claude/projects/<메인 저장소 경로>/memory/`이고, `autoMemoryDirectory`(절대 경로나 `~/` 경로)를 설정하면 그 폴더를 쓴다. 기본 폴더는 같은 저장소의 worktree끼리 공유한다. `settings.local.json`은 git에 없어서 새 worktree에는 없으므로, 옮긴 폴더를 worktree에서도 쓰려면 그 worktree에도 같은 설정을 둔다.

| 층 | 어디 | 읽히는 방식 |
|---|---|---|
| 단기 | `handoff.md`: 지금·다음·막힘 5줄 | SessionStart hook이 본문을 넣는다(압축·`/clear` 뒤에도) |
| 중기 | 메모 파일(`type`은 user·feedback·project·reference, `hits`) + `MEMORY.md` | Claude는 색인 200줄을 스스로 읽고, Codex·Copilot에는 hook이 넣는다 |
| 장기·팀 | 프로젝트 `AGENTS.md`의 `## 명령`·`## 자주 틀리는 것`·`## 지식 지도` | 세 호스트가 매 세션 읽는다 |
| 장기·개인 | `~/.claude/CLAUDE.md` | 모든 프로젝트 |
| 원본 | `docs/`, `docs/work/*/` | 지식 지도를 보고 필요할 때 |

- **기록**: 코드만 봐서는 알 수 없고, 오래 유효하며, 잊으면 손해인 것만 남긴다. 같은 교정이 다시 나오면 기존 메모의 `hits`를 올린다.
- **승격**: `hits`가 2 이상이거나 사용자가 "항상/절대"라고 하면 AGENTS.md나 `~/.claude/CLAUDE.md`로 올리고 메모는 지운다. 장기 층을 바꿀 때는 diff를 보여 주고 승인받는다.
- **점검**: 색인이 150줄을 넘거나 승격 후보가 있을 때만 세션 시작에 한 줄로 알린다. 정리는 `memory` 스킬이 한다.
- **여러 호스트**: 기본 폴더는 저장소 밖에 있어서 Codex 샌드박스가 쓰지 못한다. 여러 호스트가 함께 쓰는 프로젝트는 `.claude/settings.local.json`의 `autoMemoryDirectory`를 저장소 안 `.agents/memory`의 절대 경로로 옮긴다(gitignore). 별도 worktree에서 도는 Codex 워커에는 `--add-dir <메모리박스>`로 쓰기를 열어 준다.

## 메모리박스 (리드·워커)

메시지 전달과 깨우기는 호스트 기능(Claude 서브에이전트·teammate, Orca `orchestration`)을 쓴다. 메모리박스는 그 위에서 **내용·상태·공유 기억**을 파일로 맡는다. 메모리 폴더 안 `memorybox/`에 있다.

```
memorybox/runs/<run>/RUN.md log.md   # 목표·계획 / 스크립트가 붙이는 한 줄 기록·공유 노트
memorybox/open/ claimed/ done/       # 항목 <id>.md. 상태 = 들어 있는 폴더
memorybox/workers/<워커>.md          # 재시작 복구용 체크포인트
memorybox/artifacts/ archive/YYYY-MM/ BOARD.md
```

1. 리드가 `run-create`로 목표를 세우고, 일마다 `post`한다. Ask는 1,000자 이하로 Target·Change·Constraints·Ownership·Observable acceptance를 적는다. 순서가 있으면 `--depends`를 단다.
2. 워커는 브리프 하나만 받고 `claim`한다(원자적 rename이라 하나만 이긴다. 선행 항목이 성공하기 전에는 가져갈 수 없다). 작업 중 다른 워커도 알아야 할 사실은 `note`, 멈춘 지점은 `checkpoint`로 남긴다. 끝나면 `done`(Result 1,200자 이하, Learned 3줄 이하).
3. 리뷰·질문·테스트 실패는 같은 `--thread`에 다음 라운드로 잇는다. 라운드는 스크립트가 역할별로 센다(같은 thread에서 리뷰어의 세 번째 항목이면 3라운드). 5라운드를 넘기려 하면 막는다.
4. 리드는 호스트 알림을 기다리고 `board`·`log`로 현황을 본다. 24시간 멈춘 일은 표시만 하고 자동으로 회수하지 않는다.
5. `sweep`이 Learned와 새 knowledge 노트를 내놓으면 `memory` 스킬로 메모나 `hits`가 된다. 끝난 항목은 archive로 가고(30일 뒤 삭제), 끝난 일이 있고 남은 일이 없는 run은 닫힌다. 닫힌 run에 다시 올리면 열린다.

서브에이전트는 auto memory도 SessionStart도 받지 않으므로 브리프가 유일한 통로다. Orca orchestration에서는(실제 워커로 claim → done → `worker_done --report-path`까지 확인) 소유권·전달·`worker_done`을 Orca의 Dispatch가 맡고, 메모리박스는 보고서(`worker_done --report-path`)와 Learned를 맡는다(`skills/memorybox/references/orca.md`). 리드 세션에는 처리할 항목이 있을 때만 세션 시작에 짧은 요약이 붙는다. 명령은 [`skills/memorybox/scripts/memorybox.mjs`](skills/memorybox/scripts/memorybox.mjs)에 있다.

## 코드 리뷰

목표는 되돌림·사고를 늘리지 않으면서 사람 리뷰 시간을 최소로 줄이는 것이다. 한 레이어가 모든 문제를 잡지는 못하므로 레이어를 나눈다.

| 레이어 | 이 하네스 |
|---|---|
| 1. PR 전 자기 검증 | `verification-before-completion`, 화면 스크린샷, 새 컨텍스트의 `evaluator` |
| 2. AI 리뷰 | `review`: 렌즈별 탐색(의도·시스템 적합·경계, Deep은 테스트·성능 추가) → 조율자가 중복을 합침 → 검증자들이 전체 목록에 투표 |
| 3. 보안 | Claude Code `/security-review`, 없으면 `security-reviewer` |
| 4. 필수 CI | AGENTS.md `## 명령`의 전체 검사, 브랜치 보호(필수 검사, 미해결 코멘트가 있으면 병합 차단) |
| 5. 사람 승인 | 위험 등급별 Low 0명 · Medium 1명 · High 2명. 에이전트 승인은 사람 승인을 대신하지 않는다 |
| 6. 병합 큐·플래그 | PR의 Risk·How to revert 칸 |
| 7. 배포 뒤 | 놓친 사례를 "잡았어야 할 레이어"와 함께 REVIEW.md에 남겨 회귀를 점검한다 |

깊이별 서브에이전트 수는 Quick 2 · Standard 7 · Deep 9다. 수렴 규칙: 2라운드부터는 새 diff만 보고, 3라운드를 넘기면 접근을 다시 생각하고, 이미 낸 지적은 반복하지 않는다.

## hook

| 이벤트 | 하는 일 | Claude Code | Codex | Copilot CLI |
|---|---|---|---|---|
| SessionStart (startup·resume·clear·compact) | Ponytail + 작업 규칙(4,000자 이하)을 먼저 넣고, 그 뒤에 메모리 폴더 위치·인계·점검 알림·메모리박스 요약을 붙인다. Codex·Copilot에는 `MEMORY.md` 색인도 넣는다 | 네 경우 모두 실측 | startup·resume 실측. Codex는 압축 이벤트를 따로 두고(PostCompact, 알림용) 그 뒤에 다시 넣지 않는 것으로 보인다. 규칙이 흐려지면 resume하거나 새 세션 | 실측 전 |
| PreToolUse (Edit·Write, `if`로 `.tsx`·`.jsx`·`.vue`·`.svelte`·`.css`·`.html`만) | impeccable 사용 여부를 정하지 않은 프로젝트에서 세션에 한 번 "물어볼 것"을 알린다. 다른 파일에서는 프로세스가 뜨지 않는다 | UI 파일에서만 1회 실측 | 실행하지 않음(실측) | 실측 전 |

호스트는 hook 환경변수로 구분한다. 세 호스트 모두 `CLAUDE_PLUGIN_ROOT`를 준다. Codex·Copilot은 `PLUGIN_ROOT`를 더 주고, Copilot만 `COPILOT_PLUGIN_ROOT`를 준다. `COPILOT_CLI=1`은 Copilot이 모든 하위 프로세스에 붙이므로 판별에 쓰지 않는다.

운영 원칙:

1. hook에는 반드시 막아야 하거나 압축 뒤에 다시 넣어야 하는 것만 둔다. 권고는 스킬·규칙 파일로 한다.
2. 컨텍스트 주입은 SessionStart에서만 한다. 예외는 `if`로 좁혀서 세션에 한 번만 말하는 도구 hook이다.
3. 출력이 없는 hook도 비용이 든다. 쓰지 않는 앱의 hook은 지운다.
4. 특정 프로젝트에만 필요한 플러그인은 그 프로젝트에서만 켠다.
5. 점검 명령: `/hooks`, `/context`, `/memory`.

## 토큰 예산

`npm test`가 검사한다.

| 항목 | 한도 | 이유 |
|---|---|---|
| 세션 시작 고정 문맥 | 4,000자 | 매 세션 들어간다. 고정 텍스트를 앞에 두어 프롬프트 캐시가 맞는다 |
| 스킬 description 합계 | 7,000자 | Codex 스킬 목록 예산이 8,000자다 |
| SKILL.md 하나 | 20,000자 미만 | Claude Code가 압축 뒤 그 이상을 자른다. 긴 내용은 `references/`로 |
| 인계·색인·메모리박스 주입 | 1,500자 · 200줄 · 800자 | 필요할 때만 붙는다 |

## 구성

```
.claude-plugin/        Claude Code·Copilot manifest, marketplace
.codex-plugin/         Codex manifest      .agents/plugins/  Codex marketplace
hooks/                 hooks.json, session-start.mjs, frontend-check.mjs, lib.mjs, ponytail.md, context.md
skills/                스킬 29개 (가이드·루프·흐름·디자인·프로젝트·리뷰·조사·메모리박스·문서·백엔드·정리)
agents/                evaluator, security-reviewer, docs-writer
commands/docs.md       /docs
rtk/rtk-config.toml    RTK 안전 설정
semgrep-rules/, scripts/sarif-to-jsonl.py   security-reviewer용
test/                  hook·메모리·메모리박스·예산 테스트, e2e/hosts.mjs(hook 실호스트)·e2e/loop.mjs(흐름 실호스트)
```

## 개발

- `npm test`, `claude plugin validate .`
- 실제 호스트 확인: `node test/e2e/hosts.mjs [claude] [codex] [copilot]`. 작업 트리 사본에 trace를 심어 임시 홈에 설치한다. 그런 다음 hook이 받은 입력·돌려준 출력과 모델이 실제로 본 내용을 확인한다. 모델 사용량이 든다.
- 흐름 회귀 확인: `node test/e2e/loop.mjs [claude|codex]`. 스크립트가 사용자 역할을 맡는다. 작은 프로젝트에서 `/loopeng` 큰 작업 루프를 끝까지 돌리고 문서·승인·커밋·스킬 호출을 검사한다. 한 번에 10~30분 걸리고 모델 사용량이 든다. 스킬 문구나 흐름을 바꿨을 때 돌린다.
- 배포할 때는 `package.json`과 manifest 세 개(`.claude-plugin/plugin.json`·`marketplace.json`, `.codex-plugin/plugin.json`)의 버전을 함께 올린다.
- 하네스를 고칠 때의 규칙은 [AGENTS.md](AGENTS.md)에 있다.

## 라이선스 고지

포함된 외부 MIT 자료의 저작권 고지는 [`skills/NOTICE.md`](skills/NOTICE.md)에 있다.
