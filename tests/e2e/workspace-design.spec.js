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
  await page.screenshot({ path: '.local/screenshots/patient-behance-preview.png' });
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

test('patient overview uses personal totals and a working appointment calendar', async ({
  page,
}) => {
  let requestedDate;
  await page.route('**/api/billing/bills?*', (route) =>
    route.fulfill({ json: { records: [], total: 7, page: 1, limit: 1 } }),
  );
  await page.route('**/api/appointments-summary', (route) =>
    route.fulfill({
      json: {
        today: 1,
        waiting: 0,
        upcoming: 2,
        next: [
          {
            id: 'demo-next',
            doctorName: 'Test clinician',
            departmentName: 'General Medicine',
            startsAt: '2026-12-15T04:30:00.000Z',
            status: 'Scheduled',
          },
        ],
      },
    }),
  );
  await page.route('**/api/appointments?*', async (route) => {
    requestedDate = new URL(route.request().url()).searchParams.get('date');
    await route.fulfill({
      json: {
        items: requestedDate?.endsWith('-15')
          ? [
              {
                id: 'demo-day',
                doctorName: 'Test clinician',
                departmentName: 'General Medicine',
                startsAt: `${requestedDate}T04:30:00.000Z`,
                status: 'Scheduled',
              },
            ]
          : [],
        total: requestedDate?.endsWith('-15') ? 1 : 0,
      },
    });
  });
  await login(page, 'patient');
  await expect(page.locator('.patient-overview-shell')).toBeVisible();
  await expect(page.locator('.patient-metric strong')).toHaveText(['1', '0', '2', '7']);
  await expect(page.locator('.patient-metric').last()).toHaveAttribute('href', '/billing');
  await expect(page.locator('.patient-next')).toContainText('Test clinician');
  await expect(page.locator('.patient-next a')).toHaveAttribute(
    'href',
    '/appointments?selected=demo-next',
  );
  const calendar = page.getByRole('region', { name: 'Your appointment calendar' });
  await expect.poll(() => typeof requestedDate).toBe('string');
  const original = requestedDate;
  await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect.poll(() => requestedDate).not.toBe(original);
  await expect.poll(() => requestedDate?.slice(-2)).toBe('01');
  await calendar.locator('.patient-calendar-days button').filter({ hasText: /^15$/ }).click();
  await expect(calendar.locator('.patient-schedule-row')).toContainText('Test clinician');
  await expect(calendar.locator('.patient-schedule-row')).toHaveAttribute(
    'href',
    '/appointments?selected=demo-day',
  );
  await expect(calendar.locator('.patient-calendar-days button[aria-pressed="true"]')).toHaveText(
    '15',
  );
  await calendar.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect.poll(() => requestedDate?.slice(0, 7)).toBe(original.slice(0, 7));
  await calendar.getByRole('button', { name: 'Today', exact: true }).click();
  await expect.poll(() => requestedDate).toBe(original);
  await page.screenshot({
    path: '.local/screenshots/patient-enterprise-desktop.png',
    fullPage: true,
  });
  await page.locator('.patient-guide-feature a').click();
  await expect(page).toHaveURL(/\/recommendations$/);
  await expect(page.locator('.patient-overview-shell')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.locator('.patient-overview-shell')).toBeVisible();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.patient-calendar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `.local/screenshots/patient-enterprise-${width}.png`,
      fullPage: true,
    });
  }
});

test('the overview design is isolated from staff dashboards', async ({ page }) => {
  for (const role of ['admin', 'doctor', 'receptionist']) {
    await login(page, role);
    await expect(page.locator('.patient-overview-shell')).toHaveCount(0);
    await expect(page.locator('.patient-overview')).toHaveCount(0);
    await expect(page.locator('.welcome-banner')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});
