import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { board, checkpoint, claim, done, log, note, post, release, runCreate, sweep } from '../skills/memorybox/scripts/memorybox.mjs';
import { memoryboxSummary, memoryDir } from '../hooks/lib.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/memorybox/scripts/memorybox.mjs', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'adlc-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const box = () => mkdtempSync(join(TMP, 'box-'));
const ls = (dir, state) => readdirSync(join(dir, state)).filter(f => f.endsWith('.md'));

test('post → claim → done moves one file through the state folders', () => {
  const dir = box();
  const id = post(dir, { title: '로그인 API 테스트' }, '목표: 토큰 만료 경로 테스트');
  assert.deepEqual([ls(dir, 'open').length, ls(dir, 'claimed').length], [1, 0]);
  assert.equal(claim(dir, id, 'w1').claimed_by, 'w1');
  assert.deepEqual([ls(dir, 'open').length, ls(dir, 'claimed').length], [0, 1]);
  done(dir, id, 'w1', 'succeeded', '## Result\n테스트 3개 추가, 전체 통과\n## Learned\n토큰 만료는 서버 시간 기준이다\n');
  const text = readFileSync(join(dir, 'done', `${id}.md`), 'utf8');
  assert.match(text, /^outcome: succeeded$/m);
  assert.match(text, /## Ask\n\n목표: 토큰 만료 경로 테스트\n\n## Result\n\n테스트 3개 추가, 전체 통과\n\n## Learned\n\n토큰 만료는 서버 시간 기준이다/);
  assert.equal(ls(dir, 'claimed').length, 0);
});

test('only one worker wins a claim, and only the claimer can finish it', () => {
  const dir = box();
  const id = post(dir, { title: 'x' });
  claim(dir, id, 'w1');
  assert.throws(() => claim(dir, id, 'w2'), /not open/);
  assert.throws(() => done(dir, id, 'w2', 'succeeded', ''), /claimed by w1/);
  assert.throws(() => done(dir, id, 'w1', 'maybe', ''), /outcome/);
  release(dir, id);
  assert.equal(ls(dir, 'open').length, 1);
  // Two processes racing for the same item: exactly one rename succeeds.
  const results = ['a', 'b', 'c'].map(by => spawnSync(process.execPath, [SCRIPT, 'claim', id, '--by', by, '--dir', dir], { encoding: 'utf8' }).status);
  assert.deepEqual(results.sort(), [0, 1, 1]);
});

test('caps keep the board small: Ask, active items, Learned lines; long results go to artifacts', () => {
  const dir = box();
  assert.throws(() => post(dir, { title: 'x' }, 'a'.repeat(1001)), /max 1000/);
  const id = post(dir, { title: 'x' });
  claim(dir, id, 'w');
  assert.throws(() => done(dir, id, 'w', 'succeeded', '## Learned\n1\n2\n3\n4\n'), /max 3/);
  done(dir, id, 'w', 'failed', 'r'.repeat(1300));
  assert.ok(existsSync(join(dir, 'artifacts', `${id}.md`)));
  assert.match(readFileSync(join(dir, 'done', `${id}.md`), 'utf8'), /전체: artifacts\//);
  for (let i = 0; i < 49; i++) post(dir, { title: `t${i}` });
  post(dir, { title: 'last' });
  assert.throws(() => post(dir, { title: 'over' }), /max 50/);
});

test('board shows counts and stale claims; sweep hands over Learned lines and archives done items', () => {
  const dir = box();
  const a = post(dir, { title: '오래 멈춘 일' }), b = post(dir, { title: '끝난 일' });
  claim(dir, a, 'w1', new Date(Date.now() - 2 * 86400000));
  claim(dir, b, 'w2');
  done(dir, b, 'w2', 'succeeded', '## Learned\n결제 웹훅은 재시도가 3번이다\n');
  const shown = board(dir);
  assert.deepEqual([shown.open, shown.claimed, shown.stale, shown.done], [0, 1, 1, 1]);
  assert.match(readFileSync(join(dir, 'BOARD.md'), 'utf8'), /\[claimed·멈춤\]/);
  assert.deepEqual(sweep(dir, { dryRun: true }), [`${b} | 결제 웹훅은 재시도가 3번이다`]);
  assert.equal(ls(dir, 'done').length, 1);
  sweep(dir);
  assert.equal(ls(dir, 'done').length, 0);
  assert.equal(readdirSync(join(dir, 'archive')).length, 1);
});

test('SessionStart summary appears only when the memorybox has items', () => {
  const dir = box();
  assert.equal(memoryboxSummary(dir), '');
  post(dir, { title: '검색 API 조사' });
  assert.match(memoryboxSummary(dir), /^open 1 · claimed 0 · done\(정리 전\) 0[\s\S]*\[open\] .*: 검색 API 조사/);
});

test('worktrees of one repository share the memory folder, as Claude Code keys it on the main repository', () => {
  const main = realpathSync(mkdtempSync(join(TMP, 'repo-')));
  execFileSync('git', ['init', '-q'], { cwd: main });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: main });
  const wt = `${main}-wt`;
  execFileSync('git', ['worktree', 'add', '-q', wt], { cwd: main });
  const env = { CLAUDE_CONFIG_DIR: '/cfg' };
  assert.equal(memoryDir(wt, env), memoryDir(main, env));
  assert.equal(memoryDir(main, env), join('/cfg', 'projects', main.replace(/[^A-Za-z0-9]/g, '-'), 'memory'));
});

test('a run keeps the plan and an append-only protocol log the script writes at every step', () => {
  const dir = box();
  const run = runCreate(dir, 'JWT 로그인');
  assert.match(readFileSync(join(dir, 'runs', run, 'RUN.md'), 'utf8'), /^objective: JWT 로그인$/m);
  const id = post(dir, { title: '토큰 발급 API', run, role: 'coder', agent: 'claude' }, 'Target: api/auth.py');
  claim(dir, id, 'coder-claude-0');
  done(dir, id, 'coder-claude-0', 'succeeded', '## Result\nPR #42');
  const lines = log(dir, run).split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /\| run \| state active \| lead \| JWT 로그인$/);
  assert.match(lines[1], new RegExp(`\\| task ${id} \\| round 1 \\| state open \\| lead → any \\| 토큰 발급 API$`));
  assert.match(lines[2], /\| state claimed \| coder-claude-0$/);
  assert.match(lines[3], /\| state succeeded \| coder-claude-0 → lead$/);
  assert.throws(() => post(dir, { title: 'x', run: 'nope' }), /does not exist/);
});

test('dependencies block a claim until the prerequisite is done with outcome succeeded', () => {
  const dir = box();
  const plan = post(dir, { title: '계획', role: 'planner' });
  const code = post(dir, { title: '구현', role: 'coder', depends: plan });
  assert.throws(() => post(dir, { title: 'x', depends: 'missing-id' }), /does not exist/);
  assert.throws(() => claim(dir, code, 'c1'), /blocked by/);
  assert.match(board(dir).text, new RegExp(`\\[blocked: ${plan}\\]`));
  claim(dir, plan, 'p1');
  done(dir, plan, 'p1', 'failed', 'x');
  assert.throws(() => claim(dir, code, 'c1'), /blocked by/); // a failed prerequisite still blocks
  const retry = post(dir, { title: '계획 다시', role: 'planner' });
  const code2 = post(dir, { title: '구현', depends: retry });
  claim(dir, retry, 'p1');
  done(dir, retry, 'p1', 'succeeded', 'ok');
  assert.equal(claim(dir, code2, 'c1').claimed_by, 'c1');
  sweep(dir); // archived prerequisites still count
  const code3 = post(dir, { title: '테스트', depends: retry });
  assert.equal(claim(dir, code3, 'c2').claimed_by, 'c2');
});

test('the script counts rounds per role in a thread and stops the sixth: that one goes to a person', () => {
  const dir = box();
  const code = post(dir, { title: '토큰 발급 API', role: 'coder' });
  const reviews = [];
  for (let i = 1; i <= 5; i++) {
    reviews.push(post(dir, { title: `PR #42 리뷰 ${i}`, kind: 'review', role: 'reviewer', agent: 'codex', thread: code }));
    if (i < 5) post(dir, { title: `지적 반영 ${i}`, role: 'coder', thread: code });
  }
  assert.match(readFileSync(join(dir, 'open', `${reviews[4]}.md`), 'utf8'), /^round: 5$/m);
  assert.throws(() => post(dir, { title: 'PR #42 리뷰 6', kind: 'review', role: 'reviewer', thread: code }), /round 6 of reviewer .* over the limit \(5\)/);
  assert.match(board(dir).text, /\(reviewer·codex·r5\)/);
});

test('notes are shared during the run; knowledge notes reach the lead at sweep and the run closes when nothing is left', () => {
  const dir = box();
  const run = runCreate(dir, '검색 개선');
  note(dir, run, 'w1', 'knowledge', '테스트 DB는 5433 포트를 쓴다');
  note(dir, run, 'w2', 'decision', '정렬은 서버에서 한다');
  assert.throws(() => note(dir, run, 'w1', 'gossip', 'x'), /knowledge or decision/);
  assert.throws(() => note(dir, run, 'w1', 'knowledge', 'a'.repeat(301)), /max 300/);
  assert.match(log(dir, run), /note decision \| w2 \| 정렬은 서버에서 한다/); // every worker can read it mid-run
  const id = post(dir, { title: '인덱스', run });
  assert.deepEqual(sweep(dir), [`${run} | 테스트 DB는 5433 포트를 쓴다 (w1)`]);
  assert.match(readFileSync(join(dir, 'runs', run, 'RUN.md'), 'utf8'), /^status: active$/m); // still has open work
  assert.deepEqual(sweep(dir), []); // a note is handed over once
  claim(dir, id, 'w1');
  done(dir, id, 'w1', 'succeeded', 'ok');
  sweep(dir);
  assert.match(readFileSync(join(dir, 'runs', run, 'RUN.md'), 'utf8'), /^status: complete$/m);
  assert.match(log(dir, run, 1), /\| run \| state complete \| lead$/);
  // Work after the close: posting reopens the run, and a late note still reaches the lead.
  note(dir, run, 'w2', 'knowledge', '인덱스 재생성은 10분 걸린다');
  const late = post(dir, { title: '인덱스 보강', run });
  assert.match(readFileSync(join(dir, 'runs', run, 'RUN.md'), 'utf8'), /^status: active$/m);
  assert.deepEqual(sweep(dir), [`${run} | 인덱스 재생성은 10분 걸린다 (w2)`]);
  claim(dir, late, 'w1');
  done(dir, late, 'w1', 'succeeded', 'ok');
  sweep(dir);
  assert.match(readFileSync(join(dir, 'runs', run, 'RUN.md'), 'utf8'), /^status: complete$/m);
  // A run with nothing finished yet stays open.
  const fresh = runCreate(dir, '아직 시작 전');
  sweep(dir);
  assert.match(readFileSync(join(dir, 'runs', fresh, 'RUN.md'), 'utf8'), /^status: active$/m);
});

test('Learned comes only from the result, also when the brief heredoc was indented', () => {
  const dir = box();
  const id = post(dir, { title: 'x' }, '결과 형식:\n## Learned\n여기는 Ask의 예시다');
  claim(dir, id, 'w1');
  assert.throws(() => done(dir, id, 'w1', 'succeeded', '   ## Result\n   ok\n   ## Learned\n   a\n   b\n   c\n   d\n'), /4 lines \(max 3\)/);
  done(dir, id, 'w1', 'succeeded', '   ## Result\n   ok\n   ## Learned\n   린트는 ruff\n');
  assert.deepEqual(sweep(dir), [`${id} | 린트는 ruff`]);
});

test('worker names cannot leave the memorybox, and a post never overwrites an item', () => {
  const dir = box();
  const id = post(dir, { title: 'x' });
  assert.throws(() => claim(dir, id, 'orca/w1'), /plain name/);
  assert.throws(() => checkpoint(dir, '../w1', 'x'), /plain name/);
  const now = new Date('2026-10-28T00:00:00Z'); // same minute: IDs differ only in their random part
  for (let i = 0; i < 49; i++) post(dir, { title: `t${i}` }, '', now);
  assert.equal(ls(dir, 'open').length, 50); // a colliding ID is retried, never written over another item
});

test('a worker checkpoint records what it holds so a restarted worker can resume', () => {
  const dir = box();
  const id = post(dir, { title: 'x' });
  claim(dir, id, 'coder-codex-0');
  checkpoint(dir, 'coder-codex-0', '브랜치 feat/x, 테스트 2개 남음');
  const text = readFileSync(join(dir, 'workers', 'coder-codex-0.md'), 'utf8');
  assert.match(text, new RegExp(`^items: ${id}$`, 'm'));
  assert.match(text, /테스트 2개 남음/);
  assert.throws(() => checkpoint(dir, 'w', 'a'.repeat(801)), /max 800/);
});

test('the CLI accepts the run flow end to end', () => {
  const dir = box();
  const cli = (args, input = '') => spawnSync(process.execPath, [SCRIPT, ...args, '--dir', dir], { encoding: 'utf8', input });
  const run = cli(['run-create', '--objective', '목표']).stdout.trim();
  const id = cli(['post', '--title', '일', '--run', run, '--role', 'coder'], 'Target: a').stdout.trim();
  assert.equal(cli(['claim', id, '--by', 'w']).status, 0);
  assert.equal(cli(['note', '--run', run, '--by', 'w', '--type', 'knowledge'], '빌드는 make check').status, 0);
  assert.equal(cli(['done', id, '--by', 'w', '--outcome', 'succeeded'], '## Result\nok\n## Learned\n린트는 ruff\n').status, 0);
  assert.equal(cli(['sweep']).stdout.trim().split('\n').length, 2);
  assert.equal(cli(['post']).status, 1); // missing title is a clear error, not a crash
  assert.match(cli(['post']).stderr, /--title is required/);
  // Run through a symlinked path (macOS /var → /private/var, a linked plugin cache): still the CLI, not a silent no-op.
  const link = join(box(), 'memorybox.mjs');
  symlinkSync(SCRIPT, link);
  assert.match(spawnSync(process.execPath, [link, 'path', '--dir', dir], { encoding: 'utf8' }).stdout, /adlc-test-.*box-/);
});

