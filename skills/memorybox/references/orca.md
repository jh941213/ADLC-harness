# Orca orchestration과 함께 쓰기

Orca가 켜져 있고 사용자가 워커를 감독(supervise)·조율하라고 하면, 워커는 Orca로 띄운다. Claude 서브에이전트로 대신하지 않는다(Orca 규칙). 실행 파일은 Orca 터미널이면 `orca`, 아니면 `/Applications/Orca.app/Contents/Resources/bin/orca`이고, 처음 한 번 `orca skills get orchestration`으로 가이드를 받아 그 지시를 따른다. 아래는 그 위에 메모리박스를 얹는 방법이다.

## 권한 나누기

| | Orca | 메모리박스 |
|---|---|---|
| 맡는 것 | 누가 맡았나(Task·Dispatch), 전달·깨우기, ask·reply, `worker_done`, 터미널 정리 | Ask 원문, 결과 보고서, Learned → 메모리, 세션을 넘어 보이는 현황 |
| 권한 | **활성 Dispatch가 유일한 권한** | Orca를 따라간다. 둘이 다르면 Orca가 맞다 |
| 닫기 | `worker_done`이 Task를 정산 | 워커의 `done` 파일이 `--report-path`가 된다 |

메모리박스의 `release`는 Orca에서 `worker-stop`이나 `worker-abandon`을 결정한 뒤에만 쓴다. 응답이 없다는 이유만으로는 아무것도 하지 않는다.

## 코디네이터

1. `orca status --json` → `orca orchestration run-create --objective "<목표>" --json`
2. 일마다 메모리박스에 `post`하고(ID를 얻는다) 아래 spec으로 `orca orchestration worker-start --spec "<spec>" --worktree current --agent claude|codex --json`. 서로 독립인 일은 기다리기 전에 모두 띄운다.
3. `orca orchestration check --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`
   - question은 `reply`, escalation은 판단해서 `send`로 답한다.
   - `worker_done`은 기대한 Dispatch인지 확인하고, `--report-path`(메모리박스 done 파일)를 `memorybox show <ID>`로 읽는다.
   - 정산된 워커마다 재사용·`worker-retain`·`worker-release` 중 하나를 정한 뒤 `--ack`한다.
4. 모든 Dispatch가 정산되면 `memorybox sweep` → Learned를 `memory` 스킬로.
5. 워커가 메모리박스에 쓰지 못했으면(예: Codex 샌드박스) `worker_done` 본문으로 코디네이터가 `claim --by <워커 handle>`과 `done`을 대신 기록한다.

## worker-start에 넘길 spec

```
Target: <파일·컴포넌트·환경>
Change: <만들 결과>
Constraints: <지킬 것, 건드리지 말 것>
Ownership: <이 워커가 고쳐도 되는 범위>
Observable acceptance: <완료를 증명할 테스트·출력>

Memorybox: MEMORYBOX=<메모리박스 절대경로> SCRIPT=<memorybox.mjs 절대경로> ITEM=<ID>
- 시작할 때 node "$SCRIPT" claim <ITEM> --by <너의 Orca handle> --dir "$MEMORYBOX"
- worker_done 직전에 node "$SCRIPT" done <ITEM> --by <handle> --outcome <worker_done과 같은 값> --dir "$MEMORYBOX" 로 ## Result와 ## Learned(최대 3줄)를 남기고,
  worker_done에 --report-path "$MEMORYBOX/done/<ITEM>.md"를 붙인다.
Orca 프리앰블과 다르면 프리앰블을 따른다.
```

## 워커

프리앰블이 권한이다. 하트비트는 프리앰블의 주기대로, 막히면 `ask`(같은 메시지 ID로 이어서), 파일을 새로 시작하기 전·테스트를 돌린 뒤·`worker_done` 직전에 `check --terminal <handle>`과 `--ack`. 메모리박스 `done`을 쓴 뒤 `worker_done`을 정확히 한 번 보내고(본문 세 문장, `--outcome` 명시), 그 뒤에는 쉰다.
