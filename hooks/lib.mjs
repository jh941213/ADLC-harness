// Shared by hooks/session-start.mjs. A hook must never break the host session:
// the entry point catches everything, prints at most one JSON object, and exits 0.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

export async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const read = file => { try { return readFileSync(file, 'utf8'); } catch { return ''; } };
const json = file => { try { return JSON.parse(read(file) || '{}'); } catch { return {}; } };

// The git top level of the session cwd, else the cwd itself.
// --no-optional-locks: must not race the user's own git commands.
export function rootOf(input) {
  const cwd = input.cwd || process.cwd();
  try {
    return execFileSync('git', ['--no-optional-locks', 'rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true,
    }).trim() || cwd;
  } catch { return cwd; }
}

// The main repository root, which Claude Code keys auto memory on: worktrees of one repository share it.
export function repoRoot(root) {
  try {
    const common = execFileSync('git', ['--no-optional-locks', 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true,
    }).trim();
    return basename(common) === '.git' ? dirname(common) : root;
  } catch { return root; }
}

// Claude Code's folder name for a project path: non-alphanumerics as '-', and past 200 chars cut with a hash of the path.
export function projectKey(path) {
  const key = path.replace(/[^A-Za-z0-9]/g, '-');
  if (key.length <= 200) return key;
  let h = 0;
  for (let i = 0; i < path.length; i++) h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  return `${key.slice(0, 200)}-${Math.abs(h).toString(36)}`;
}

// The project's Claude Code auto memory directory, found the way Claude Code finds it, so every host shares one store:
// `autoMemoryDirectory` (absolute or ~/ only; Claude Code ignores anything else) from local > project > user settings,
// else <config>/projects/<projectKey(main repo path)>/memory.
export function memoryDir(root, env = process.env) {
  const config = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  for (const file of [join(root, '.claude', 'settings.local.json'), join(root, '.claude', 'settings.json'), join(config, 'settings.json')]) {
    const dir = json(file).autoMemoryDirectory;
    const path = typeof dir === 'string' ? dir.replace(/^~(?=[\\/])/, homedir()) : '';
    if (path && isAbsolute(path)) return path;
  }
  return join(config, 'projects', env.CLAUDE_CODE_PROJECT_DIR_NAME || projectKey(repoRoot(root)), 'memory');
}

const body = text => text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

// What SessionStart adds from the memory directory:
// - handoff: the body of handoff.md (short-term), for every host
// - index: MEMORY.md as Claude Code loads it (200 lines), for hosts that do not load it themselves
// - nudges: one line each when the store needs the memory skill (index near its limit, promotion candidates)
export function memoryContext(dir, { loadIndex }) {
  const handoff = body(read(join(dir, 'handoff.md'))).slice(0, 1500);
  const lines = read(join(dir, 'MEMORY.md')).trim().split('\n').filter(Boolean);
  const index = loadIndex ? lines.slice(0, 200).join('\n').slice(0, 8000) : '';
  let files = [];
  try { files = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md' && f !== 'handoff.md'); } catch {}
  const promote = files.filter(f => Number(read(join(dir, f)).match(/^\s*hits:\s*(\d+)/m)?.[1] ?? 0) >= 2);
  const nudges = [];
  if (lines.length >= 150) nudges.push(`MEMORY.md가 ${lines.length}줄이다(200줄에서 잘림). memory 스킬의 정리를 먼저 제안한다.`);
  if (promote.length) nudges.push(`승격 후보 ${promote.length}개(hits 2 이상: ${promote.slice(0, 5).join(', ')}). memory 스킬의 정리를 제안한다.`);
  return { handoff, index, nudges };
}

// One short block when the memorybox (<memory dir>/memorybox) has work: active runs, counts, and up to five open or claimed titles.
export function memoryboxSummary(dir, limit = 800) {
  const items = state => { try { return readdirSync(join(dir, state)).filter(f => f.endsWith('.md')); } catch { return []; } };
  const open = items('open'), claimed = items('claimed'), done = items('done');
  let runs = [];
  try { runs = readdirSync(join(dir, 'runs')).map(id => read(join(dir, 'runs', id, 'RUN.md'))).filter(t => /^status:\s*active$/m.test(t)); } catch {}
  if (!open.length && !claimed.length && !done.length && !runs.length) return '';
  const field = (text, key) => text.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1] ?? '';
  const title = (state, f) => field(read(join(dir, state, f)), 'title') || f;
  const lines = [`open ${open.length} · claimed ${claimed.length} · done(정리 전) ${done.length} — memorybox 스킬로 board·log·sweep`,
    ...runs.map(t => `- run ${field(t, 'id')}: ${field(t, 'objective')}`),
    ...open.map(f => `- [open] ${f.replace(/\.md$/, '')}: ${title('open', f)}`),
    ...claimed.map(f => `- [claimed] ${f.replace(/\.md$/, '')}: ${title('claimed', f)}`)].slice(0, 8);
  return lines.join('\n').slice(0, limit);
}
