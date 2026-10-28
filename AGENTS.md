# adlc-harness 개발 규칙

이 저장소는 Claude Code·Codex·Copilot CLI가 함께 쓰는 플러그인이다. 사용자 세션에 들어가는 규칙은 `hooks/ponytail.md`와 `hooks/context.md`에 있다. 이 파일은 하네스 자체를 고칠 때만 쓴다. 하네스를 쓰는 흐름과 특성은 `skills/harness-guide/SKILL.md`에 있고, 흐름을 바꾸면 그 파일과 README를 같이 고친다.

## 예산 (넘기면 기능 추가보다 먼저 줄인다)

- hook은 `hooks/hooks.json`의 SessionStart와, `if`로 화면 파일 Edit·Write에만 도는 PreToolUse(impeccable 질문, 세션에 한 번)뿐이다. `if` 없이 매 프롬프트·매 도구 호출마다 도는 hook은 만들지 않는다(테스트가 막는다).
- 세션 시작 고정 문맥(`ponytail.md` + `context.md`)은 4,000자 이하. 동적 내용(메모리 폴더·인계·색인·점검)은 고정 문맥 뒤에 붙인다(프롬프트 캐시).
- 스킬 description 합계 7,000자 이하(Codex 스킬 목록 예산 8,000자). description은 "언제 쓰나"만 쓰고 절차를 요약하지 않는다.
- SKILL.md 하나는 20,000자 미만(Claude Code가 압축 뒤 그 이상을 잘라 다시 붙인다). 길면 `references/`로 나눈다.
- 런타임 의존성을 두지 않는다. hook과 스크립트(`skills/memorybox/scripts/memorybox.mjs`)는 Node 표준 라이브러리만 쓴다.

## 고칠 때

- `skills/brainstorming`·`systematic-debugging`·`writing-plans`·`test-driven-development`·`verification-before-completion`·`receiving-code-review`, `hooks/ponytail.md`, `skills/vercel-react-best-practices`는 외부 MIT 자료다. 본문은 되도록 그대로 두고 스킬 이름·저장 위치처럼 이 하네스와 맞지 않는 곳만 고친다. 하네스 연결은 끝의 "이 하네스에서" 절에 두고, 바꾼 것은 `skills/NOTICE.md`에 적는다. 그 밖의 파일에는 출처·참고 문구를 쓰지 않는다(테스트가 막는다).
- 배포할 때 `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`의 버전을 함께 올린다(같은 버전이면 호스트가 갱신하지 않는다).
- 끝내기 전에 `npm test`와 `claude plugin validate .`를 돌린다. hook·메모리 동작을 바꿨으면 `node test/e2e/hosts.mjs [claude] [codex] [copilot]`로 실제 호스트에서 hook 호출과 모델이 본 내용을 확인한다. 흐름을 담은 스킬(brainstorming·writing-plans·loopeng·harness-guide·evaluator)을 바꿨으면 `node test/e2e/loop.mjs claude`로 루프를 끝까지 돌린다(둘 다 모델 사용량이 든다).
