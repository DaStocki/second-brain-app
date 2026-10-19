// End-to-end tests against a simulated GitHub API and a fictional test vault (tests/fixtures/vault).
const { test, expect } = require('@playwright/test');
const { mockGitHub } = require('./mock-github');

const NOW = new Date('2026-10-11T18:00:00Z'); // So 11.10.2026, 20:00 in Berlin

async function open(page, { token = 't', storage = {}, github = {} } = {}) {
  await page.clock.setFixedTime(NOW);
  const gh = await mockGitHub(page, github);
  await page.addInitScript(([token, storage]) => {
    if (sessionStorage.getItem('init')) return; // only on the first load, so reload tests keep state
    sessionStorage.setItem('init', '1');
    if (token) localStorage.setItem('token', token);
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  }, [token, storage]);
  await page.goto('/');
  return gh;
}
const lastLog = gh => gh.files['wiki/log.md'].trim().split('\n').pop();

test('Heute: Status, Fälliges und Notizen', async ({ page }) => {
  await open(page);
  await expect(page.locator('#h-date')).toHaveText('So, 11.10.2026');
  await expect(page.locator('#h-status .status')).toHaveText(/steht noch aus/);
  await expect(page.locator('#h-due .task')).toHaveCount(1); // only the 14.10. task is due within 7 days
  await expect(page.locator('#h-notes .card').first()).toContainText('Testnotiz');
});

test('Check-in: Assistent, Entwurf übersteht Neuladen, Speichern schreibt das Journal', async ({ page }) => {
  const gh = await open(page);
  await page.click('nav button[data-tab=checkin]');
  await page.click('.scale.big button:text-is("6")');
  await expect(page.locator('#ci-step .hint').first()).toHaveText('2/13');
  await page.reload();
  await page.click('nav button[data-tab=checkin]');
  await expect(page.locator('#ci-step .hint').first()).toHaveText('2/13');
  for (const v of ['3', '5', '8', '4']) { await page.click(`.scale.big button:text-is("${v}")`); await page.waitForTimeout(250) }
  await page.click('text=– überspringen'); // focus
  for (const v of ['6', '4', '7']) { await page.click(`.scale.big button:text-is("${v}")`); await page.waitForTimeout(250) }
  await page.fill('#ci-step textarea', 'Ein Testtag');
  for (let i = 0; i < 4; i++) await page.click('#ci-step button.primary');
  await page.click('#ci-step button.primary:text("Speichern")');
  await expect(page.locator('#h-status .status')).toHaveText(/gespeichert/);
  const j = gh.files['journal/2026-10-11.md'];
  expect(j).toContain('typ: checkin');
  expect(j).toMatch(/stimmung: 6\nstress: 3\n/);
  expect(j).toMatch(/energie: 5\nschlaf: 8\nbeschwerden: 4\n/);
  expect(j).toContain('fokus:\n');
  expect(j).toContain('arbeitsbelastung:\n'); // Sunday: work is not asked
  expect(j).toContain('## Wichtigstes Ereignis\nEin Testtag');
  expect(j).toContain('## Dankbar / Stolz');
  expect(gh.commits).toEqual([{ message: 'checkin: 2026-10-11', files: ['journal/2026-10-11.md'] }]);
});

test('Check-in an einem Werktag: Arbeit wird gefragt, Dankbar / Stolz nicht', async ({ page }) => {
  const gh = await open(page, { storage: { 'ci-draft': JSON.stringify({ date: '2026-10-12', kurz: false, step: 0, answers: {} }) } });
  await page.click('nav button[data-tab=checkin]');
  await expect(page.locator('#ci-step .hint').first()).toHaveText('1/13');
  for (let i = 0; i < 10; i++) { await page.click(`.scale.big button:text-is("${i + 1}")`); await page.waitForTimeout(250) }
  for (let i = 0; i < 3; i++) await page.click('#ci-step button.primary');
  await expect(page.locator('#ci-step .sumrow')).toHaveCount(13);
  await expect(page.locator('#ci-step .sumrow', { hasText: 'Dankbar' })).toHaveCount(0);
  await page.click('#ci-step button.primary:text("Speichern")');
  await expect(page.locator('#msg')).toContainText('Gespeichert');
  const j = gh.files['journal/2026-10-12.md'];
  expect(j).toContain('arbeitsbelastung: 7\n');
  expect(j).toContain('schlaf: 4\n');
  expect(j).toContain('## Gutgetan');
  expect(j).not.toContain('Dankbar');
});

test('Notiz offline: landet in der Warteschlange und wird später gesendet', async ({ page }) => {
  const gh = await open(page);
  gh.offline = true;
  await page.click('[data-go=note]');
  await page.fill('#n-text', 'Offline-Notiz');
  await page.click('#n-save');
  await expect(page.locator('#msg')).toContainText('Offline');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('outbox')).length)).toBe(1);
  gh.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => gh.files['journal/2026-10-11.md'] || '').toContain('Offline-Notiz');
  expect(await page.evaluate(() => localStorage.getItem('outbox'))).toBe('[]');
});

test('Abhaken: Rückgängig schreibt nichts, sonst genau ein Commit mit Seite und Log', async ({ page }) => {
  const gh = await open(page);
  await page.click('nav button[data-tab=offen]');
  const task = () => page.locator('#o-list .task').filter({ hasText: 'Fahrzeugbrief' });
  await task().locator('.tick').click();
  await expect(task()).toHaveClass(/ticked/);
  await page.click('.msgbtn');
  await expect(task()).not.toHaveClass(/ticked/);
  await page.waitForTimeout(5500);
  expect(gh.commits).toEqual([]);

  await task().locator('.tick').click();
  await expect.poll(() => gh.commits.length, { timeout: 8000 }).toBe(1);
  expect(gh.commits[0]).toEqual({ message: 'offen: Aufgabe abgehakt (auto)', files: ['wiki/projects/auto.md', 'wiki/log.md'] });
  expect(gh.files['wiki/projects/auto.md']).toContain('- [x] Fahrzeugbrief sicher ablegen');
  expect(lastLog(gh)).toContain('in der App abgehakt: Fahrzeugbrief');
  await expect(task()).toHaveCount(0);
});

test('Abhaken: beim Verlassen des Tabs sofort geschrieben', async ({ page }) => {
  const gh = await open(page);
  await page.click('nav button[data-tab=offen]');
  await page.locator('#o-list .task').filter({ hasText: 'Rechtsschutz' }).locator('.tick').click();
  await page.click('nav button[data-tab=heute]');
  await expect.poll(() => gh.commits.length).toBe(1);
  expect(gh.files['wiki/people/ich.md']).toMatch(/tags: \[persoenlich\]/); // last open task gone -> tag "offen" removed
});

test('Ein Commit wird bei gleichzeitigem Push neu versucht, nie erzwungen', async ({ page }) => {
  const gh = await open(page);
  gh.failNextRef = true;
  await page.click('nav button[data-tab=offen]');
  await page.locator('#o-list .task').filter({ hasText: 'Fahrzeugbrief' }).locator('.tick').click();
  await expect.poll(() => gh.commits.length, { timeout: 8000 }).toBe(1);
  expect(gh.files['wiki/projects/auto.md']).toContain('- [x] Fahrzeugbrief');
});

test('Fälligkeit setzen, überschreiben und entfernen', async ({ page }) => {
  const gh = await open(page);
  await page.click('nav button[data-tab=offen]');
  const task = txt => page.locator('#o-list .task').filter({ hasText: txt });
  await expect(task('Fahrzeugbrief').locator('button.due')).toHaveText('+ Datum');
  await task('Fahrzeugbrief').locator('.duepick').evaluate(i => { i.value = '2026-10-20'; i.dispatchEvent(new Event('change')) });
  await expect(task('Fahrzeugbrief').locator('button.due')).toHaveText('Di 20.10.2026');
  expect(gh.files['wiki/projects/auto.md']).toContain('- [ ] Fahrzeugbrief sicher ablegen 📅 2026-10-20');
  expect(gh.commits.at(-1)).toEqual({ message: 'offen: Fälligkeit gesetzt (auto)', files: ['wiki/projects/auto.md', 'wiki/log.md'] });

  await task('Am 14.10.2026').locator('.duepick').evaluate(i => { i.value = '2026-10-15'; i.dispatchEvent(new Event('change')) });
  await expect(task('Am 14.10.2026').locator('button.due')).toHaveText('Do 15.10.2026');

  await task('Fahrzeugbrief').locator('.dueclear').click();
  await expect(task('Fahrzeugbrief').locator('button.due')).toHaveText('+ Datum');
  expect(gh.files['wiki/projects/auto.md']).toContain('- [ ] Fahrzeugbrief sicher ablegen\n');
  expect(gh.commits).toHaveLength(3);
});

test('Datumserkennung: Unteraufgaben erben, Vergangenheitsdaten zählen nicht', async ({ page }) => {
  await open(page);
  await page.click('nav button[data-tab=offen]');
  await expect(page.locator('#o-list .task').filter({ hasText: 'Termin bei der Werkstatt' }).locator('button.due')).toHaveText('Mo 30.11.2026');
});

test('Neue Aufgabe: Seitensuche (Umlaute egal), Datum, ein Commit', async ({ page }) => {
  const gh = await open(page);
  await page.click('[data-go=newtask]');
  await expect(page.locator('#t-text')).toBeFocused(); // the form focuses the text after 50 ms; typing earlier can land there
  await expect(page.locator('#t-page-list .pl-item')).toHaveCount(1); // suggestion: "Ich"
  await page.fill('#t-page-q', 'muller');
  await expect(page.locator('#t-page-list .pl-item')).toHaveText([/Jana Müller/]);
  await page.fill('#t-page-q', 'wohnung');
  await expect(page.locator('#t-page-list .pl-item')).toHaveCount(2);
  await page.fill('#t-page-q', 'readme');
  await expect(page.locator('#t-page-list')).toContainText('Keine Seite gefunden');
  await page.fill('#t-page-q', 'jana');
  await page.press('#t-page-q', 'Enter');
  await page.fill('#t-text', 'Geburtstagsgeschenk\nbesorgen');
  await page.fill('#t-due', '2026-11-02');
  await page.click('#t-save');
  await expect.poll(() => gh.commits.length).toBe(1);
  const pg = gh.files['wiki/people/jana-mueller.md'];
  expect(pg).toContain('## Offene Punkte\n\n- [ ] Geburtstagsgeschenk besorgen 📅 2026-11-02\n\n## Quellen');
  expect(pg).toContain('tags: [familie, offen]');
  expect(gh.commits[0].files).toEqual(['wiki/people/jana-mueller.md', 'wiki/log.md']);
  await page.click('#o-new'); // after saving, the app shows the Offen tab
  await expect(page.locator('#t-page-sel')).toContainText('Jana Müller'); // last used page preselected
});

test('PIN: Token verschlüsselt, Sperre, falsche und richtige PIN', async ({ page }) => {
  await open(page, { token: '', github: { token: 'geheim' } });
  await page.fill('#set-token', 'geheim');
  await page.click('#set-save');
  await expect(page.locator('#msg')).toContainText('Verbunden');
  await page.fill('#pin-new', '482913'); await page.fill('#pin-new2', '482913');
  await page.click('#pin-set');
  await expect(page.locator('#pin-state')).toContainText('PIN ist aktiv');
  const leak = await page.evaluate(() => Object.keys(localStorage).some(k => localStorage.getItem(k).includes('geheim')));
  expect(leak).toBe(false);
  await page.reload();
  await expect(page.locator('#lock')).toBeVisible();
  await page.fill('#lock-pin', '000000'); await page.click('#lock-go');
  await expect(page.locator('#lock-err')).toHaveText('Falsche PIN.');
  await page.fill('#lock-pin', '482913'); await page.click('#lock-go');
  await expect(page.locator('#h-status .status')).toBeVisible();
});

test('Spracheingabe: Diktat landet im Feld', async ({ page }) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'heute war gut' }], { isFinal: true })] }), 50) }
      stop() { setTimeout(() => this.onend(), 10) }
    };
  });
  await open(page);
  await page.click('[data-go=note]');
  await page.fill('#n-text', 'Notiz:');
  await page.click('#tab-note .mic');
  await expect(page.locator('#n-text')).toHaveValue('Notiz: Heute war gut');
});

test('Spracheingabe: ohne Unterstützung im Browser kein Knopf', async ({ page }) => {
  await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition });
  await open(page);
  await page.click('[data-go=note]');
  await expect(page.locator('.mic')).toHaveCount(0);
});

test('Design und Schriftgröße bleiben erhalten, kein seitliches Scrollen', async ({ page }) => {
  await open(page);
  await page.click('nav button[data-tab=settings]');
  await page.click('[data-theme-choice=steel]');
  await page.click('[data-scale="1.3"]');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('steel');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim())).toBe('1.3');
  for (const t of ['heute', 'checkin', 'offen', 'kalender', 'verlauf', 'settings']) {
    await page.click(`nav button[data-tab=${t}]`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('Verlauf: zehn Diagramme, Antippen zeigt den Tageswert', async ({ page }) => {
  await open(page);
  await page.click('nav button[data-tab=verlauf]');
  await expect(page.locator('.chart')).toHaveCount(10);
  const box = await page.locator('.chart svg').first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(page.locator('.ccap').first()).toHaveText(/\d{2}\.\d{2}\.: /);
});

// A photo larger than the limit, built in the browser so no image file has to live in the repo.
async function bigPhoto(page, w = 4000, h = 3000) {
  const b64 = await page.evaluate(async ([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, w, h); x.fillStyle = '#222'; x.font = '60px sans-serif';
    for (let y = 150; y < h; y += 110) x.fillText('Sehr geehrter Herr Beispiel, hiermit bestätigen wir den Eingang Ihres Schreibens.', 150, y);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    let t = ''; new Uint8Array(await blob.arrayBuffer()).forEach(v => t += String.fromCharCode(v)); return btoa(t);
  }, [w, h]);
  return { name: 'PXL_20261011_180000.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
const jpegSize = buf => { for (let i = 2; i < buf.length;) { const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + buf.readUInt16BE(i + 2) } };
const photoKeys = page => page.evaluate(() => photoStore.names());

test('Foto: verkleinert, Vorschau, zwei Seiten in einem Commit nach raw/scans/', async ({ page }) => {
  const gh = await open(page);
  await page.click('[data-go=scan]');
  const photo = await bigPhoto(page);
  await page.setInputFiles('#p-cam', photo);
  await expect(page.locator('#p-list .shot')).toHaveCount(1);
  await expect(page.locator('#p-take')).toHaveText('Noch eine Seite');
  await page.setInputFiles('#p-cam', photo);
  await page.setInputFiles('#p-pick', photo);
  await expect(page.locator('#p-list .shot')).toHaveCount(3);
  await page.locator('#p-list .shot button').last().click();
  await expect(page.locator('#p-save')).toHaveText('2 Fotos ablegen');
  await page.fill('#p-hint', 'TK  Krankengeld');
  await page.click('#p-save');
  await expect(page.locator('#msg')).toContainText('2 Fotos in raw/scans/ abgelegt');
  expect(gh.commits).toEqual([{ message: 'scan: 2 Fotos aus der App (TK Krankengeld)', files: ['raw/scans/IMG_20261011_200000_1.jpg', 'raw/scans/IMG_20261011_200000_2.jpg'] }]);
  const saved = gh.binary['raw/scans/IMG_20261011_200000_1.jpg'];
  expect(saved.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  expect(saved.length).toBeLessThan(photo.buffer.length);
  expect(saved.length).toBeLessThanOrEqual(1e6);
  expect(jpegSize(saved)).toEqual({ w: 2400, h: 1800 });
  expect(await photoKeys(page)).toEqual([]);
  await page.click('[data-go=scan]');
  await expect(page.locator('#p-list .shot')).toHaveCount(0);
});

test('Foto offline: wartet auf dem Gerät, übersteht Neuladen, wird später gesendet', async ({ page }) => {
  const gh = await open(page);
  await page.click('[data-go=scan]');
  await page.setInputFiles('#p-cam', await bigPhoto(page, 1200, 900));
  await expect(page.locator('#p-list .shot')).toHaveCount(1);
  gh.offline = true;
  await page.click('#p-save');
  await expect(page.locator('#msg')).toContainText('Offline');
  expect(await photoKeys(page)).toEqual(['IMG_20261011_200000_1.jpg']);
  expect(await page.evaluate(() => localStorage.getItem('outbox').length)).toBeLessThan(500);
  await page.reload();
  await expect(page.locator('#outbox')).toContainText('1 Eintrag wartet');
  expect(gh.commits).toEqual([]);
  gh.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => gh.commits.length).toBe(1);
  expect(jpegSize(gh.binary['raw/scans/IMG_20261011_200000_1.jpg'])).toEqual({ w: 1200, h: 900 });
  await expect.poll(() => photoKeys(page)).toEqual([]);
});

test('Foto mit PIN: liegt verschlüsselt auf dem Gerät und wird nach dem Entsperren gesendet', async ({ page }) => {
  const gh = await open(page);
  await page.click('nav button[data-tab=settings]');
  await page.fill('#pin-new', '123456'); await page.fill('#pin-new2', '123456'); await page.click('#pin-set');
  await expect(page.locator('#msg')).toContainText('PIN gesetzt');
  await page.click('nav button[data-tab=heute]'); await page.click('[data-go=scan]');
  await page.setInputFiles('#p-cam', await bigPhoto(page, 1200, 900));
  await expect(page.locator('#p-list .shot')).toHaveCount(1);
  gh.offline = true;
  await page.click('#p-save');
  await expect(page.locator('#msg')).toContainText('Offline');
  const rec = await page.evaluate(() => photoStore.tx('readonly', s => s.get('IMG_20261011_200000_1.jpg')).then(r => ({ iv: !!r.iv, head: [...r.data.slice(0, 3)] })));
  expect(rec.iv).toBe(true);
  expect(rec.head).not.toEqual([0xff, 0xd8, 0xff]);
  gh.offline = false;
  await page.reload();
  await page.fill('#lock-pin', '123456'); await page.click('#lock-go');
  await expect.poll(() => gh.commits.length).toBe(1);
  expect(gh.binary['raw/scans/IMG_20261011_200000_1.jpg'].subarray(0, 3).toString('hex')).toBe('ffd8ff');
});

test('Foto: eine Datei, die kein Bild ist, wird abgelehnt', async ({ page }) => {
  const gh = await open(page);
  await page.click('[data-go=scan]');
  await page.setInputFiles('#p-pick', { name: 'brief.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('kein Bild') });
  await expect(page.locator('#msg')).toContainText('konnte nicht gelesen werden');
  await expect(page.locator('#p-list .shot')).toHaveCount(0);
  await page.click('#p-save');
  await expect(page.locator('#msg')).toContainText('Noch kein Foto');
  expect(gh.commits).toEqual([]);
});
