---
name: commit-push-pr
description: 변경을 커밋·푸시하고 PR을 만들 때 사용. Triggers - 커밋해, 푸시해, PR 만들어, PR 올려, commit and push. 리뷰·git log·diff 조회만 할 때는 쓰지 않는다.
user-invocable: true
disable-model-invocation: true
allowed-tools: Bash, Read
---

# 커밋, 푸시, PR 생성

현재 변경을 커밋하고 푸시한 뒤 PR을 만든다. 어느 단계든 막히면 멈추고 사용자에게 묻는다.

## Step 1: 브랜치와 상태 확인

```bash
BRANCH=$(git branch --show-current)
DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')
echo "branch=${BRANCH:-<detached>} default=${DEFAULT:-main}"
git status --short
git diff --stat
git log --oneline -5
```

- `BRANCH`가 비었거나(detached HEAD) 기본 브랜치·`main`·`master`면 커밋하지 않는다. 사용자에게 브랜치 이름을 확인하고 `git switch -c <타입>/<주제>`로 만든 뒤 진행한다.
- `git log` 출력에서 이 저장소의 커밋 메시지 형식을 확인한다(Step 4에서 쓴다).

## Step 2: 검증

커밋 전에 프로젝트 전체 검사(AGENTS.md `## 명령`)를 이번에 돌리고 출력을 확인한다(`verification-before-completion`). 실패하면 커밋하지 않는다. 이 출력이 PR의 Testing 칸이 된다.

## Step 3: 스테이징 + 위험 파일 확인

```bash
# 이번 작업에 속한 파일만 이름으로 stage. git add -A / git add . 금지
git add <파일> ...

# 민감 파일이 stage되지 않았는지 확인(git add 직후)
git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|\.(pem|key|p12|pfx)$|id_rsa|credentials' | grep -vE '\.(example|sample|template)$' && echo "WARNING: 민감 파일 포함 — unstage 후 사용자에게 확인"
git diff --cached --stat
```

- `git status`에 이번 작업과 관계없는 파일(다른 작업, 생성물)이 있으면 stage하지 않고 사용자에게 알린다.
- 구현이 plan·docs와 달라졌으면 그 문서 수정도 같은 커밋에 넣는다.

## Step 4: 커밋

제목은 저장소의 기존 형식을 따르고, 기존 형식이 없으면 conventional commits `<type>(<scope>): <제목>`(50자 안팎)을 쓴다. type은 `feat`, `fix`, `docs`, `refactor`, `test`, `chore` 등. 본문은 무엇이 아니라 왜.

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <제목>

<본문 — 왜 바꿨나>
EOF
)"
```

attribution(예: `Co-Authored-By:` 줄)은 호스트나 사용자 지침이 정한 그대로 붙이고, 지침이 없으면 붙이지 않는다.

## Step 5: 푸시

```bash
git push -u origin "$(git branch --show-current)"
```

force push는 사용자가 명시적으로 요청할 때만 한다.

## Step 6: PR 생성

이미 이 브랜치의 PR이 있으면(`gh pr view --json url`) 푸시만 하고 그 URL을 보고한다. 없으면 만든다. 제목은 커밋 제목과 같은 형식, 본문은 `review` 스킬의 `references/PR.template.md`와 같은 네 칸이다.

```bash
gh pr create --title "<type>(<scope>): <제목>" --body "$(cat <<'EOF'
## 무엇을·왜
- 변경 내용과 의도(docs/work/*/intent.md가 있으면 링크)

## Testing
- 이번에 실행한 명령과 결과(전체 검사 출력 요약)

## Risk
- 영향 범위, 위험 등급(Low·Medium·High)

## How to revert
- 되돌리는 방법(플래그 끄기·revert·마이그레이션 되돌리기)
EOF
)"
```

호스트나 사용자 지침이 PR 본문 끝에 붙이라는 줄이 있으면 붙인다. Testing에는 실제로 실행한 것만 쓴다. 병합 전에는 `review`를 돌린다.

## 출력

PR URL과, Testing에 적은 검사 명령·결과 한 줄.
