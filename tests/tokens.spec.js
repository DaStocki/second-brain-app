// Design tokens: every theme must define every token the shared CSS uses, and nothing unused.
// Catches a theme that silently falls back to nothing after a component gets a new token.
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path');

const dir = path.join(__dirname, '..', 'css');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const themes = fs.readdirSync(dir).filter(f => /^theme-.+\.css$/.test(f));
const defined = css => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
// var(--x) without a fallback must be defined by the theme; --zoom always has one
const used = css => new Set([...css.matchAll(/var\((--[\w-]+)\s*\)/g)].map(m => m[1]));

test('kein Theme definiert tote Tokens', () => {
  expect(themes.length).toBeGreaterThanOrEqual(3);
  // a theme may keep its own palette (e.g. --signal), but only if something reads it
  const any = css => new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
  const shared = any(read('base.css') + read('components.css'));
  for (const f of themes) {
    const css = read(f), local = any(css);
    expect([...defined(css)].filter(t => !shared.has(t) && !local.has(t)), `ungenutzt in ${f}`).toEqual([]);
  }
});

test('jedes verwendete Token ist in jedem Theme definiert', () => {
  const shared = used(read('base.css') + read('components.css'));
  for (const f of themes) {
    const css = read(f), set = defined(css);
    const missing = [...shared, ...used(css)].filter(t => !set.has(t));
    expect([...new Set(missing)], `fehlt in ${f}`).toEqual([]);
  }
});

test('jedes Theme ist eingebunden und offline verfügbar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  for (const f of ['base.css', 'components.css', ...themes]) {
    expect(html, f).toContain(`href="css/${f}"`);
    expect(sw, f).toContain(`'./css/${f}'`);
  }
});
