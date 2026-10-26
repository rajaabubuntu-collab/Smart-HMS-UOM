import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { testPassword } from '../../server/test/helpers.js';

test('staff dashboards support role actions, chart filters and responsive translated layouts', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/appointments-summary', (route) =>
    route.fulfill({
      json: {
        today: 12,
        waiting: 3,
        upcoming: 18,
        next: [
          {
            id: 'dashboard-preview',
            doctorName: 'Test clinician',
            patient: { name: 'Test patient' },
            startsAt: '2026-12-15T04:30:00.000Z',
            status: 'Scheduled',
          },
        ],
      },
    }),
  );
  for (const role of ['admin', 'doctor', 'receptionist']) {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(`${role}@test.local`);
    await page.getByLabel(/^Password/).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(page.locator('.staff-dashboard h1')).toHaveText('Welcome, Test.');
    await expect(page.locator('.appointment-stats strong')).toHaveText(['12', '3', '18']);
    await expect(page.locator('.upcoming-row')).toContainText('Test clinician');
    await expect(page.locator('.upcoming-row')).toHaveAttribute(
      'href',
      '/appointments?selected=dashboard-preview',
    );
    const primary = page.locator('.staff-primary-action');
    await expect(primary).toHaveAttribute('href', role === 'doctor' ? '/queue' : '/book');
    await expect(page.locator('.staff-shortcut-list a').first()).toHaveAttribute(
      'href',
      { admin: '/admin/staff', doctor: '/queue', receptionist: '/reception/patients' }[role],
    );
    await expect(page.locator('.analytics-chart').first()).toBeVisible();
    const response = page.waitForResponse(
      (r) => r.url().includes('/dashboard/analytics?window=upcoming') && r.ok(),
    );
    await page.getByLabel('Chart period').selectOption('upcoming');
    await response;
    await expect(page.locator('.analytics-chart').first()).toBeVisible();
    await page.locator('.analytics-chart summary').first().click();
    await expect(page.locator('.chart-data').first()).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).include('.staff-dashboard').analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    for (const language of ['en', 'si', 'ta']) {
      await page.locator('#hms-language').selectOption(language);
      for (const width of [375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(primary).toBeVisible();
        const overflow = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .map((el) => el.getAttribute('class') || el.tagName)
            .slice(0, 10),
        }));
        expect(
          overflow.scrollWidth,
          `${role} ${language} ${width}: ${JSON.stringify(overflow)}`,
        ).toBeLessThanOrEqual(width);
      }
    }
    await page.locator('#hms-language').selectOption('en');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.local/screenshots/dashboard-${role}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({
      path: `.local/screenshots/dashboard-${role}-mobile.png`,
      fullPage: true,
    });
    await primary.click();
    await expect(page).toHaveURL(role === 'doctor' ? /\/queue$/ : /\/book$/);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
