// Live check of the /loopeng big-task loop on a real host, with this working tree as the plugin. The script plays the user:
// it answers the questions, approves each gate and declines push/PR, then checks the artifacts, the commits and which
// skills ran. A full loop spends real model usage (10–30 minutes), so it is not part of npm test.
//   node test/e2e/loop.mjs [claude|codex]
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const HOST = process.argv[2] ?? 'claude';
const WORK = mkdtempSync(join(tmpdir(), 'adlc-loop-'));
const dir = join(WORK, 'todo');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PLUGIN_|CLAUDE_PROJECT_DIR|CLAUDE_ENV_FILE|PLUGIN_|COPILOT_CLI)/.test(k)));
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: dir, encoding: 'utf8' });

// A three-function module with one test and a full-check command.
mkdirSync(join(dir, 'src'), { recursive: true });
mkdirSync(join(dir, 'test'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'todo', type: 'module', scripts: { test: 'node --test test/' } }, null, 2));
writeFileSync(join(dir, 'src', 'todo.js'), 'export function add(list, title) { return [...list, { title, done: false }]; }\nexport function complete(list, i) { return list.map((t, j) => j === i ? { ...t, done: true } : t); }\nexport function pending(list) { return list.filter(t => !t.done); }\n');
writeFileSync(join(dir, 'test', 'todo.test.js'), "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add, complete, pending } from '../src/todo.js';\ntest('add and complete', () => { assert.equal(pending(complete(add(add([], 'a'), 'b'), 0)).length, 1); });\n");
writeFileSync(join(dir, 'AGENTS.md'), '# todo\n\n## 명령\n- 전체 검사: npm test\n');
sh('git', ['init', '-q']);
sh('git', ['config', 'user.name', 'loop-test']);
sh('git', ['config', 'user.email', 'loop@test']);
sh('git', ['add', '-A']);
sh('git', ['commit', '-qm', 'init']);

// Each host: say(prompt) runs one turn in the same session and returns { text, tools } (tools as "Kind(detail)").
const hosts = {
  claude() {
    let session = '';
    return prompt => {
      const r = spawnSync('claude', ['-p', prompt, '--plugin-dir', REPO, '--setting-sources', 'project,local', '--model', 'sonnet',
        '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'Skill', 'Agent', 'Task', 'TodoWrite', 'Bash(git:*)', 'Bash(npm:*)', 'Bash(node:*)', 'Bash(ls:*)', 'Bash(mkdir:*)', 'Bash(date:*)', 'Bash(cat:*)',
        ...(session ? ['--resume', session] : [])], { cwd: dir, env: ENV, input: '', encoding: 'utf8', timeout: 1800000, maxBuffer: 256 * 1024 * 1024 });
      const events = (r.stdout ?? '').split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      session = events.find(e => e.session_id)?.session_id ?? session;
      const tools = events.filter(e => e.type === 'assistant').flatMap(e => e.message.content.filter(c => c.type === 'tool_use')).map(c =>
        c.name === 'Skill' ? `Skill(${c.input.skill})` : ['Agent', 'Task'].includes(c.name) ? `Agent(${c.input.subagent_type ?? ''})`
          : c.name === 'Bash' ? `Bash(${c.input.command})` : `${c.name}(${c.input.file_path ?? ''})`);
      return { text: events.find(e => e.type === 'result')?.result ?? '', tools };
    };
  },
  codex() {
    const home = join(WORK, 'codex-home');
    mkdirSync(home, { mode: 0o700 });
    copyFileSync(join(homedir(), '.codex', 'auth.json'), join(home, 'auth.json'));
    const env = { ...ENV, CODEX_HOME: home };
    for (const a of [['plugin', 'marketplace', 'add', REPO], ['plugin', 'add', 'adlc-harness@adlc-harness']]) execFileSync('codex', a, { env, stdio: 'ignore' });
    let thread = '';
    // workspace-write keeps .git read-only; open it so the loop can commit its approvals, as the guide tells Codex users.
    const common = ['--json', '--dangerously-bypass-hook-trust', '--skip-git-repo-check', '-c', `sandbox_workspace_write.writable_roots=["${join(dir, '.git')}"]`];
    return prompt => {
      const args = thread ? ['exec', 'resume', ...common, thread, prompt] : ['exec', ...common, '-s', 'workspace-write', prompt];
      const r = spawnSync('codex', args, { cwd: dir, env, input: '', encoding: 'utf8', timeout: 1800000, maxBuffer: 256 * 1024 * 1024 });
      const events = (r.stdout ?? '').split('\n').map(l => { try { return JSON.parse(l); } catch { return {}; } });
      thread = events.find(m => m.type === 'thread.started')?.thread_id ?? thread;
      const items = events.filter(m => m.type === 'item.completed').map(m => m.item);
      const tools = items.flatMap(i => i.type === 'command_execution' ? [`Bash(${i.command})`] : i.type === 'file_change' ? (i.changes ?? []).map(c => `Write(${c.path})`) : []);
      return { text: items.filter(i => i.type === 'agent_message').map(i => i.text).join('\n'), tools };
    };
  },
};

const work = () => { try { const d = readdirSync(join(dir, 'docs', 'work')).filter(n => n !== 'archive'); return d.length ? join(dir, 'docs', 'work', d[0]) : ''; } catch { return ''; } };
const read = f => { try { return readFileSync(join(work(), f), 'utf8'); } catch { return ''; } };
const log = [];
let say;
try {
  say = hosts[HOST]();
  const turn = prompt => { const r = say(prompt); log.push(r); process.stdout.write(`\n### ${prompt.slice(0, 60)}\ntools: ${r.tools.map(t => t.slice(0, 60)).join(', ') || '-'}\n${r.text.slice(0, 600)}\n`); return r; };
  turn(`${HOST === 'codex' ? '$loopeng' : '/loopeng'} 할 일 목록 모듈(src/todo.js)에 마감일 기능을 넣고 싶어. 큰 작업으로 진행해 줘.`);
  turn('답: 마감일은 날짜만(YYYY-MM-DD), 선택 항목이다. 지난 마감일인 미완료 항목을 뽑는 overdue(list, today) 함수가 필요하다. 시간대는 고려하지 않는다. 기존 add 호출은 그대로 동작해야 한다. 접근법은 네가 추천하는 걸로 하자. 더 물을 게 없으면 진행해.');
  for (let i = 0, idle = 0; i < 16; i++) {
    const last = log.at(-1), loopMd = read('loop.md');
    if (/학습|done/.test(loopMd.trim().split('\n').at(-1) ?? '')) break;
    if (/(푸시|push|PR)/i.test(last.text) && /리뷰/.test(loopMd)) { turn('푸시·PR은 하지 말자. 7은 건너뛰고 8 학습으로 마무리해.'); continue; }
    idle = last.tools.length ? 0 : idle + 1;
    if (idle >= 3) break;
    turn(/\?/.test(last.text) && !/승인/.test(last.text) ? '네 추천대로 해. 계속 진행해.' : '승인한다. 계속 진행해.');
  }
} finally {
  rmSync(join(WORK, 'codex-home', 'auth.json'), { force: true }); // never leave a copied login behind
}

const intent = read('intent.md'), spec = read('spec.md'), plan = read('plan.md'), loopMd = read('loop.md');
const tools = log.flatMap(l => l.tools);
const used = name => tools.some(t => new RegExp(`Skill\\([^)]*${name}\\)|skills/${name}/SKILL\\.md`).test(t));
let testOut = '';
try { testOut = sh('npm', ['test']); } catch (e) { testOut = `FAIL ${e.stdout ?? ''}`; }
const approved = text => /승인:\s*\d{4}-\d{2}-\d{2}/.test(text);
const tasks = (plan.match(/^#+ .*Task/gm) ?? []).length;
const checks = [
  ['1턴: 코드보다 질문이 먼저', /\?/.test(log[0]?.text ?? '') && !(log[0]?.tools ?? []).some(t => /(Write|Edit)\(.*\/(src|test)\//.test(t))],
  ['harness-guide·brainstorming·writing-plans를 실제로 씀', used('harness-guide') && used('brainstorming') && used('writing-plans')],
  ['intent.md 다섯 칸 + 승인', ['문제', '결과', '대상', '제약', '열린 질문'].every(k => intent.includes(k)) && approved(intent)],
  ['spec.md 수용 기준 R#·우려 사항·승인', /## 수용 기준[\s\S]*R1/.test(spec) && /## 우려 사항/.test(spec) && approved(spec)],
  ['plan.md 승인·재개·Task마다 R#', approved(plan) && /재개:/.test(plan) && tasks > 0 && (plan.match(/R\d/g) ?? []).length >= tasks],
  ['plan 단계 모두 체크', /^\s*- \[x\]/m.test(plan) && !/^\s*- \[ \]/m.test(plan)],
  ['구현: src 변경 + 테스트 통과', /due|overdue/i.test(readFileSync(join(dir, 'src', 'todo.js'), 'utf8')) && !/^FAIL/.test(testOut) && /(#|ℹ) pass ([2-9]|\d\d)/.test(testOut)],
  ['loop.md: 의도~학습 8단계, 실제 시각', ['의도', '설계', '계획', '구현', '검증', '리뷰', '학습'].every(k => loopMd.includes(k)) && !/ 00:00 \|/.test(loopMd)],
  ['검증·리뷰 실행', HOST === 'claude' ? tools.some(t => /evaluator/.test(t)) && used('review') : used('review') || /리뷰 \|/.test(loopMd)],
  ['승인·구현 커밋(의도·설계·계획 + 구현)', sh('git', ['log', '--oneline']).trim().split('\n').length >= 5],
  ['푸시·PR·병합 없음', !tools.some(t => /git push|gh pr|git merge/.test(t))],
];
process.stdout.write(`\n== ${HOST} (폴더 ${dir})\n`);
for (const [name, ok] of checks) process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}\n`);
process.stdout.write(`\nloop.md:\n${loopMd}\ncommits:\n${sh('git', ['log', '--oneline']).trim()}\n`);
const failed = checks.filter(([, ok]) => !ok).length;
process.stdout.write(`\n${checks.length - failed}/${checks.length} PASS\n`);
process.exit(failed ? 1 : 0);
