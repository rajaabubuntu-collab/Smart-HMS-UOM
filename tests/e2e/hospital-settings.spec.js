import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
async function login(page, role = 'admin') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}

test('admin saves private drafts, publishes 24/7 details and handles conflicting edits', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const visitor = await browser.newContext();
  const publicPage = await visitor.newPage();
  try {
    await login(page);
    await page.getByRole('link', { name: 'Hospital settings', exact: true }).click();
    await page.getByLabel('Hospital name', { exact: true }).fill('Synthetic Hospital');
    await page.getByLabel('Hospital address', { exact: true }).fill('Synthetic address, Colombo');
    await page.getByLabel('Reception phone', { exact: true }).fill('0112345678');
    await page.getByLabel('Public email (optional)', { exact: true }).fill('reception@test.local');
    await page
      .getByLabel('Hospital description', { exact: true })
      .fill('Plain text <strong>description</strong>');
    await page.getByRole('button', { name: 'Set all days to open 24 hours' }).click();
    await page.getByLabel('Mark this as demonstration information').uncheck();
    await expect(page.getByRole('button', { name: 'Publish saved details' })).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved. The public website has not changed.')).toBeVisible();
    await expect(page.getByLabel('Reception phone', { exact: true })).toHaveValue('+94112345678');
    await publicPage.goto('/');
    await expect(publicPage.getByText(/A real hospital’s address/)).toBeVisible();
    await expect(
      publicPage.getByRole('heading', { name: 'Synthetic Hospital', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Publish saved details' }).click();
    await expect(page.getByText('Hospital details published to the public website.')).toBeVisible();
    await publicPage.reload();
    await expect(
      publicPage.getByRole('heading', { name: 'Synthetic Hospital', exact: true }),
    ).toBeVisible();
    await expect(publicPage.getByText('Open 24 hours', { exact: true })).toHaveCount(7);
    await expect(publicPage.getByRole('link', { name: '+94112345678' })).toHaveAttribute(
      'href',
      'tel:+94112345678',
    );
    await expect(publicPage.getByRole('link', { name: 'reception@test.local' })).toHaveAttribute(
      'href',
      'mailto:reception@test.local',
    );
    await expect(
      publicPage.getByText('Plain text <strong>description</strong>', { exact: true }),
    ).toBeVisible();
    await expect(publicPage.locator('.hospital-details strong')).toHaveCount(0);
    await publicPage.evaluate(() => window.scrollTo(0, 0));
    await publicPage.screenshot({
      path: '.local/screenshots/hospital-published-desktop.png',
      fullPage: true,
      animations: 'disabled',
    });
    for (const width of [390, 320]) {
      await publicPage.setViewportSize({ width, height: 844 });
      expect(
        await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.locator('#hospital-info').screenshot({
      path: '.local/screenshots/hospital-published-mobile.png',
      animations: 'disabled',
    });
    const staleTab = await page.context().newPage();
    await staleTab.goto('/admin/settings');
    await expect(staleTab.getByLabel('Hospital name', { exact: true })).toHaveValue(
      'Synthetic Hospital',
    );
    await page.getByLabel('Hospital name', { exact: true }).fill('Revised draft hospital');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('Draft saved. The public website has not changed.')).toBeVisible();
    await publicPage.reload();
    await expect(
      publicPage.getByRole('heading', { name: 'Synthetic Hospital', exact: true }),
    ).toBeVisible();
    await staleTab.getByLabel('Hospital name', { exact: true }).fill('Conflicting hospital');
    await staleTab.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(staleTab.getByRole('alert')).toContainText('changed in another tab');
    await expect(staleTab.getByLabel('Hospital name', { exact: true })).toHaveValue(
      'Conflicting hospital',
    );
    await staleTab.getByRole('button', { name: 'Reload latest and discard my edits' }).click();
    await expect(staleTab.getByLabel('Hospital name', { exact: true })).toHaveValue(
      'Revised draft hospital',
    );
    await staleTab.close();
    await page.getByRole('button', { name: 'Unpublish details' }).click();
    await expect(
      page.getByText('Hospital details removed from the public website. Your draft is kept.'),
    ).toBeVisible();
    await publicPage.reload();
    await expect(publicPage.getByText(/A real hospital’s address/)).toBeVisible();
  } finally {
    // Keep the shared disposable browser database unpublished for later public-page tests.
    const response = await page.request.get('/api/admin/hospital-settings');
    if (response.ok()) {
      const data = await response.json();
      if (data.published)
        await page.request.post('/api/admin/hospital-settings/unpublish', {
          headers: { Origin: 'http://localhost:5174' },
          data: { version: data.version },
        });
    }
    await visitor.close();
  }
});

test('hospital settings fit mobile screens and patient access is denied', async ({ page }) => {
  await login(page);
  await page.goto('/admin/settings');
  await expect(page.getByLabel('Hospital name', { exact: true })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/hospital-settings-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'patient');
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});

test('public hospital information failure leaves portal navigation usable', async ({ page }) => {
  await page.route('**/api/public/hospital', (route) => route.abort());
  await page.goto('/');
  await expect(
    page.getByText('Hospital information is temporarily unavailable. Please try again later.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Patient portal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});
