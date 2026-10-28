// Screenshot comparison of every screen in every theme. Guards refactors of the design system.
// Baselines depend on the exact Chromium build, so this suite runs locally: npm run test:visual
// (update baselines on purpose with: npm run test:visual -- --update-snapshots).
const { test, expect } = require('@playwright/test');
const { mockGitHub } = require('./mock-github');

const NOW = new Date('2026-10-11T18:00:00Z');
const THEMES = ['rings', 'steel', 'clinical'];
const shot = { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 };

test.describe.configure({ mode: 'parallel' });
test.use({ reducedMotion: 'reduce' });

async function start(page, theme, extra = {}) {
  await page.clock.setFixedTime(NOW);
  await mockGitHub(page);
  await page.addInitScript(([theme, extra]) => {
    localStorage.setItem('token', 't'); localStorage.setItem('theme', theme);
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, [theme, extra]);
  await page.goto('/');
  await page.waitForSelector('#h-status .status');
  await page.evaluate(() => document.fonts.ready);
}
async function settle(page) {
  await page.waitForTimeout(100);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); return document.fonts.ready });
  await page.waitForTimeout(400);
}

for (const theme of THEMES) {
  test.describe(`@visual ${theme}`, () => {
    test('heute', async ({ page }) => {
      await start(page, theme); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-heute.png`, { ...shot, fullPage: true });
    });
    test('checkin', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=checkin]');
      await page.click('.scale.big button:text-is("6")'); await page.waitForTimeout(300);
      await page.mouse.move(0, 0); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-checkin.png`, shot);
    });
    test('checkin-text-und-zusammenfassung', async ({ page }) => {
      await start(page, theme, { 'ci-draft': JSON.stringify({ date: '2026-10-11', kurz: false, step: 9, answers: { stimmung: 6, stress: 3 } }) });
      await page.click('nav button[data-tab=checkin]'); await page.fill('#ci-step textarea', 'Ein Testtag'); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-checkin-text.png`, shot);
      for (let i = 0; i < 4; i++) await page.click('#ci-step button.primary');
      await page.mouse.move(0, 0); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-checkin-summary.png`, { ...shot, fullPage: true });
    });
    test('offen', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=offen]'); await page.waitForSelector('#o-list .task'); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-offen.png`, { ...shot, fullPage: true });
    });
    test('verlauf', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=verlauf]'); await page.waitForSelector('.chart'); await settle(page);
      const box = await page.locator('.chart svg').first().boundingBox();
      await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
      await expect(page).toHaveScreenshot(`${theme}-verlauf.png`, shot);
    });
    test('kalender', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=kalender]'); await page.waitForSelector('#k-day h2');
      await page.click('.calday[data-date="2026-10-09"]'); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-kalender.png`, { ...shot, fullPage: true });
      await page.click('.calday[data-date="2026-10-14"]'); await page.click('#k-day .calbtn'); await page.mouse.move(0, 0); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-kalender-tag.png`, shot);
    });
    test('einstellungen', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=settings]'); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-settings.png`, { ...shot, fullPage: true });
    });
    test('checkin-bemerkung', async ({ page }) => {
      const answers = { stimmung: 6, stress: 3, energie: 5, schlaf: 8, beschwerden: 4, soziale_batterie: 6, reizueberflutung: 4, verbundenheit: 7 };
      await start(page, theme, { 'ci-draft': JSON.stringify({ date: '2026-10-11', kurz: false, step: 13, answers }) });
      await page.click('nav button[data-tab=checkin]'); await page.click('#ci-step button.primary:text("Speichern")');
      await expect(page.locator('#ci-step .remarks li').first()).toBeVisible(); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-checkin-bemerkung.png`, shot);
    });
    test('notiz-beobachtung-aufgabe', async ({ page }) => {
      await start(page, theme);
      await page.click('[data-go=note]'); await expect(page.locator('#n-text')).toBeFocused(); await page.fill('#n-text', 'Eine Notiz'); await page.fill('#n-time', '20:00'); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-notiz.png`, shot);
      await page.click('nav button[data-tab=heute]'); await page.click('[data-go=symptom]');
      await page.locator('#s-areas .pill').first().click(); await page.locator('#s-scale button').nth(4).click(); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-beobachtung.png`, { ...shot, fullPage: true });
      await page.click('nav button[data-tab=heute]'); await page.click('[data-go=newtask]');
      await expect(page.locator('#t-text')).toBeFocused(); // the form focuses the text after 50 ms
      await page.waitForSelector('#t-page-list .pl-item'); await page.fill('#t-page-q', 'wohnung'); await page.fill('#t-due', '2026-11-02');
      await page.mouse.move(0, 0); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-aufgabe.png`, shot);
    });
    test('meldung-und-sperre', async ({ page }) => {
      await start(page, theme);
      await page.click('nav button[data-tab=offen]'); await page.waitForSelector('#o-list .task');
      await page.locator('#o-list .task').first().locator('.tick').click(); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-rueckgaengig.png`, shot);
      await page.click('.msgbtn');
      await page.evaluate(() => document.body.classList.add('locked')); await settle(page);
      await expect(page).toHaveScreenshot(`${theme}-sperre.png`, shot);
    });
  });
}
