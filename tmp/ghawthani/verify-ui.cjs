const { chromium } = require('/Users/roaasoloh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/roaasoloh/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:5174/ejazaGhawthani', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'tmp/ghawthani/ui-desktop-form.png', fullPage: true });

  const selectedBefore = await page.locator('input[type="radio"]:checked').count();
  if (selectedBefore !== 0) throw new Error(`Attendance/gender answers were preselected: ${selectedBefore}`);
  await page.locator('.gh-form input:not([type])').first().fill('عبد الله نور الدين محمد الغوثاني');
  await page.locator('input[name="gender"]').nth(1).check({ force: true });
  for (const name of ['day1', 'day2', 'day3']) await page.locator(`input[name="${name}"]`).first().check({ force: true });
  await page.locator('.gh-acknowledgment input').check();
  await page.getByRole('button', { name: 'مراجعة البيانات قبل الإرسال' }).click();
  await page.getByRole('heading', { name: 'تأكد من الاسم والإجابات' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const preview = await page.locator('.gh-name-preview strong').textContent();
  if (preview !== 'عبد الله نور الدين محمد الغوثاني') throw new Error(`Review name mismatch: ${preview}`);
  await page.screenshot({ path: 'tmp/ghawthani/ui-desktop-review.png', fullPage: true });

  await page.getByRole('button', { name: 'تعديل البيانات' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tmp/ghawthani/ui-mobile-form.png', fullPage: true });
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  if (overflow.scrollWidth > overflow.clientWidth) throw new Error(`Horizontal overflow: ${JSON.stringify(overflow)}`);
  if (errors.length) throw new Error(`Browser console errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ selectedBefore, preview, overflow, consoleErrors: errors.length }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
