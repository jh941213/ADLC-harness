---
name: scaffold
description: 새 프로젝트의 뼈대를 만들 때 사용. 질문으로 종류·스택·데이터·품질 도구·CI를 정하고, 각 프레임워크의 공식 생성기로 만든 뒤 전체 검사 명령과 AGENTS.md를 갖춘다. Triggers - 새 프로젝트, 뼈대 만들어, 스캐폴드, scaffold, 프로젝트 초기화.
---

# Scaffold

템플릿을 들고 다니지 않는다. 구조는 공식 생성기(`create-next-app`, `create-vite`, `uv init`, `cargo new` 등)가 최신으로 만든다. 이 스킬은 질문으로 선택을 정하고, 생성기를 돌리고, 검사 명령과 AGENTS.md를 맞춘다.

## 1. 먼저 볼 것

- 폴더가 비었는지 본다. 이미 코드가 있으면 뼈대를 새로 깔지 않고, 빠진 것(전체 검사 명령·AGENTS.md·CI)만 제안한다.
- `docs/work/*/spec.md`나 대화에서 이미 정한 것은 다시 묻지 않는다.

## 2. 질문

한 번에 하나씩 묻는다. Claude Code는 `AskUserQuestion`, 다른 호스트는 번호 보기로 묻는다. 보기마다 추천을 첫째에 두고, 질문 끝에 "이 답으로 바뀌는 것"을 한 줄 붙인다. 답이 이미 나온 질문은 건너뛴다.

1. **무엇을 만드나:** 웹앱 / API 서버 / 풀스택(웹 + API) / CLI·라이브러리 / 모바일.
2. **언어·프레임워크:** 1의 답에 맞는 2~3개. 예: 웹은 Next.js(App Router) / Vite + React / SvelteKit, API는 FastAPI(uv) / Hono(Node) / Go 표준 라이브러리. 사용자가 이름을 대면 그것을 쓴다.
3. **저장소 구조**(풀스택일 때만): 모노레포 `apps/*` / 저장소 분리.
4. **데이터:** 없음 / PostgreSQL / SQLite / 기타. 서버 DB면 로컬용 `compose.yml`을 함께 만들지 묻는다.
5. **품질 도구:** 추천 묶음 그대로 / 직접 고르기. 추천은 TS면 ESLint + Prettier(또는 Biome) + Vitest + `tsc --noEmit`, Python이면 ruff + pyright + pytest.
6. **CI:** GitHub Actions로 전체 검사 / 없음.
7. **가드레일:** 넣기(추천: 생성 코드·비밀 파일 보호, 배포·푸시는 사람 승인, 편집 뒤 포매터) / 없음. 넣으면 보호할 경로와 배포 명령을 묻는다. 방법은 `references/guardrails.md`.

다 정하면 선택 요약(무엇을 어떤 생성기로 만들고 무엇을 더하는지)을 보여 주고 승인받는다. 승인 전에는 아무것도 만들지 않는다.

## 3. 만들기

- 공식 생성기를 비대화형 옵션으로 실행한다(`--yes`, `--typescript` 등). 버전은 생성기가 고르는 최신을 쓴다. 옵션을 모르면 공식 문서(context7 등)로 확인하고 추측하지 않는다.
- 생성기 결과는 그대로 두고 필요한 것만 더한다: 고른 품질 도구, `.gitignore` 합치기, 비밀 없는 `.env.example`, DB를 골랐으면 `compose.yml`.
- 루트에 **전체 검사 명령 하나**를 만든다(예: `package.json`의 `check` 스크립트, 또는 `Makefile`·`justfile`의 `check`). 순서는 lint → 타입 → 테스트다. 모노레포면 앱별 검사를 이 명령 하나로 묶는다.
- 생성기 기본 화면·엔드포인트 말고 데모 기능은 만들지 않는다.
- 가드레일을 골랐으면 `references/guardrails.md`대로 `.claude/settings.json`에 넣는다. 기존 프로젝트에도 이 절만 따로 적용할 수 있다.

## 4. AGENTS.md

없으면 만들고 `CLAUDE.md`에 `@AGENTS.md` 한 줄을 둔다(Claude Code는 CLAUDE.md가 있으면 AGENTS.md를 직접 읽지 않는다). 내용은 코드로 알 수 없는 것만 둔다. 스택 목록·디렉터리 설명은 매니페스트에 있으니 쓰지 않는다.

```markdown
## 명령
- 전체 검사: `npm run check`
- 개발 서버: `npm run dev`

## 자주 틀리는 것

## 지식 지도
| 작업 | 먼저 읽을 것 |
|---|---|

## 하네스 가이드
흐름(크기 판정·SDLC 단계·문서·승인), 서브에이전트 띄우는 법, 메모리 쓰는 법, 문서·리뷰 스킬이 헷갈리면 `harness-guide` 스킬을 읽고 따른다. 처음부터 끝까지 돌릴 때는 `/loopeng`.
```

## 5. 확인과 마무리

- 의존성을 설치하고 전체 검사를 실제로 돌려 통과 출력을 보여 준다. 실패하면 고치고 다시 돌린다.
- git 저장소가 아니면 `git init`과 첫 커밋을 제안하고, 사용자가 동의하면 한다.
- `rtk --version`이 실패하면 RTK 설치를 제안한다(README의 RTK 절, 안전 설정은 플러그인 폴더의 `rtk/rtk-config.toml`).
- 보고: 선택 요약, 생성기가 만든 것과 직접 더한 파일, 전체 검사 결과, 다음 단계(`brainstorming`으로 첫 기능 설계).
