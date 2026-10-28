#!/usr/bin/env node
// Captures a reference page for design.md: screen-by-screen screenshots (desktop 1440, mobile 390) and the styles a design is
// made of (CSS custom properties, computed type/color/spacing of key elements, the most used colors, sizes and radii),
// and checks WCAG contrast for a color pair. Playwright is optional and not a dependency of this harness: it is loaded
// from the current project if installed there.
//   node capture.mjs <url> [--out <dir>]   → <dir>/<host>-desktop-N.png, <host>-mobile-N.png (one per screen), <host>-styles.json
//   node capture.mjs contrast <fg> <bg>    → contrast ratio and WCAG AA/AAA verdicts
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Runs in the page. Reads only what renders; no clicks, no navigation.
function extract() {
  const vars = {};
  for (const sheet of document.styleSheets) {
    let rules = [];
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheet
    for (const r of rules) if (/^(:root|html)$/.test(r.selectorText ?? '')) for (const p of r.style) if (p.startsWith('--')) vars[p] = r.style.getPropertyValue(p).trim();
  }
  const style = el => { const c = getComputedStyle(el); return { font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, lineHeight: c.lineHeight, letterSpacing: c.letterSpacing, color: c.color, background: c.backgroundColor, radius: c.borderRadius, shadow: c.boxShadow, padding: c.padding, border: c.border }; };
  const elements = {};
  for (const sel of ['body', 'header', 'nav', 'h1', 'h2', 'h3', 'p', 'a', 'button', 'input', '[class*="card" i]', 'footer']) {
    const el = document.querySelector(sel);
    if (el) elements[sel] = style(el);
  }
  const top = (values, n) => Object.entries(values.reduce((m, v) => (m[v] = (m[v] ?? 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, n);
  const all = [...document.querySelectorAll('body *')].filter(el => el.getClientRects().length).slice(0, 4000).map(el => getComputedStyle(el));
  const visible = v => v && v !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(v);
  return {
    title: document.title, vars, elements,
    colors: top(all.flatMap(c => [c.color, c.backgroundColor, c.borderTopColor]).filter(visible), 16),
    fonts: top(all.map(c => c.fontFamily), 6),
    fontSizes: top(all.map(c => c.fontSize), 10),
    spacing: top(all.flatMap(c => [c.paddingTop, c.paddingLeft, c.marginTop, c.gap]).filter(v => v && v !== '0px' && v !== 'normal'), 12),
    radii: top(all.map(c => c.borderRadius).filter(v => v !== '0px'), 8),
  };
}

// WCAG 2 relative luminance and contrast ratio, for #rgb, #rrggbb and rgb()/rgba().
function rgb(text) {
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) return (hex.length === 3 ? [...hex].map(c => c + c) : hex.match(/../g)).map(h => parseInt(h, 16));
  const m = text.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return m.slice(1, 4).map(Number);
  throw new Error(`color must be #rgb, #rrggbb or rgb(): ${text}`);
}
const luminance = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
function contrast(fg, bg) { const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); }

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'contrast') {
  const ratio = contrast(rest[0], rest[1]);
  const pass = (min, label) => `${label} ${ratio >= min ? '통과' : '미달'}`;
  console.log(`${ratio.toFixed(2)}:1 — ${pass(4.5, 'AA 본문')}, ${pass(3, 'AA 큰 글자·UI')}, ${pass(7, 'AAA 본문')}`);
} else if (cmd && /^https?:\/\//.test(cmd)) {
  let playwright;
  try { playwright = createRequire(join(process.cwd(), 'package.json'))('playwright'); } catch {
    console.error('Playwright가 이 프로젝트에 없다. 사용자에게 묻고 `npm i -D playwright`(브라우저가 없으면 `npx playwright install chromium`)를 하거나, REA·브라우저 도구로 캡처한다(SKILL.md 2절).');
    process.exit(2);
  }
  const at = rest.indexOf('--out'), out = resolve(at >= 0 ? rest[at + 1] : '.');
  mkdirSync(out, { recursive: true });
  const host = new URL(cmd).hostname.replace(/^www\./, '');
  // The bundled browser may be missing for this Playwright version; an installed Chrome works the same here.
  const browser = await playwright.chromium.launch().catch(() => playwright.chromium.launch({ channel: 'chrome' }));
  try {
    let styles;
    // One screenshot per screen height while scrolling down: reveal-on-scroll sections render, and each image stays readable.
    const shots = [];
    for (const [name, viewport, max] of [['desktop', { width: 1440, height: 900 }, 6], ['mobile', { width: 390, height: 844 }, 4]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      await page.goto(cmd, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForLoadState('load'));
      if (name === 'desktop') styles = await page.evaluate(extract);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let i = 0; i < max && i * viewport.height < height; i++) {
        await page.evaluate(y => scrollTo(0, y), i * viewport.height);
        await page.waitForTimeout(600);
        const file = `${host}-${name}-${i + 1}.png`;
        await page.screenshot({ path: join(out, file) });
        shots.push(file);
      }
      await page.close();
    }
    writeFileSync(join(out, `${host}-styles.json`), JSON.stringify({ url: cmd, captured: new Date().toISOString(), ...styles }, null, 2));
    console.log([...shots, `${host}-styles.json`].map(f => join(out, f)).join('\n'));
  } finally { await browser.close(); }
} else {
  console.error('usage: capture.mjs <url> [--out <dir>] | contrast <fg> <bg>');
  process.exit(2);
}
