// Live check on real hosts. A copy of this working tree, with one trace line added to its hooks, is installed into throwaway
// homes (Codex CODEX_HOME, Copilot COPILOT_HOME; Claude Code via --plugin-dir with only project and local settings), so every
// hook call lands in <work>/trace.jsonl: the host, the input it gave the hook, and what the hook printed back.
// Logins: Codex copies ~/.codex/auth.json into its throwaway home (deleted at the end); Copilot copies its login list
// (config.json, no token) and reads the token from the keychain. Claude Code still writes its transcripts under ~/.claude.
// Spends real model usage, so it is not part of npm test.
//   node test/e2e/hosts.mjs [claude] [codex] [copilot]
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const WORK = mkdtempSync(join(tmpdir(), 'adlc-hosts-'));
const PLUGIN = join(WORK, 'plugin'), TRACE = join(WORK, 'trace.jsonl');
const RUNG = 'Can this be one line? Make it one line.'; // 6th rung of hooks/ponytail.md
const results = [];
const check = (host, name, ok, detail = '') => { results.push(ok); process.stdout.write(`${ok ? 'PASS' : 'FAIL'} [${host}] ${name}${detail ? ` — ${detail}` : ''}\n`); };
const note = (host, text) => process.stdout.write(`NOTE [${host}] ${text}\n`);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// A fresh terminal's environment: nothing inherited from a Claude Code session this script may run inside.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PLUGIN_|CLAUDE_PROJECT_DIR|CLAUDE_ENV_FILE|PLUGIN_|COPILOT_CLI)/.test(k)));

// readInput in the copy appends {hook, host flags, input}; whatever the hook then prints is appended as {hook, out}.
function tracedCopy() {
  cpSync(REPO, PLUGIN, { recursive: true, filter: src => !/[\\/](\.git|node_modules|test)$/.test(src) });
  const lib = join(PLUGIN, 'hooks', 'lib.mjs'), parse = "try { return JSON.parse(raw || '{}'); } catch { return {}; }";
  const text = readFileSync(lib, 'utf8');
  if (!text.includes(parse)) throw new Error('readInput in hooks/lib.mjs changed: update tracedCopy in test/e2e/hosts.mjs');
  writeFileSync(lib, text.replace(parse, "let input = {};\n  try { input = JSON.parse(raw || '{}'); } catch {}\n  trace(input);\n  return input;") + `
import { appendFileSync as appendTrace } from 'node:fs';
function trace(input) {
  const hook = globalThis.adlcHook, e = process.env, line = o => appendTrace(${JSON.stringify(TRACE)}, JSON.stringify(o) + '\\n');
  const short = JSON.parse(JSON.stringify(input, (k, v) => typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v));
  line({ hook, env: Object.fromEntries(['CLAUDE_PLUGIN_ROOT', 'PLUGIN_ROOT', 'COPILOT_PLUGIN_ROOT', 'COPILOT_CLI', 'CLAUDE_PROJECT_DIR'].map(k => [k, e[k] ? (k === 'COPILOT_CLI' ? e[k] : 'set') : ''])), input: short });
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s, ...rest) => { line({ hook, out: String(s) }); return write(s, ...rest); };
}
`);
  for (const [file, hook] of [['session-start.mjs', 'session-start'], ['frontend-check.mjs', 'frontend-check']]) {
    const path = join(PLUGIN, 'hooks', file);
    writeFileSync(path, `globalThis.adlcHook = '${hook}';\n` + readFileSync(path, 'utf8'));
  }
}
const traces = () => { try { return readFileSync(TRACE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const field = (input, ...keys) => keys.map(k => input?.[k]).find(v => v !== undefined);
const outText = o => { try { const j = JSON.parse(o.out); return j.hookSpecificOutput?.additionalContext ?? j.additionalContext ?? ''; } catch { return ''; } };

// A repository whose memory lives inside it (autoMemoryDirectory): a handoff, an indexed memo, a promotion candidate, one open memorybox item.
function project(name) {
  const dir = join(WORK, name), mem = join(dir, '.agents', 'memory');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  mkdirSync(mem, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: mem }));
  writeFileSync(join(mem, 'handoff.md'), '---\nname: handoff\nmetadata:\n  type: project\n---\n\n- 지금: 펭귄 결제 재시도\n');
  writeFileSync(join(mem, 'code.md'), '---\nname: code\nmetadata:\n  type: project\n  hits: 2\n---\n\n이 저장소의 암호 단어는 ZEBRA42다\n');
  writeFileSync(join(mem, 'MEMORY.md'), '## Project\n- [암호 단어](code.md) — 이 저장소의 암호 단어는 ZEBRA42다\n');
  execFileSync('node', [join(PLUGIN, 'skills', 'memorybox', 'scripts', 'memorybox.mjs'), 'post', '--title', '수달 영수증 검증'],
    { env: { ...ENV, MEMORYBOX: join(mem, 'memorybox') }, input: 'Target: receipts\nObservable acceptance: npm test passes\n' });
  return dir;
}

const PROBE = `답만 네 줄로 적어. 도구는 쓰지 마.
1) 지금 맥락(시스템 메시지·지시문·hook 컨텍스트)에 'lazy senior developer' 규칙의 번호 목록이 있으면 6번째 항목 문장을 원문 그대로, 없으면 NONE.
2) '# 인계' 절이 있으면 그 '지금:' 줄을 원문 그대로, 없으면 NONE.
3) 메모리 색인에 이 저장소의 암호 단어가 있으면 그 단어, 없으면 NONE.
4) '# 메모리박스' 절에 open 항목이 있으면 그 제목, 없으면 NONE.`;

// Each host: start(cwd, prompt, {write}) and resume(cwd, id, prompt) return { text, id }; compact and clear only where reachable.
const hosts = {
  claude() {
    const base = ['--plugin-dir', PLUGIN, '--setting-sources', 'project,local', '--model', 'haiku'];
    const call = (cwd, args) => {
      const r = spawnSync('claude', [...args, ...base, '--output-format', 'json'], { cwd, env: ENV, input: '', encoding: 'utf8', timeout: 300000 });
      try { const j = JSON.parse(r.stdout); return { text: String(j.result ?? ''), id: j.session_id }; } catch { return { text: r.stdout ?? '', id: '' }; }
    };
    return {
      start: (cwd, prompt, { write } = {}) => call(cwd, ['-p', prompt, ...(write ? ['--permission-mode', 'acceptEdits', '--allowedTools', 'Write'] : [])]),
      resume: (cwd, id, prompt) => call(cwd, ['-p', prompt, '--resume', id]),
      compact: (cwd, id) => call(cwd, ['-p', '/compact', '--resume', id]),
      // /clear only exists in the interactive UI: drive one in tmux. Trusting the throwaway folder adds it to ~/.claude.json.
      clear(cwd) {
        const s = `adlc-${process.pid}`, screen = () => spawnSync('tmux', ['capture-pane', '-p', '-t', s], { encoding: 'utf8' }).stdout ?? '';
        const keys = (...k) => spawnSync('tmux', ['send-keys', '-t', s, ...k]);
        const until = (ok, ms = 60000) => { for (const end = Date.now() + ms; Date.now() < end; sleep(1000)) if (ok()) return true; return false; };
        const shell = [['env', ...Object.keys(process.env).filter(k => !(k in ENV)).flatMap(k => ['-u', k])], ['claude', ...base]].flat().map(a => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
        execFileSync('tmux', ['new-session', '-d', '-s', s, '-x', '200', '-y', '50', '-c', cwd, shell]);
        try {
          const before = traces().length;
          // The trust prompt defaults to "No, exit": move to "Yes, I trust this folder" first.
          until(() => { if (/Yes, I trust this folder/.test(screen())) { keys('Down'); sleep(300); keys('Enter'); } return traces().slice(before).some(t => t.hook === 'session-start' && t.input); });
          sleep(3000);
          const mark = traces().length;
          keys('/clear'); sleep(800); keys('Enter');
          until(() => traces().slice(mark).some(t => t.hook === 'session-start' && t.input));
          return traces().slice(before);
        } finally { spawnSync('tmux', ['kill-session', '-t', s]); }
      },
    };
  },
  codex() {
    const home = join(WORK, 'codex-home');
    mkdirSync(home, { mode: 0o700 });
    copyFileSync(join(homedir(), '.codex', 'auth.json'), join(home, 'auth.json'));
    const env = { ...ENV, CODEX_HOME: home };
    for (const a of [['plugin', 'marketplace', 'add', PLUGIN], ['plugin', 'add', 'adlc-harness@adlc-harness']]) execFileSync('codex', a, { env, stdio: 'ignore' });
    const call = (cwd, args) => {
      const r = spawnSync('codex', args, { cwd, env, input: '', encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
      const events = (r.stdout ?? '').split('\n').map(l => { try { return JSON.parse(l); } catch { return {}; } });
      return { text: events.filter(m => m.type === 'item.completed' && m.item?.type === 'agent_message').map(m => m.item.text).join('\n'),
        id: events.find(m => m.type === 'thread.started')?.thread_id ?? '' };
    };
    const common = ['--json', '--dangerously-bypass-hook-trust', '--skip-git-repo-check'];
    return {
      start: (cwd, prompt, { write } = {}) => call(cwd, ['exec', ...common, '-s', write ? 'workspace-write' : 'read-only', prompt]),
      resume: (cwd, id, prompt) => call(cwd, ['exec', 'resume', ...common, id, prompt]),
    };
  },
  copilot() {
    const home = join(WORK, 'copilot-home');
    mkdirSync(home);
    copyFileSync(join(homedir(), '.copilot', 'config.json'), join(home, 'config.json'));
    const env = { ...ENV, COPILOT_HOME: home, COPILOT_AUTO_UPDATE: 'false' };
    for (const a of [['plugin', 'marketplace', 'add', PLUGIN], ['plugin', 'install', 'adlc-harness@adlc-harness']]) execFileSync('copilot', a, { env, stdio: 'ignore' });
    const call = (cwd, args) => {
      const r = spawnSync('copilot', [...args, '--allow-all-tools', '--allow-all-paths', '-s'], { cwd, env, input: '', encoding: 'utf8', timeout: 600000 });
      const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      if (/To authenticate/.test(text)) throw new Error('Copilot CLI is not logged in: run `copilot` and /login first');
      return { text, id: 'last' };
    };
    return {
      start: (cwd, prompt) => call(cwd, ['-p', prompt]),
      resume: (cwd, _id, prompt) => call(cwd, ['-p', prompt, '--continue']),
    };
  },
};

function sessionStarts(host, list, source) {
  const ins = list.filter(t => t.hook === 'session-start' && t.input);
  return { ins, of: ins.filter(t => field(t.input, 'source') === source) };
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(hosts);
tracedCopy();
try {
  for (const name of want) {
    process.stdout.write(`\n== ${name}\n`);
    let host;
    try { host = hosts[name](); } catch (e) { check(name, '설치', false, e.message); continue; }
    const dir = project(name);
    try {
      // 1. startup: what the hook gave the host, then whether the model actually sees it.
      let from = traces().length;
      const first = host.start(dir, PROBE);
      const startup = traces().slice(from);
      const ss = sessionStarts(name, startup, 'startup');
      check(name, 'SessionStart(startup) 1회 실행', ss.ins.length === 1 && ss.of.length === 1,
        `호출 ${ss.ins.length}회, source=${ss.ins.map(t => field(t.input, 'source')).join(',')}, env=${JSON.stringify(ss.ins[0]?.env)}`);
      const given = outText(startup.find(t => t.hook === 'session-start' && t.out) ?? {});
      check(name, 'hook 출력: 고정 문맥·인계·점검·메모리박스', given.includes(RUNG) && given.includes('# 인계') && given.includes('승격 후보 1개') && given.includes('수달 영수증 검증'),
        `${given.length}자`);
      check(name, `hook 출력: 색인 ${name === 'claude' ? '없음(Claude가 직접 읽음)' : '포함'}`, given.includes('# 메모리 색인') === (name !== 'claude'));
      // The model may quote only part of the rung; "Make it one line" exists only in hooks/ponytail.md.
      check(name, '모델이 Ponytail을 봄', first.text.includes('Make it one line'), first.text.split('\n')[0]?.slice(0, 80));
      check(name, '모델이 인계를 봄', first.text.includes('펭귄 결제 재시도'));
      check(name, '모델이 MEMORY.md 색인을 봄', first.text.includes('ZEBRA42'));
      check(name, '모델이 메모리박스를 봄', first.text.includes('수달 영수증 검증'));

      // 2. resume (and compact where a non-interactive host can trigger it).
      from = traces().length;
      host.resume(dir, first.id, 'OK만 답해. 도구는 쓰지 마.');
      const rs = sessionStarts(name, traces().slice(from), 'resume');
      check(name, 'SessionStart(resume)', rs.of.length === 1, `호출 ${rs.ins.length}회, source=${rs.ins.map(t => field(t.input, 'source')).join(',')}`);
      if (host.compact) {
        from = traces().length;
        host.compact(dir, first.id);
        const cs = sessionStarts(name, traces().slice(from), 'compact');
        check(name, 'SessionStart(compact)', cs.of.length === 1, `호출 ${cs.ins.length}회, source=${cs.ins.map(t => field(t.input, 'source')).join(',')}`);
      }
      if (host.clear) {
        const cl = sessionStarts(name, host.clear(dir), 'clear');
        check(name, 'SessionStart(clear, 대화형)', cl.of.length === 1, `source=${cl.ins.map(t => field(t.input, 'source')).join(',')}`);
      }

      // 3. One run writes a non-UI file and a UI file: the `if` must keep the PreToolUse hook to the UI file.
      from = traces().length;
      host.start(dir, 'notes.md 파일을 만들어 내용으로 memo 한 줄을 쓰고, 그다음 app.tsx 파일을 만들어 내용으로 export default function A(){return null} 한 줄을 써. 다른 파일은 만들지 마. 한 문장으로 답해.', { write: true });
      const pre = traces().slice(from).filter(t => t.hook === 'frontend-check' && t.input);
      const files = pre.map(t => JSON.stringify(field(t.input, 'tool_input', 'toolArgs') ?? '').match(/[\w.-]+\.(tsx|md)/)?.[0] ?? '?');
      const made = ['notes.md', 'app.tsx'].filter(f => existsSync(join(dir, f)));
      if (name === 'claude') {
        check(name, 'PreToolUse: UI 파일에서만 1회(if 필터)', pre.length === 1 && files[0] === 'app.tsx', `호출 ${pre.length}회 [${files}], 생성 [${made}]`);
        const asked = traces().slice(from).some(t => t.hook === 'frontend-check' && t.out?.includes('IMPECCABLE_HOOK_DISABLED'));
        note(name, `impeccable 질문 출력 ${asked ? '있음' : '없음(impeccable 미설치이거나 이미 결정)'}`);
      } else {
        // Not a Claude-only feature by design, but the budget still holds: never one call per edit of any file.
        check(name, 'PreToolUse가 UI 아닌 파일에서 돌지 않음', !files.includes('notes.md'), `호출 ${pre.length}회 [${files}], 생성 [${made}]`);
      }
      const skills = host.start(dir, '사용할 수 있는 스킬 목록에 이름이 memorybox(접두사가 붙어도 됨)인 스킬이 있으면 YES, 없으면 NO만 적어. 도구는 쓰지 마.');
      check(name, '스킬 목록에 memorybox', /YES/.test(skills.text), skills.text.slice(0, 60));
    } catch (e) { check(name, '실행', false, e.message); }
  }
} finally {
  rmSync(join(WORK, 'codex-home', 'auth.json'), { force: true }); // never leave a copied login behind
}
const failed = results.filter(ok => !ok).length;
process.stdout.write(`\n${results.length - failed}/${results.length} PASS (trace: ${TRACE})\n`);
process.exit(failed ? 1 : 0);
