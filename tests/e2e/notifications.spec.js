import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
async function findReminder(page) {
  const row = page.locator('.notification-row').filter({ hasText: 'HMS-REMINDERTEST' });
  for (let current = 1; current <= 10; current += 1) {
    await expect(page.locator('.pager')).toContainText(`Page ${current} of`);
    if (await row.count()) return row;
    await page.getByRole('button', { name: 'Next page' }).click();
  }
  throw new Error('Reminder was not present in the notification history');
}
test('patient notification centre shows a real reminder, persists read state and opens the appointment', async ({
  page,
}) => {
  await login(page, 'patient');
  await expect(page.locator('.notification-bell')).toHaveAttribute('aria-label', /unread/);
  await page.locator('.notification-bell').click();
  const reminder = await findReminder(page);
  await expect(reminder).toContainText('Upcoming appointment');
  await reminder.getByRole('button', { name: 'Mark read', exact: true }).click();
  await page.reload();
  await findReminder(page);
  await expect(reminder.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible();
  await reminder.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await page.getByRole('button', { name: 'Unread only' }).click();
  await findReminder(page);
  await expect(reminder).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/notifications-desktop.png', fullPage: true });
  await reminder.getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog')).toContainText('HMS-REMINDERTEST');
  await page.goto('/notifications');
  await findReminder(page);
  await reminder.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await page.getByRole('button', { name: 'Unread only' }).click();
  await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
  await expect(page.locator('.notification-bell')).toHaveAttribute('aria-label', 'Notifications');
  await page.getByRole('button', { name: 'All notifications' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/notifications-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'doctor');
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
  await expect(page.getByText('HMS-REMINDERTEST')).toHaveCount(0);
});
