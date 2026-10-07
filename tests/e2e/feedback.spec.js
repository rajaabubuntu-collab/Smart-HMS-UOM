import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
async function logout(page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}
test('patient rates a completed visit, can retry a failed submission, and admin searches the saved feedback', async ({
  page,
}) => {
  await login(page, 'patient');
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const appointment = page.locator('.appointment-row').filter({ hasText: 'HMS-BILLINGTEST' });
  await appointment.getByRole('link', { name: 'Feedback', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My feedback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Leave feedback' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('radio', { name: '4 stars', exact: true }).check();
  const comment = 'Kind team [desk]. <script>alert(1)</script>';
  await page.getByLabel('Comment (optional)').fill(comment);
  await page.route('**/api/feedback', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Temporary test outage. Please retry.' }),
    }),
  );
  await page.getByRole('button', { name: 'Submit feedback', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporary test outage');
  await expect(page.getByLabel('Comment (optional)')).toHaveValue(comment);
  await expect(page.getByRole('radio', { name: '4 stars', exact: true })).toBeChecked();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: '.local/screenshots/feedback-form-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.unroute('**/api/feedback');
  await page.getByRole('button', { name: 'Submit feedback', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice-success')).toContainText('Your feedback has been submitted');
  await expect(page.locator('.feedback-card')).toContainText('4 / 5');
  await expect(page.locator('.feedback-comment')).toHaveText(comment);
  await expect(page.getByRole('button', { name: 'Leave feedback' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.feedback-comment')).toHaveText(comment);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/feedback-patient-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await logout(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Patient feedback', exact: true }).click();
  await page.getByLabel('Search feedback').fill('[desk]');
  await page.getByLabel('Star rating').selectOption('4');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.feedback-card')).toHaveCount(1);
  await expect(page.locator('.feedback-card')).toContainText('Test patient');
  await expect(page.locator('.feedback-comment')).toHaveText(comment);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/feedback-admin-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Star rating').selectOption('1');
  await expect(page.getByRole('heading', { name: 'No feedback found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.feedback-card')).toHaveCount(1);
});
test('feedback pages restrict staff access and show an empty result for an unavailable visit', async ({
  page,
}) => {
  await login(page, 'receptionist');
  await expect(page.getByRole('link', { name: 'Patient feedback', exact: true })).toHaveCount(0);
  for (const path of ['/feedback', '/admin/feedback']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
  await logout(page);
  await login(page, 'patient');
  await page.goto('/admin/feedback');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await page.goto('/feedback?appointment=000000000000000000000001');
  await expect(page.getByRole('heading', { name: 'No completed visits found' })).toBeVisible();
  await page.getByRole('link', { name: 'Show all completed visits' }).click();
  await expect(page.locator('.feedback-card').first()).toBeVisible();
});
