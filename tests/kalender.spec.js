// Calendar tab (tasks by due date, check-in mood, notes per day) and export of a task to a calendar.
const { test, expect } = require('@playwright/test');
const { mockGitHub } = require('./mock-github');

const NOW = new Date('2026-10-11T18:00:00Z'); // So 11.10.2026, 20:00 in Berlin

async function open(page, storage = {}) {
  await page.clock.setFixedTime(NOW);
  const gh = await mockGitHub(page);
  await page.addInitScript(storage => { localStorage.setItem('token', 't'); for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v) }, storage);
  await page.goto('/');
  await page.click('nav button[data-tab=kalender]');
  await expect(page.locator('#k-day h2')).toBeVisible();
  return gh;
}
const day = (page, d) => page.locator(`.calday[data-date="${d}"]`);

test('Kalender: Monat, Markierungen, Tagesansicht, Monatswechsel', async ({ page }) => {
  await open(page);
  await expect(page.locator('#k-month')).toHaveText('Oktober 2026');
  await expect(page.locator('.calday')).toHaveCount(35); // 28.09. – 01.11., weeks start on Monday
  await expect(page.locator('.calday').first()).toHaveAttribute('data-date', '2026-09-28');
  await expect(day(page, '2026-10-11')).toHaveClass(/today/);
  await expect(page.locator('#k-day h2')).toHaveText('So, 11.10.2026 · heute');
  await expect(day(page, '2026-10-14').locator('.mk.task')).toHaveCount(1);
  await expect(day(page, '2026-10-09').locator('.mood')).toHaveClass(/mood-low/); // Stimmung 3
  await expect(day(page, '2026-10-09').locator('.mk.note')).toHaveCount(1);

  await day(page, '2026-10-14').click();
  await expect(page.locator('#k-day .task')).toHaveCount(1);
  await expect(page.locator('#k-day .task')).toContainText('beim Termin');

  await day(page, '2026-10-09').click();
  const ci = page.locator('#k-day .calci');
  await expect(ci).toContainText('Stimmung 3');
  await expect(ci).toContainText('Stress 8');
  await expect(ci).not.toContainText('Arbeit'); // skipped value is left out
  await expect(ci).toContainText('Testereignis 13');
  await expect(page.locator('#k-day #k-newtask')).toHaveCount(0); // no new tasks in the past

  await page.click('#k-next');
  await expect(page.locator('#k-month')).toHaveText('November 2026');
  await expect(day(page, '2026-11-30').locator('.mk.task')).toHaveCount(1); // "Bis 30.11.2026: Winterreifen"
  await expect(page.locator('#k-day h2')).toHaveText('So, 01.11.2026');
  await page.click('#k-prev'); await page.click('#k-prev');
  await expect(page.locator('#k-month')).toHaveText('September 2026');
  await day(page, '2026-10-01').click(); // a day of the next month switches the month
  await expect(page.locator('#k-month')).toHaveText('Oktober 2026');
});

test('Kalender: neue Aufgabe für einen Tag, danach zurück im Kalender', async ({ page }) => {
  const gh = await open(page);
  await day(page, '2026-10-20').click();
  await expect(page.locator('#k-day')).toContainText('Nichts fällig.');
  await page.click('#k-newtask');
  await expect(page.locator('#t-due')).toHaveValue('2026-10-20');
  await expect(page.locator('#t-text')).toBeFocused();
  await expect(page.locator('nav button.on')).toHaveText('Kalender');
  await page.fill('#t-page-q', 'jana'); await page.press('#t-page-q', 'Enter');
  await page.fill('#t-text', 'Karten kaufen');
  await page.click('#t-save');
  await expect.poll(() => gh.commits.length).toBe(1);
  expect(gh.files['wiki/people/jana-mueller.md']).toContain('- [ ] Karten kaufen 📅 2026-10-20');
  await expect(page.locator('#tab-kalender')).toBeVisible();
  await expect(day(page, '2026-10-20').locator('.mk.task')).toHaveCount(1);
  // a new task started elsewhere keeps its old behaviour: empty date, back to Offen
  await page.click('nav button[data-tab=heute]'); await page.click('[data-go=newtask]');
  await expect(page.locator('#t-due')).toHaveValue('');
  await expect(page.locator('nav button.on')).toHaveText('Offen');
});

test('In Kalender: Google-Link und .ics-Datei als ganztägiger Termin', async ({ page }) => {
  await open(page);
  await day(page, '2026-10-14').click();
  const card = page.locator('#k-day .task');
  await expect(card.locator('.calx')).toBeHidden();
  await card.locator('.calbtn').click();
  const g = new URL(await card.locator('.calx a').getAttribute('href'));
  expect(g.origin + g.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(g.searchParams.get('action')).toBe('TEMPLATE');
  expect(g.searchParams.get('dates')).toBe('20261014/20261015');
  expect(g.searchParams.get('text')).toContain('beim Termin');
  expect(g.searchParams.get('details')).toContain('obsidian://open');
  const [dl] = await Promise.all([page.waitForEvent('download'), card.locator('.calx button').click()]);
  expect(dl.suggestedFilename()).toBe('2026-10-14-auto.ics');
  const ics = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(ics).toContain('DTSTART;VALUE=DATE:20261014\r\n');
  expect(ics).toContain('DTEND;VALUE=DATE:20261015\r\n');
  expect(ics).toMatch(/SUMMARY:Am 14\.10\.2026 beim Termin/);
  for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  // tasks without a date have nothing to export
  await page.click('nav button[data-tab=offen]');
  const undated = page.locator('#o-list .task', { hasText: 'Fahrzeugbrief' });
  await expect(undated.locator('.calbtn')).toHaveCount(0);
});

test('Tab-Leiste passt auf schmale Handys, auch mit großer Schrift', async ({ page }) => {
  for (const theme of ['rings', 'steel', 'clinical']) for (const [w, scale] of [[320, '1'], [360, '1.3'], [390, '1.3'], [412, '1.3']]) {
    await page.setViewportSize({ width: w, height: 700 });
    await open(page, { theme, fontscale: scale });
    await page.evaluate(() => document.fonts.ready);
    const [sw, cw] = await page.evaluate(() => { const n = document.querySelector('nav'); return [n.scrollWidth, n.clientWidth] });
    expect(sw, `${theme} ${w}px ${scale}`).toBeLessThanOrEqual(cw);
  }
});
