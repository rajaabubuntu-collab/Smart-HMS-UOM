import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';

test('public homepage stays usable without session API and links to real entry points', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/auth/me', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A lot more care.');
  await expect(page.getByText('University project · Demonstration website')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create patient account' })).toHaveAttribute(
    'href',
    '/register',
  );
  await expect(page.getByRole('link', { name: 'Patient portal', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page).toHaveURL(/#your-visit$/);
  await expect(
    page.getByRole('heading', { name: 'Your visit. One step at a time.' }),
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/public-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'Patient portal', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/public-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.unroute('**/api/auth/me');
  await page.getByRole('link', { name: 'Create patient account' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get you started.' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('solid surfaces persists through login and public-to-workspace navigation', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Solid surfaces' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Patient portal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solid surfaces' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solid surfaces' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Hospital website', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My workspace', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Go to my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  const sidebar = await page.locator('.sidebar').boundingBox();
  const content = await page.locator('.main-shell').boundingBox();
  expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(content.x);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/records');
  await expect(page).toHaveURL(/\/login$/);
});
