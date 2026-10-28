// SessionStart (startup|resume|clear|compact): Ponytail + the working rules, then this project's memory.
// Fixed text goes first so the prompt cache keeps it across sessions.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryboxSummary, memoryContext, memoryDir, readInput, rootOf } from './lib.mjs';

const read = file => { try { return readFileSync(file, 'utf8').trim(); } catch { return ''; } };

try {
  const root = rootOf(await readInput());
  const here = new URL('.', import.meta.url);
  let context = read(new URL('ponytail.md', here)) + '\n\n' + read(new URL('context.md', here));
  // Every host sets CLAUDE_PLUGIN_ROOT; Codex and Copilot also set PLUGIN_ROOT, and only Copilot sets COPILOT_PLUGIN_ROOT.
  // Not COPILOT_CLI=1: Copilot puts it on every subprocess, so a claude or codex worker it starts inherits it.
  const env = process.env;
  const copilot = env.COPILOT_PLUGIN_ROOT;
  // Claude Code loads MEMORY.md itself unless auto memory is off; Codex and Copilot only see it through this hook.
  const claude = !copilot && !env.PLUGIN_ROOT && env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== '1';
  const dir = memoryDir(root);
  const { handoff, index, nudges } = memoryContext(dir, { loadIndex: !claude });
  context += `\n\n메모리 폴더: ${dir}`;
  if (handoff) context += `\n\n# 인계 (handoff.md)\n\n${handoff}`;
  if (index) context += `\n\n# 메모리 색인 (MEMORY.md)\n\n${index}`;
  if (nudges.length) context += `\n\n# 메모리 점검\n\n${nudges.map(n => `- ${n}`).join('\n')}`;
  const memorybox = memoryboxSummary(join(dir, 'memorybox'));
  if (memorybox) context += `\n\n# 메모리박스\n\n${memorybox}`;
  // Copilot CLI reads a top-level additionalContext; Claude Code and Codex read hookSpecificOutput.
  process.stdout.write(JSON.stringify(copilot ? { additionalContext: context }
    : { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
} catch {}
