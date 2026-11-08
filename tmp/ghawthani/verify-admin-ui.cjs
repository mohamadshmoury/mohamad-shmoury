const { chromium } = require('/Users/roaasoloh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/roaasoloh/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => sessionStorage.setItem('shmoury_ghawthani_admin_token', 'test-admin-token'));
  await page.route('**/rest/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' }));
  await page.route('**/functions/v1/ghawthani-admin', async (route) => {
    const body = route.request().postDataJSON();
    const programs = [
      { id: '11111111-1111-4111-8111-111111111111', dawra_id: null, slug: 'ghawthani', title: 'إجازة وشهادة دورة الغوثاني', course_subject: 'كيف تحفظ القرآن الكريم', instructor_name: 'د. يحيى الغوثاني', introduction: 'مقدمة', trust_statement: 'تُعتمد الإجابات على الأمانة.', is_active: true },
      { id: '22222222-2222-4222-8222-222222222222', dawra_id: null, slug: 'tajweed', title: 'إجازة وشهادة دورة التجويد', course_subject: 'أحكام التجويد', instructor_name: 'الشيخ محمد الشموري', introduction: 'مقدمة', trust_statement: 'تُعتمد الإجابات على الأمانة.', is_active: true },
    ];
    let payload = {};
    if (body.action === 'list_programs') payload = { programs };
    if (body.action === 'list_submissions') payload = { rows: [], count: 0, summary: { submissions: 0, ijazah_eligible: 0, certificate_only: 0, generation_failures: 0 } };
    if (body.action === 'list_templates') payload = { templates: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'الإدارة' }).click();
  await page.getByRole('button', { name: 'إجازات وشهادات' }).click();
  await page.getByRole('heading', { name: 'إجازات وشهادات', exact: true }).waitFor();
  const options = await page.locator('.gh-program-picker select option').allTextContents();
  if (options.length !== 2) throw new Error(`Expected 2 program choices, found ${options.length}`);
  await page.locator('.gh-program-picker select').selectOption('22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: /إعداد الدورات/ }).click();
  await page.getByRole('heading', { name: 'ربط الإجازات والشهادات بدورة' }).waitFor();
  await page.screenshot({ path: 'tmp/ghawthani/admin-programs-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  if (overflow.scrollWidth > overflow.clientWidth) throw new Error(`Horizontal overflow: ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: 'tmp/ghawthani/admin-programs-mobile.png', fullPage: true });
  if (errors.length) throw new Error(`Browser console errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ options, selected: await page.locator('.gh-program-picker select').inputValue(), overflow, consoleErrors: errors.length }, null, 2));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
