import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { testPassword } from '../../server/test/helpers.js';
const panel = (page) => page.getByRole('dialog', { name: 'My care assistant' });
async function login(page) {
  await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:5174' },
    data: { email: 'patient@test.local', password: testPassword },
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'My care assistant', exact: true }).click();
}
test('patient shortcuts retrieve real account data, stay through navigation and clear on logout', async ({
  page,
}) => {
  await login(page);
  const chat = panel(page);
  await chat.getByRole('button', { name: 'My appointments', exact: true }).click();
  await expect(chat.locator('.assistant-account-card').first()).toBeVisible();
  await expect(chat).toContainText('matching items in your account');
  await page.screenshot({ path: '.local/screenshots/patient-assistant-appointments-desktop.png' });
  const firstReference = await chat.locator('.assistant-account-card h3').first().innerText();
  const violations = (await new AxeBuilder({ page }).include('.hospital-assistant-panel').analyze())
    .violations;
  expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await chat
    .locator('.assistant-account-card')
    .first()
    .getByRole('link', { name: 'View details' })
    .click();
  await expect(page).toHaveURL(/\/appointments\?selected=/);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'My care assistant', exact: true }).click();
  await expect(chat).toContainText(firstReference);
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  expect(storage).not.toContain(firstReference);
  await chat.getByRole('button', { name: 'Bills & payments' }).click();
  await expect(chat.locator('.hospital-assistant-turn').last()).toContainText('matching items');
  await chat.getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.patient-assistant')).toHaveCount(0);
  await login(page);
  await expect(panel(page).locator('.hospital-assistant-turn')).toHaveCount(0);
});
test('consent, loading and department guidance work inside the mobile panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const chat = panel(page);
  await chat.getByLabel('Your question').fill('Show my unpaid bills');
  await chat.getByRole('button', { name: 'Send question' }).click();
  await expect(chat).toContainText('Enable AI understanding below');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/patient/assistant', async (route) => {
    await gate;
    await route.fulfill({ json: { mode: 'unavailable' } });
  });
  await chat.getByLabel('Use AI to understand my message.', { exact: false }).check();
  await chat.getByLabel('Your question').fill('Show my unpaid bills');
  await chat.getByRole('button', { name: 'Send question' }).click();
  await expect(chat.getByRole('status')).toHaveText('Checking your account…');
  release();
  await expect(chat).toContainText('AI understanding is unavailable');
  await chat.getByRole('button', { name: 'Department guide', exact: true }).click();
  await chat.getByLabel('Do any warning signs apply now?').selectOption('no');
  await chat.getByLabel('Primary symptoms').fill('I have a cough');
  await chat
    .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
    .check();
  await chat.getByRole('button', { name: 'Get department guidance' }).click();
  await expect(chat.locator('.assistant-guide-result').first()).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/patient-assistant-guide-mobile.png' });
  const box = await chat.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  const violations = (await new AxeBuilder({ page }).include('.hospital-assistant-panel').analyze())
    .violations;
  expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
});
test('private chat expires while idle and translated panels fit small screens', async ({
  page,
}) => {
  await page.clock.install();
  await login(page);
  await panel(page).getByRole('button', { name: 'My appointments', exact: true }).click();
  await expect(panel(page).locator('.assistant-account-card').first()).toBeVisible();
  await page.clock.fastForward(30 * 60000 + 1);
  await expect(panel(page).locator('.hospital-assistant-turn')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  for (const language of ['si', 'ta']) {
    await page.locator('#hms-language').selectOption(language);
    const chat = page.locator('#patient-assistant-panel');
    const box = await chat.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await chat.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/screenshots/patient-assistant-${language}-mobile.png` });
  }
});
