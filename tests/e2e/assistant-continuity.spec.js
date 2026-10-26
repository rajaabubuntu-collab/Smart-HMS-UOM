import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { testPassword } from '../../server/test/helpers.js';
const key = 'smart-hms:public-chat:v1';
const reply = {
  mode: 'information',
  reply: 'Reception can help you plan your hospital visit.',
  context: 'signed-test-context',
  facts: [
    {
      id: 'booking',
      title: 'Book appointment',
      text: 'Choose a doctor and an available time.',
      href: '/book',
    },
  ],
};
const launch = (page) => page.getByRole('button', { name: 'Ask Smart HMS', exact: true });
const panel = (page) => page.getByRole('dialog', { name: 'Hospital assistant' });
async function start(page) {
  await page.route('**/api/public/assistant', (route) => route.fulfill({ json: reply }));
  await page.goto('/');
  await launch(page).click();
  await page.getByLabel('Your question').fill('Help me plan a visit');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel(page)).toContainText(reply.reply);
}

test('public navigation, protected-page detour, back and refresh restore a minimised conversation and follow-up context', async ({
  page,
}) => {
  await start(page);
  await panel(page).getByRole('link', { name: 'View details' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(launch(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(panel(page)).toHaveCount(0);
  await launch(page).click();
  await expect(panel(page)).toContainText('Help me plan a visit');
  await page.reload();
  await expect(panel(page)).toHaveCount(0);
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
  await panel(page).getByRole('button', { name: 'Close assistant' }).click();
  await page.getByRole('link', { name: 'About us', exact: true }).first().click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(panel(page)).toHaveCount(0);
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
  await page.route('**/api/public/assistant', async (route) => {
    expect(route.request().postDataJSON().context).toBe('signed-test-context');
    expect(route.request().postDataJSON().history).toEqual(['Help me plan a visit']);
    await route.fulfill({ json: reply });
  });
  await page.getByLabel('Your question').fill('What should I do next?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel(page).locator('.hospital-assistant-turn')).toHaveCount(2);
  for (const path of ['/doctors', '/departments', '/contact']) {
    await page.goto(path);
    await expect(panel(page)).toHaveCount(0);
    await launch(page).click();
    await expect(panel(page)).toContainText('What should I do next?');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const violations = (await new AxeBuilder({ page }).include('.hospital-assistant-panel').analyze())
    .violations;
  expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await page.screenshot({ path: '.local/screenshots/chat-continuity-contact-mobile.png' });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(panel(page)).not.toContainText(reply.reply);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull();
  await page.reload();
  await launch(page).click();
  await expect(panel(page)).not.toContainText(reply.reply);
});

test('anonymous sign-in retains this visit; logout clears it and does not restore on reload', async ({
  page,
}) => {
  await start(page);
  await panel(page).getByRole('link', { name: 'View details' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(launch(page)).toHaveCount(0);
  await page.goto('/');
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
  await page.reload();
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull();
  await page.goto('/');
  await launch(page).click();
  await expect(panel(page)).not.toContainText(reply.reply);
});

test('a different authenticated account on reload cannot inherit another user conversation', async ({
  page,
}) => {
  await start(page);
  const headers = { Origin: 'http://localhost:5174' };
  await page.request.post('/api/auth/login', {
    headers,
    data: { email: 'patient@test.local', password: testPassword },
  });
  await page.reload();
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
  await page.request.post('/api/auth/login', {
    headers,
    data: { email: 'admin@test.local', password: testPassword },
  });
  await page.reload();
  await launch(page).click();
  await expect(panel(page)).not.toContainText(reply.reply);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull();
});

test('idle expiry clears an open chat and also discards an expired snapshot while returning from login', async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(29 * 60000);
  await expect(panel(page)).toContainText(reply.reply);
  await page.clock.fastForward(60001);
  await expect(panel(page)).not.toContainText(reply.reply);
  expect(await page.evaluate((key) => sessionStorage.getItem(key), key)).toBeNull();
  await page.getByLabel('Your question').fill('Help me with booking');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel(page)).toContainText(reply.reply);
  await panel(page).getByRole('link', { name: 'View details' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.clock.fastForward(30 * 60000 + 1);
  await page.goBack();
  await launch(page).click();
  await expect(panel(page)).not.toContainText(reply.reply);
});

test('storage blocked by the browser still allows same-tab route continuity', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Storage disabled');
      },
    });
  });
  await start(page);
  await panel(page).getByRole('link', { name: 'View details' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await launch(page).click();
  await expect(panel(page)).toContainText(reply.reply);
});
