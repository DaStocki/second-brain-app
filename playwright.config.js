// @ts-check
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 7'],
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    // Locally an existing Chromium can be used instead of a download: PW_CHROMIUM=/path/to/chrome
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: { command: 'node tests/serve.js', port: 4173, reuseExistingServer: !process.env.CI },
});
