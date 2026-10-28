// PreToolUse(Edit|Write on UI files, filtered by `if` in hooks.json so nothing else spawns this; the script checks the
// extension again for a host that ignores `if`):
// once per session, tells the model that this project has not decided whether impeccable's design hook is on.
// Silent once `.claude/settings.local.json` has env.IMPECCABLE_HOOK_DISABLED, or when impeccable is not installed.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInput, rootOf } from './lib.mjs';

const json = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

function impeccableInstalled(root, config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')) {
  try { if (readFileSync(join(config, 'plugins', 'installed_plugins.json'), 'utf8').includes('"impeccable@')) return true; } catch {}
  return [root, homedir()].some(base => ['.claude/skills', '.agents/skills', '.github/skills'].some(d => existsSync(join(base, d, 'impeccable'))));
}

try {
  const input = await readInput();
  const root = rootOf(input);
  const ui = /\.(tsx|jsx|vue|svelte|css|html)$/i.test(String(input.tool_input?.file_path ?? ''));
  const decided = json(join(root, '.claude', 'settings.local.json')).env?.IMPECCABLE_HOOK_DISABLED !== undefined;
  const mark = join(tmpdir(), 'adlc-harness', createHash('sha256').update(`${input.session_id ?? ''}\n${root}`).digest('hex').slice(0, 24));
  if (ui && !decided && impeccableInstalled(root)) {
    mkdirSync(join(tmpdir(), 'adlc-harness'), { recursive: true });
    writeFileSync(mark, '', { flag: 'wx' }); // throws once this session has asked: only one call ever asks
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext:
      'impeccable 디자인 검사를 이 프로젝트에서 쓸지 아직 정하지 않았다(.claude/settings.local.json에 env.IMPECCABLE_HOOK_DISABLED 없음). '
      + '이 화면 작업을 마치기 전에 사용자에게 한 번 물어, 켜면 그 값을 "0", 끄면 "1"로 적는다. hook은 다음 세션부터 돌고, 켠 세션은 impeccable 스킬의 detect로 바꾼 화면 파일을 검사한다.' } }));
  }
} catch {}
