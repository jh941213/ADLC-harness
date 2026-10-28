import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
// Every temp folder (and the impeccable once-per-session marks) lives under one root that is removed after the run.
const TMP = mkdtempSync(join(tmpdir(), 'adlc-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const json = rel => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));
const HOOKS = json('hooks/hooks.json').hooks;
const SKILLS = readdirSync(join(REPO, 'skills'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);

// The plugin variables each host gives its hooks (measured on Claude Code 2.1, Codex 0.163; Copilot from its 1.0.26 changelog).
const CODEX = { PLUGIN_ROOT: REPO };
const COPILOT = { PLUGIN_ROOT: REPO, COPILOT_PLUGIN_ROOT: REPO, COPILOT_CLI: '1' };

// Runs the hook exactly as hooks.json registers it, the way a host does: through a shell, with the plugin root in the environment.
// CLAUDE_CONFIG_DIR points at a temp folder so the real ~/.claude is never read.
function sessionStart(cwd, config, env = {}) {
  const { command } = HOOKS.SessionStart[0].hooks[0];
  const r = spawnSync(command, { shell: true, input: JSON.stringify({ cwd }), encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: REPO, PLUGIN_ROOT: '', COPILOT_PLUGIN_ROOT: '', COPILOT_CLI: '',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '', CLAUDE_CODE_PROJECT_DIR_NAME: '', ...env } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const context = out => out.hookSpecificOutput?.additionalContext ?? out.additionalContext;

function repoWithMemory() {
  const root = mkdtempSync(join(TMP, 'p-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const config = mkdtempSync(join(TMP, 'config-'));
  const dir = join(config, 'projects', realpathSync(root).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'handoff.md'), '---\nname: handoff\nmetadata:\n  type: project\n---\n\n- 지금: 로그인 API\n- 다음: 토큰 갱신\n');
  writeFileSync(join(dir, 'redis-port.md'), '---\nname: redis-port\nmetadata:\n  type: project\n  hits: 2\n---\n\n테스트 Redis는 6380\n');
  writeFileSync(join(dir, 'MEMORY.md'), ['## 진행 중', '- [handoff](handoff.md) — 로그인 API', ...Array.from({ length: 300 }, (_, i) => `- [메모 ${i + 1}](m${i + 1}.md) — 줄 ${i + 1}`)].join('\n') + '\n');
  return { root: realpathSync(root), config, dir };
}

test('hooks: SessionStart for every session, and PreToolUse only behind an `if` on UI files', () => {
  assert.deepEqual(Object.keys(HOOKS), ['SessionStart', 'PreToolUse']);
  assert.equal(HOOKS.SessionStart[0].matcher, 'startup|resume|clear|compact');
  // Governance: no per-tool hook may spawn for every call; `if` keeps it to UI file edits.
  for (const h of HOOKS.PreToolUse.flatMap(g => g.hooks)) assert.match(h.if ?? '', /^(Edit|Write)\(\*\*\/\*\.(tsx|jsx|vue|svelte|css|html)\)$/);
});

function frontendCheck(cwd, config, session = 's1', file = 'app.tsx') {
  const { command } = HOOKS.PreToolUse[0].hooks[0];
  const r = spawnSync(command, { shell: true, encoding: 'utf8',
    input: JSON.stringify({ cwd, session_id: session, tool_name: 'Write', tool_input: { file_path: join(cwd, file) } }),
    env: { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_ROOT: REPO, PLUGIN_ROOT: '', HOME: config, TMPDIR: TMP } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

test('the impeccable question comes once per session, only while the project has not decided and impeccable is installed', () => {
  const cwd = mkdtempSync(join(TMP, 'p-')), config = mkdtempSync(join(TMP, 'config-'));
  assert.equal(frontendCheck(cwd, config), null); // not installed
  mkdirSync(join(config, 'plugins'));
  writeFileSync(join(config, 'plugins', 'installed_plugins.json'), '{"plugins":{"impeccable@impeccable":[]}}');
  assert.equal(frontendCheck(cwd, config, 's0', 'notes.md'), null); // a host that ignores `if` still gets nothing for other files
  const first = frontendCheck(cwd, config);
  assert.equal(first.hookEventName, 'PreToolUse');
  assert.equal(first.permissionDecision, undefined); // never blocks the edit
  assert.match(first.additionalContext, /IMPECCABLE_HOOK_DISABLED/);
  assert.equal(frontendCheck(cwd, config), null); // once per session
  assert.ok(frontendCheck(cwd, config, 's2'));
  mkdirSync(join(cwd, '.claude'));
  writeFileSync(join(cwd, '.claude', 'settings.local.json'), JSON.stringify({ env: { IMPECCABLE_HOOK_DISABLED: '0' } }));
  assert.equal(frontendCheck(cwd, config, 's3'), null); // decided
});

test('without memory files SessionStart gives the fixed rules and where the memory lives', () => {
  const cwd = mkdtempSync(join(TMP, 'p-')), config = mkdtempSync(join(TMP, 'config-'));
  const text = context(sessionStart(cwd, config));
  assert.ok(text.startsWith(readFileSync(join(REPO, 'hooks', 'ponytail.md'), 'utf8').trim()));
  assert.match(text, /# 메모리/);
  assert.match(text, /메모리 폴더: .*\/projects\/.*\/memory/);
  assert.doesNotMatch(text, /# 인계|# 메모리 색인|# 메모리 점검/);
});

test('Claude gets the handoff and the nudges but not the index it already loads; Codex and Copilot also get the index', () => {
  const { root, config, dir } = repoWithMemory();
  mkdirSync(join(root, 'src'));
  // A subfolder session still finds the repository's memory.
  const claude = context(sessionStart(join(root, 'src'), config));
  assert.ok(claude.includes(`메모리 폴더: ${dir}`));
  assert.match(claude, /# 인계 \(handoff\.md\)\n\n- 지금: 로그인 API\n- 다음: 토큰 갱신/);
  assert.doesNotMatch(claude, /name: handoff/);
  assert.doesNotMatch(claude, /# 메모리 색인/);
  assert.match(claude, /MEMORY\.md가 302줄/);
  assert.match(claude, /승격 후보 1개\(hits 2 이상: redis-port\.md\)/);
  // Claude with auto memory off needs the index too.
  assert.match(context(sessionStart(root, config, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' })), /# 메모리 색인/);

  const codex = context(sessionStart(root, config, CODEX));
  assert.match(codex, /# 메모리 색인 \(MEMORY\.md\)\n\n## 진행 중/);
  assert.match(codex, /메모 198\]/);
  assert.doesNotMatch(codex, /메모 199\]/); // Claude Code's own limit: the first 200 lines
  const copilot = sessionStart(root, config, COPILOT);
  assert.equal(copilot.hookSpecificOutput, undefined);
  assert.equal(copilot.additionalContext, codex);
  // A Claude worker started from a Copilot shell inherits COPILOT_CLI=1 and is still Claude.
  assert.doesNotMatch(context(sessionStart(root, config, { COPILOT_CLI: '1' })), /# 메모리 색인/);
  assert.ok(codex.length <= 16000, `SessionStart injects ${codex.length} chars`);
});

test('autoMemoryDirectory moves the store for every host, as it does for Claude Code', () => {
  const { root, config } = repoWithMemory();
  mkdirSync(join(root, '.claude'));
  // Claude Code takes only an absolute or ~/ path; a relative one is ignored, so the default folder stays.
  writeFileSync(join(root, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: '.agents/memory' }));
  assert.match(context(sessionStart(root, config, CODEX)), /로그인 API/);
  writeFileSync(join(root, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: join(root, '.agents', 'memory') }));
  mkdirSync(join(root, '.agents', 'memory'), { recursive: true });
  writeFileSync(join(root, '.agents', 'memory', 'handoff.md'), '- 지금: 저장소 안 메모리\n');
  const text = context(sessionStart(root, config, CODEX));
  assert.ok(text.includes(`메모리 폴더: ${join(root, '.agents', 'memory')}`));
  assert.match(text, /- 지금: 저장소 안 메모리/);
  assert.doesNotMatch(text, /로그인 API/);
});

test('project folder names follow Claude Code, including the hash past 200 chars', async () => {
  const { projectKey } = await import('../hooks/lib.mjs');
  assert.equal(projectKey('/Users/me/my-app'), '-Users-me-my-app');
  const long = `/Users/me/${'a'.repeat(250)}`;
  // Claude Code 2.1: key.slice(0, 200) + '-' + Math.abs(31-based string hash of the path).toString(36)
  let h = 0;
  for (const c of long) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  assert.equal(projectKey(long), `${long.replace(/[^A-Za-z0-9]/g, '-').slice(0, 200)}-${Math.abs(h).toString(36)}`);
});

test('the fixed session context and the skill list stay inside their budgets', () => {
  const fixed = ['ponytail.md', 'context.md'].map(f => readFileSync(join(REPO, 'hooks', f), 'utf8').trim()).join('\n\n');
  assert.ok(fixed.length <= 4000, `fixed context is ${fixed.length} chars`);
  // Codex budgets the skill list at 8,000 chars; Claude Code cuts a skill at 20,000 chars after compaction.
  let descriptions = 0;
  for (const s of SKILLS) {
    const md = readFileSync(join(REPO, 'skills', s, 'SKILL.md'), 'utf8');
    assert.match(md, new RegExp(`^---\\r?\\nname: ${s}\\r?\\n`), s);
    assert.ok(md.length < 20000, `${s}/SKILL.md is ${md.length} chars`);
    descriptions += md.match(/^description:\s*([\s\S]*?)(?=^\w[\w-]*:|^---)/m)[1].trim().length;
  }
  assert.ok(descriptions <= 7000, `skill descriptions total ${descriptions} chars`);
});

test('every skill a rule or another skill names is bundled', () => {
  const texts = [readFileSync(join(REPO, 'hooks', 'context.md'), 'utf8'),
    ...SKILLS.map(s => readFileSync(join(REPO, 'skills', s, 'SKILL.md'), 'utf8'))].join('\n');
  for (const name of ['brainstorming', 'writing-plans', 'systematic-debugging', 'test-driven-development', 'verification-before-completion', 'memory', 'scaffold', 'loopeng', 'harness-guide']) {
    assert.ok(SKILLS.includes(name), name);
  }
  assert.doesNotMatch(texts, /kode-|kds-design|bmad-|e2e-doc|codex-review/);
  assert.ok(existsSync(join(REPO, 'agents', 'evaluator.md')));
});

test('numbered acceptance criteria and the approval line run from spec through plan to the evaluator', () => {
  const read = rel => readFileSync(join(REPO, rel), 'utf8');
  assert.match(read('skills/brainstorming/SKILL.md'), /## 수용 기준`: R1, R2…[\s\S]*`승인: YYYY-MM-DD`/);
  assert.match(read('skills/writing-plans/SKILL.md'), /수용 기준 번호\(R1…\)[\s\S]*`승인:` 날짜가 없는 plan은 실행하지 않는다/);
  assert.match(read('agents/evaluator.md'), /`## 수용 기준`\(R1…\)마다 충족·미충족·미검증/);
});

test('project AGENTS.md templates point at harness-guide, and the guide covers flow, subagents, memory and docs', () => {
  const read = rel => readFileSync(join(REPO, rel), 'utf8');
  assert.match(read('skills/scaffold/SKILL.md'), /## 하네스 가이드\n.*`harness-guide`/);
  assert.match(read('skills/memory/SKILL.md'), /`## 하네스 가이드` 절/);
  const guide = read('skills/harness-guide/SKILL.md');
  for (const part of ['## 2. SDLC 단계와 문서', '## 3. 서브에이전트', '## 4. 메모리', '## 5. 문서']) assert.ok(guide.includes(part), part);
  assert.match(read('skills/loopeng/SKILL.md'), /`harness-guide`에 있다/);
});

test('credits live only in skills/NOTICE.md', () => {
  const files = readdirSync(REPO, { recursive: true }).filter(f => !/^(\.git|node_modules|test)([\\/]|$)/.test(f) && f !== join('skills', 'NOTICE.md'));
  const credit = /superpowers|prime ?radiant|obra\/|wshobson|jesse vincent|dietrichgebert|adapted from|inspired by|claude\.(dev|com)\/blog|anthropic\.com\/engineering|Anthropic(식| Claude Code 팀)|codeband|band-ai|토스 Security|kode-harness|참고했|옮겼다|^\s*(#|\/\/|>)?\s*출처:/im;
  for (const f of files) {
    let text = '';
    try { text = readFileSync(join(REPO, f), 'utf8'); } catch { continue; } // folders
    assert.doesNotMatch(text, credit, f);
    assert.doesNotMatch(text, /\bKT\b/, f); // case-sensitive: `.kt` file names are fine
  }
});

test('the three hosts read one name, one version and the same skills and hooks', () => {
  const pkg = json('package.json'), claude = json('.claude-plugin/plugin.json'), codex = json('.codex-plugin/plugin.json');
  for (const m of [claude, codex, json('.claude-plugin/marketplace.json').plugins[0]]) {
    assert.equal(m.name, 'adlc-harness');
    assert.equal(m.version, pkg.version);
  }
  assert.equal(claude.skills, './skills/');
  assert.equal(codex.skills, './skills/');
  assert.equal(codex.hooks, './hooks/hooks.json');
  assert.deepEqual(json('.agents/plugins/marketplace.json').plugins[0].source, { source: 'local', path: './' });
  // RTK must not rewrite (and so auto-allow) commands that write or reach outside the machine.
  const rtk = readFileSync(join(REPO, 'rtk', 'rtk-config.toml'), 'utf8');
  for (const c of ['git push', 'git commit', 'git branch', 'gh']) assert.ok(rtk.includes(`"${c}"`), c);
});
