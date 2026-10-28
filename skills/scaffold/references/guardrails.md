# 프로젝트 가드레일 (선택)

스킬과 AGENTS.md 규칙은 권고라서 세션이 어길 수 있다. 반드시 지켜야 하는 것만 Claude Code 설정으로 강제한다. 하네스 hook이 아니라 그 프로젝트의 `.claude/settings.json`(git에 올려 팀이 공유)에 둔다.

| 가드레일 | 방법 | 효과 |
|---|---|---|
| 보호 경로: 생성 코드, 고정한 패키지, 적용된 마이그레이션 | `permissions.deny`의 `Edit(/경로/**)` | Edit·Write·Bash 리다이렉션이 막힌다. 바꾸려면 사람이 규칙을 푼다 |
| 비밀 파일 읽기 금지 | `permissions.deny`의 `Read(./.env*)` | 파일 도구와 `cat` 같은 명령이 막힌다 |
| 배포·외부 반영 게이트 | `permissions.ask`의 `Bash(<명령>*)` | 실행 전에 사람이 승인한다. allow 규칙이 있어도 ask가 먼저다 |
| 편집 뒤 포매터 | `PostToolUse` hook 하나(Edit·Write) | 고친 파일만 바로 정리돼 드리프트가 쌓이지 않는다. 모르는 확장자는 포매터가 건너뛴다 |

경로 규칙: `/경로`는 프로젝트 루트 기준이다. `//`는 절대 경로, 앞에 아무것도 없으면 현재 폴더 기준이다. `Write(...)` 경로 규칙은 어떤 호출과도 맞지 않으므로 `Edit(...)`으로 쓴다. Edit 규칙은 파일을 고치는 모든 도구에 적용된다. 평가 순서는 deny → ask → allow이다.

예 (TypeScript, 생성 코드는 `src/gen`, 배포는 `npm run deploy`):

```json
{
  "permissions": {
    "deny": ["Edit(/src/gen/**)", "Read(./.env*)"],
    "ask": ["Bash(npm run deploy*)", "Bash(git push*)"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "timeout": 30,
            "command": "npx --no-install prettier --write --ignore-unknown \"$(node -e \"process.stdout.write(JSON.parse(require('fs').readFileSync(0,'utf8')).tool_input.file_path)\")\" >/dev/null 2>&1 || true" }
        ]
      }
    ]
  }
}
```

Python이면 포매터를 `uv run ruff format`(또는 `ruff format`)으로 바꾼다. 확장자로 좁히려면 handler마다 `"if": "Edit(**/*.py)"`처럼 확장자를 하나씩 쓴다(`{a,b}` 묶음은 `if`에서 맞지 않는다).

넣지 않는 것: 모든 도구 호출마다 도는 hook, 전체 테스트를 도는 hook(커밋·PR의 전체 검사가 맡는다), 사람에게 묻는 hook을 구현 단계에 두는 것(병렬 세션이 모두 멈춘다).

다른 호스트: Codex는 샌드박스와 승인 정책(`-s`, `-a`), Copilot은 `--allow-tool`·`--deny-tool`로 비슷하게 막는다. 이 파일의 설정은 Claude Code에만 적용된다.
