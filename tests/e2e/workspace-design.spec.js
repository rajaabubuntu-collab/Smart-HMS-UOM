import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { testPassword } from '../../server/test/helpers.js';

async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await expect(page.locator('.dashboard-analytics .loading')).toHaveCount(0);
}

test('patient quick actions and mobile navigation work in all three languages', async ({
  page,
}) => {
  await login(page, 'patient');
  await page.screenshot({ path: '.local/screenshots/care-workspace-desktop.png', fullPage: true });
  await page.locator('.workspace-quick-actions a[href="/records"]').click();
  await expect(page).toHaveURL(/\/records$/);
  await page.goto('/dashboard');
  await expect(page.locator('.workspace-quick-actions')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('.app-shell').analyze();
  expect(
    accessibility.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.locator('.workspace-mobile-nav');
  await expect(nav).toBeVisible();
  for (const language of ['en', 'si', 'ta']) {
    await page.locator('#hms-language').selectOption(language);
    for (const path of ['/appointments', '/recommendations', '/billing', '/dashboard']) {
      await nav.locator(`a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(nav.locator(`a[href="${path}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.screenshot({
      path: `.local/screenshots/care-workspace-${language}-mobile.png`,
      fullPage: false,
    });
  }
  await page.locator('#hms-language').selectOption('en');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/open/);
  await page.locator('.sidebar').getByRole('link', { name: 'My profile', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await page.getByRole('button', { name: 'Solid surfaces' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-surfaces', 'solid');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin keeps full workspace navigation with the shared card design', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.locator('.workspace-mobile-nav')).toHaveCount(0);
  await page.screenshot({ path: '.local/screenshots/care-workspace-admin.png', fullPage: true });
  await page.locator('.sidebar').getByRole('link', { name: 'Departments', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/departments$/);
  await expect(page.locator('main h1')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
