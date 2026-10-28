#!/usr/bin/env node
// Memorybox: a file-based work board and team memory shared by a lead and its workers
// (subagents, teammates, Orca workers, other hosts). Content lives in item files; protocol state lives in the
// folder an item sits in plus an append-only run log this script writes itself, so the rules hold without
// relying on prompts. Claim is one atomic rename.
//   node memorybox.mjs <command> [args]   (body text comes from stdin)
// The memorybox lives in <memory dir>/memorybox unless --dir or MEMORYBOX says otherwise.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryDir, rootOf } from '../../../hooks/lib.mjs';

const STATES = ['open', 'claimed', 'done'];
const LIMITS = { active: 50, ask: 1000, result: 1200, learned: 3, note: 300, checkpoint: 800, rounds: 5, board: 40 };
const DAY = 24 * 60 * 60 * 1000;

export function memoryboxDir(env = process.env, cwd = process.cwd()) {
  return env.MEMORYBOX ? resolve(env.MEMORYBOX) : join(memoryDir(rootOf({ cwd }), env), 'memorybox');
}

const fail = message => { const e = new Error(message); e.code = 'MEMORYBOX'; throw e; };
const list = dir => { try { return readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch { return []; } };
const months = dir => { try { return readdirSync(join(dir, 'archive')).filter(n => /^\d{4}-\d{2}$/.test(n)); } catch { return []; } };
const runIds = dir => { try { return readdirSync(join(dir, 'runs')).filter(id => existsSync(join(dir, 'runs', id, 'RUN.md'))); } catch { return []; } };
const oneLine = s => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
const flag = v => (v === true ? '' : v ?? '');
// Worker names become file names (workers/<name>.md): no path separators.
const name = by => { if (!/^[\w.-]+$/.test(by ?? '')) fail(`--by must be a plain name (letters, digits, . _ -), got "${by ?? ''}"`); return by; };
// Text from a heredoc pasted out of an indented brief: drop the common indentation so headings still match.
const dedent = text => { const n = Math.min(...text.split('\n').filter(l => l.trim()).map(l => l.match(/^ */)[0].length)); return text.split('\n').map(l => l.slice(Math.min(n, l.match(/^ */)[0].length))).join('\n'); };
const newId = now => `${now.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-')}-${randomBytes(2).toString('hex')}`;

export function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = Object.fromEntries(m[1].split('\n').map(l => l.match(/^(\w+):\s*(.*)$/)).filter(Boolean).map(x => [x[1], x[2]]));
  return { meta, body: m[2].trim() };
}
const format = ({ meta, body }) => `---\n${Object.entries(meta).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n\n${body.trim()}\n`;
const readItem = file => parse(readFileSync(file, 'utf8'));

// Write to a temp file in the same tree, then rename: readers never see half a file.
function writeAtomic(dir, file, text) {
  const tmp = join(dir, `.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// Same, for a file that must not exist yet: link fails instead of overwriting (an ID collision stays an error).
function createAtomic(dir, file, text) {
  const tmp = join(dir, `.tmp-${process.pid}-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, text);
  try { linkSync(tmp, file); } finally { unlinkSync(tmp); }
}

function find(dir, id) {
  for (const state of STATES) if (existsSync(join(dir, state, `${id}.md`))) return { state, file: join(dir, state, `${id}.md`) };
  for (const month of months(dir)) if (existsSync(join(dir, 'archive', month, `${id}.md`))) return { state: 'archived', file: join(dir, 'archive', month, `${id}.md`) };
  return null;
}

export function init(dir) {
  for (const sub of [...STATES, 'artifacts', 'archive', 'runs', 'workers']) mkdirSync(join(dir, sub), { recursive: true });
  return dir;
}

// One line per protocol step, appended (O_APPEND keeps short lines whole across processes).
function envelope(dir, run, fields, now = new Date()) {
  if (!run) return;
  mkdirSync(join(dir, 'runs', run), { recursive: true });
  appendFileSync(join(dir, 'runs', run, 'log.md'), `- ${now.toISOString().slice(0, 16)} | ${fields.map(oneLine).join(' | ')}\n`);
}

export function runCreate(dir, objective, now = new Date()) {
  init(dir);
  if (!objective) fail('--objective is required');
  const id = newId(now);
  mkdirSync(join(dir, 'runs', id));
  writeAtomic(dir, join(dir, 'runs', id, 'RUN.md'), format({ meta: { id, objective: oneLine(objective), status: 'active', created: now.toISOString() },
    body: '## Plan\n\n<!-- 리드가 하위 작업(항목 ID·역할·의존)과 짝(코더↔리뷰어 모델)을 적는다 -->\n\n## Decisions\n\n<!-- 중요한 결정은 note --type decision으로 log에 남기고, 오래 갈 것은 docs로 옮긴다 -->' }));
  envelope(dir, id, ['run', 'state active', 'lead', objective], now);
  return id;
}

const succeeded = (dir, id) => { const f = find(dir, id); return Boolean(f) && ['done', 'archived'].includes(f.state) && readItem(f.file).meta.outcome === 'succeeded'; };
const blockers = (dir, meta) => (meta.depends || '').split(',').filter(Boolean).filter(d => !succeeded(dir, d));

// Every item in a thread, wherever it sits now.
function threadItems(dir, thread) {
  const files = [...STATES.flatMap(state => list(join(dir, state)).map(f => join(dir, state, f))),
    ...months(dir).flatMap(m => list(join(dir, 'archive', m)).map(f => join(dir, 'archive', m, f)))];
  return files.map(f => readItem(f).meta).filter(m => m.thread === thread);
}

// The round is counted, not passed in: the Nth item of the same role in a thread is round N.
export function post(dir, { kind = 'task', to = 'any', from = 'lead', title, thread = '', ref = '', expires = 7, run = '', role = '', agent = '', depends = '' } = {}, ask = '', now = new Date()) {
  init(dir);
  if (!title) fail('--title is required');
  if (ask.length > LIMITS.ask) fail(`Ask is ${ask.length} chars (max ${LIMITS.ask}). Put the detail in a file and reference it.`);
  const round = thread ? threadItems(dir, thread).filter(m => (m.role ?? '') === role).length + 1 : 1;
  if (round > LIMITS.rounds) fail(`round ${round} of ${role || 'this role'} in thread ${thread} is over the limit (${LIMITS.rounds}). Stop iterating and escalate to the user with what is still failing.`);
  if (run && !existsSync(join(dir, 'runs', run, 'RUN.md'))) fail(`run ${run} does not exist (run-create first)`);
  const deps = String(depends || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const d of deps) if (!find(dir, d)) fail(`depends on ${d}, which does not exist`);
  const active = list(join(dir, 'open')).length + list(join(dir, 'claimed')).length;
  if (active >= LIMITS.active) fail(`${active} items are open or claimed (max ${LIMITS.active}). Finish or release some first.`);
  if (run) {
    const runFile = join(dir, 'runs', run, 'RUN.md'), r = readItem(runFile);
    if (r.meta.status !== 'active') { r.meta.status = 'active'; writeAtomic(dir, runFile, format(r)); envelope(dir, run, ['run', 'state active', from, 'reopened'], now); }
  }
  for (let attempt = 0; ; attempt++) {
    const id = newId(now);
    const meta = { id, kind, title: oneLine(title), run, role, agent, thread: thread || id, round: String(round), depends: deps.join(','),
      from, to, ref, created: now.toISOString(), expires: new Date(now.getTime() + Number(expires) * DAY).toISOString().slice(0, 10) };
    try { createAtomic(dir, join(dir, 'open', `${id}.md`), format({ meta, body: `## Ask\n\n${ask.trim()}` })); }
    catch (e) { if (e.code === 'EEXIST' && attempt < 5) continue; throw e; }
    envelope(dir, run, [`${kind} ${id}`, `round ${round}`, 'state open', `${from} → ${to}`, title], now);
    return id;
  }
}

export function claim(dir, id, by, now = new Date()) {
  name(by);
  const from = join(dir, 'open', `${id}.md`), to = join(dir, 'claimed', `${id}.md`);
  if (existsSync(from)) {
    const pending = blockers(dir, readItem(from).meta);
    if (pending.length) fail(`${id} is blocked by ${pending.join(', ')} (not done with outcome succeeded yet)`);
  }
  try { renameSync(from, to); } catch (e) {
    if (e.code === 'ENOENT') fail(`${id} is not open (someone else claimed it, or it does not exist)`);
    throw e;
  }
  const item = readItem(to);
  item.meta.claimed_by = by; item.meta.claimed = now.toISOString();
  writeAtomic(dir, to, format(item));
  envelope(dir, item.meta.run, [`${item.meta.kind} ${id}`, `round ${item.meta.round ?? 1}`, 'state claimed', by], now);
  return item.meta;
}

export function done(dir, id, by, outcome, text = '', now = new Date()) {
  if (!['succeeded', 'failed'].includes(outcome)) fail('--outcome must be succeeded or failed');
  name(by);
  const file = join(dir, 'claimed', `${id}.md`);
  let item;
  try { item = readItem(file); } catch { fail(`${id} is not claimed`); }
  if (item.meta.claimed_by !== by) fail(`${id} is claimed by ${item.meta.claimed_by}, not ${by}`);
  const [result, learned = ''] = dedent(text).split(/^## Learned\s*$/m);
  const lines = learned.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > LIMITS.learned) fail(`Learned has ${lines.length} lines (max ${LIMITS.learned}): keep only facts worth remembering`);
  let summary = result.replace(/^## Result\s*$/m, '').trim();
  if (summary.length > LIMITS.result) {
    writeAtomic(dir, join(dir, 'artifacts', `${id}.md`), `${summary}\n`);
    summary = `${summary.slice(0, 400)}…\n\n전체: artifacts/${id}.md`;
  }
  item.meta.outcome = outcome; item.meta.finished = now.toISOString();
  item.body = `${item.body}\n\n## Result\n\n${summary}${lines.length ? `\n\n## Learned\n\n${lines.join('\n')}` : ''}`;
  writeAtomic(dir, join(dir, 'done', `${id}.md`), format(item));
  unlinkSync(file);
  envelope(dir, item.meta.run, [`${item.meta.kind} ${id}`, `round ${item.meta.round ?? 1}`, `state ${outcome}`, `${by} → ${item.meta.from}`], now);
  return item.meta;
}

export function release(dir, id, now = new Date()) {
  const file = join(dir, 'claimed', `${id}.md`);
  let item;
  try { item = readItem(file); } catch { fail(`${id} is not claimed`); }
  const was = item.meta.claimed_by;
  delete item.meta.claimed_by; delete item.meta.claimed;
  writeAtomic(dir, join(dir, 'open', `${id}.md`), format(item));
  unlinkSync(file);
  envelope(dir, item.meta.run, [`${item.meta.kind} ${id}`, `round ${item.meta.round ?? 1}`, 'state released', was], now);
}

// Shared working memory during a run: repo knowledge (handed to the memory skill at sweep) and decisions (stay in the run).
export function note(dir, run, by, type, text, now = new Date()) {
  if (!['knowledge', 'decision'].includes(type)) fail('--type must be knowledge or decision');
  name(by);
  if (!run || !existsSync(join(dir, 'runs', run, 'RUN.md'))) fail(`run ${run} does not exist`);
  const line = oneLine(text);
  if (!line) fail('note text comes from stdin');
  if (line.length > LIMITS.note) fail(`note is ${line.length} chars (max ${LIMITS.note}): one fact per note`);
  envelope(dir, run, [`note ${type}`, by, line], now);
}

export function log(dir, run, tail = 20) {
  try { return readFileSync(join(dir, 'runs', run, 'log.md'), 'utf8').trim().split('\n').slice(-tail).join('\n'); } catch { fail(`run ${run} has no log`); }
}

// A worker's own recovery note: what it holds and where it stopped, for a restart or a compacted context.
export function checkpoint(dir, by, text, now = new Date()) {
  name(by);
  if (text.trim().length > LIMITS.checkpoint) fail(`checkpoint is ${text.trim().length} chars (max ${LIMITS.checkpoint})`);
  init(dir);
  const holding = list(join(dir, 'claimed')).map(f => readItem(join(dir, 'claimed', f)).meta).filter(m => m.claimed_by === by).map(m => m.id);
  writeAtomic(dir, join(dir, 'workers', `${by}.md`), format({ meta: { worker: by, items: holding.join(','), updated: now.toISOString() }, body: text }));
}

const age = (iso, now) => { const h = Math.floor((now - Date.parse(iso)) / 3600000); return h >= 24 ? `${Math.floor(h / 24)}일` : `${h}시간`; };

export function board(dir, now = new Date()) {
  const items = state => list(join(dir, state)).map(f => readItem(join(dir, state, f)).meta);
  const open = items('open'), claimed = items('claimed'), finished = items('done');
  const stale = claimed.filter(m => now - Date.parse(m.claimed) > DAY);
  const runs = runIds(dir).map(id => readItem(join(dir, 'runs', id, 'RUN.md')).meta).filter(m => m.status === 'active');
  const tag = m => [m.role, m.agent, Number(m.round) > 1 ? `r${m.round}` : ''].filter(Boolean).join('·');
  const lines = [`# 메모리박스 — open ${open.length} · claimed ${claimed.length}${stale.length ? ` (멈춤 ${stale.length})` : ''} · done ${finished.length}`, ''];
  for (const r of runs) lines.push(`## run ${r.id}: ${r.objective}`);
  for (const m of open) {
    const blocked = blockers(dir, m);
    lines.push(`- [${blocked.length ? `blocked: ${blocked.join(',')}` : 'open'}] ${m.id} → ${m.to}${tag(m) ? ` (${tag(m)})` : ''}: ${m.title}`);
  }
  for (const m of claimed) lines.push(`- [claimed${now - Date.parse(m.claimed) > DAY ? '·멈춤' : ''}] ${m.id} ${m.claimed_by}${tag(m) ? ` (${tag(m)})` : ''}: ${m.title} (${age(m.claimed, now)})`);
  for (const m of finished) lines.push(`- [done·${m.outcome}] ${m.id}: ${m.title}`);
  const text = lines.slice(0, LIMITS.board).join('\n') + (lines.length > LIMITS.board ? `\n- …${lines.length - LIMITS.board}개 더` : '') + '\n';
  init(dir);
  writeAtomic(dir, join(dir, 'BOARD.md'), text);
  return { text, open: open.length, claimed: claimed.length, stale: stale.length, done: finished.length, runs: runs.length };
}

// Hands the lead every Learned line and every new knowledge note (for the memory skill), archives done items,
// and closes runs that have nothing open or claimed left.
export function sweep(dir, { dryRun = false } = {}, now = new Date()) {
  init(dir);
  const out = [];
  for (const f of list(join(dir, 'done'))) {
    const item = readItem(join(dir, 'done', f));
    // Only the Learned that done appended after the Ask, never a "## Learned" quoted inside the Ask.
    const result = item.body.slice(item.body.lastIndexOf('\n## Result\n') + 1);
    for (const line of (result.split(/^## Learned\s*$/m)[1] ?? '').split('\n').map(l => l.trim()).filter(Boolean)) out.push(`${item.meta.id} | ${line}`);
    if (!dryRun) {
      const month = join(dir, 'archive', now.toISOString().slice(0, 7));
      mkdirSync(month, { recursive: true });
      renameSync(join(dir, 'done', f), join(month, f));
    }
  }
  const live = new Set(['open', 'claimed'].flatMap(state => list(join(dir, state)).map(f => readItem(join(dir, state, f)).meta.run)));
  for (const run of runIds(dir)) {
    const runFile = join(dir, 'runs', run, 'RUN.md'), item = readItem(runFile);
    let logLines = [];
    try { logLines = readFileSync(join(dir, 'runs', run, 'log.md'), 'utf8').trim().split('\n'); } catch {}
    const from = Number(item.meta.swept_lines ?? 0);
    // Notes are read from every run, closed ones too: a worker may still note after the lead's last sweep.
    for (const l of logLines.slice(from)) {
      const m = l.match(/\| note knowledge \| ([^|]+) \| (.*)$/);
      if (m) out.push(`${run} | ${m[2].trim()} (${m[1].trim()})`);
    }
    if (!dryRun) {
      // A run closes once something in it has finished and nothing is open or claimed (a fresh run stays open).
      const close = item.meta.status === 'active' && !live.has(run) && logLines.some(l => /\| state (succeeded|failed) \|/.test(l));
      if (close) { item.meta.status = 'complete'; envelope(dir, run, ['run', 'state complete', 'lead'], now); }
      const swept = String(logLines.length + (close ? 1 : 0));
      if (close || swept !== String(from)) { item.meta.swept_lines = swept; writeAtomic(dir, runFile, format(item)); }
    }
  }
  if (!dryRun) for (const m of months(dir)) {
    const path = join(dir, 'archive', m);
    if (now - statSync(path).mtimeMs > 30 * DAY) rmSync(path, { recursive: true, force: true });
  }
  return out;
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); out[k] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[++i]; }
    else out._.push(argv[i]);
  }
  return out;
}

async function stdin() {
  if (process.stdin.isTTY) return '';
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

const USAGE = `usage: memorybox.mjs <command> [--dir <memorybox>]
  path | board | show <id> | log <run> [--tail N] | sweep [--dry-run]
  run-create --objective <text>
  post --title <t> [--run <id>] [--role <r>] [--agent claude|codex] [--to any|<w>] [--depends a,b] [--thread <id>] [--kind task|question|review|note]  < Ask
  claim <id> --by <w> | done <id> --by <w> --outcome succeeded|failed  < Result/Learned | release <id>
  note --run <id> --by <w> --type knowledge|decision  < one line
  checkpoint --by <w>  < text | worker <w>`;

// realpath: Node gives import.meta.url with symlinks resolved (macOS /var → /private/var), argv[1] as typed.
const main = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (process.argv[1] && main()) {
  const a = args(process.argv.slice(2));
  const dir = a.dir ? resolve(a.dir) : memoryboxDir();
  const [cmd, id] = a._;
  try {
    if (cmd === 'path') console.log(dir);
    else if (cmd === 'run-create') console.log(runCreate(dir, flag(a.objective)));
    else if (cmd === 'post') console.log(post(dir, { kind: flag(a.kind) || undefined, to: flag(a.to) || undefined, from: flag(a.from) || undefined, title: flag(a.title),
      thread: flag(a.thread), ref: flag(a.ref), expires: flag(a.expires) || undefined, run: flag(a.run), role: flag(a.role), agent: flag(a.agent),
      depends: flag(a.depends) }, await stdin()));
    else if (cmd === 'claim') console.log(JSON.stringify(claim(dir, id, flag(a.by))));
    else if (cmd === 'done') console.log(JSON.stringify(done(dir, id, flag(a.by), flag(a.outcome), await stdin())));
    else if (cmd === 'release') { release(dir, id); console.log(`${id} → open`); }
    else if (cmd === 'note') { note(dir, flag(a.run), flag(a.by), flag(a.type), await stdin()); console.log('noted'); }
    else if (cmd === 'log') console.log(log(dir, id, Number(a.tail) || 20));
    else if (cmd === 'checkpoint') { checkpoint(dir, flag(a.by), await stdin()); console.log(`workers/${a.by}.md`); }
    else if (cmd === 'worker') process.stdout.write(readFileSync(join(dir, 'workers', `${name(id)}.md`), 'utf8'));
    else if (cmd === 'board') process.stdout.write(board(dir).text);
    else if (cmd === 'sweep') console.log(sweep(dir, { dryRun: Boolean(a['dry-run']) }).join('\n') || '(Learned·knowledge 없음)');
    else if (cmd === 'show') { const f = find(dir, id); if (!f) fail(`${id} not found`); process.stdout.write(readFileSync(f.file, 'utf8')); }
    else { console.error(USAGE); process.exit(2); }
  } catch (e) {
    console.error(e.code === 'MEMORYBOX' ? e.message : e.stack);
    process.exit(1);
  }
}
