import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
import { hospitalDate } from '../../server/src/scheduling/time.js';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
const types = [
  'schedules',
  'consultations',
  'registrations',
  'demographics',
  'revenue',
  'billing',
  'workload',
  'departments',
  'feedback',
];
test('administrator generates all ten reports, sees applied periods and totals, and can recover from an error', async ({
  page,
}) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Reports & analytics', exact: true }).click();
  const results = page.getByRole('region', { name: 'Generated report' });
  await expect(
    results.getByRole('heading', { name: 'Daily appointments', exact: true }),
  ).toBeVisible();
  await expect(results).toContainText('HMS-BILLINGTEST');
  await expect(page.getByLabel('To date')).toHaveCount(0);
  for (const type of types) {
    await page.getByLabel('Report type').selectOption(type);
    await page.getByRole('button', { name: 'Generate report', exact: true }).click();
    await expect(page.getByText('Generating report…')).toHaveCount(0);
    const title = await page.getByLabel('Report type').locator('option:checked').textContent();
    await expect(results.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(results.locator('.report-metrics')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.getByLabel('Report type').selectOption('departments');
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(
    results.getByRole('heading', { name: 'Department utilisation', exact: true }),
  ).toBeVisible();
  await expect(results).toContainText('General Medicine');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/reports-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/reports-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('From date').fill('2020-01-01');
  await page.getByLabel('To date').fill('2020-01-01');
  await expect(
    page.getByText('Filters changed. Select Generate report to update the results below.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No records in this period' })).toBeVisible();
  await expect(results).toContainText('2020-01-01 to 2020-01-01');
  await page.route('**/api/admin/reports/departments?**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Report temporarily unavailable.' }),
    }),
  );
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Report temporarily unavailable');
  await page.unroute('**/api/admin/reports/departments?**');
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No records in this period' })).toBeVisible();
  await page.getByLabel('From date').fill('2020-01-01');
  await page.getByLabel('To date').fill('2022-01-01');
  await page.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('at most 366 days');
});
test('admin filters audit events, reads UTC timestamps and views read-only results on mobile', async ({
  page,
}) => {
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Audit log', exact: true }).click();
  await page.getByLabel('From date').fill(hospitalDate());
  await page.getByLabel('To date').fill(hospitalDate());
  await page.getByLabel('User name or user ID').fill('Test admin');
  await page.getByLabel('Action', { exact: true }).selectOption('login');
  await page.getByLabel('Module', { exact: true }).selectOption('authentication');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  const table = page.getByRole('region', { name: 'Audit events' });
  await expect(table).toContainText('Test admin');
  await expect(table).toContainText('UTC');
  await expect(table).not.toContainText('Test patient');
  await expect(table.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/audit-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByLabel('Search action, module or target').fill('unlikely-event-[literal]');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No audit events found' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(table).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/audit-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('patient, doctor and receptionist cannot access report or audit pages', async ({ page }) => {
  for (const role of ['patient', 'doctor', 'receptionist']) {
    await login(page, role);
    await expect(page.getByRole('link', { name: 'Reports & analytics', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: 'Audit log', exact: true })).toHaveCount(0);
    for (const path of ['/admin/reports', '/admin/audit']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});
