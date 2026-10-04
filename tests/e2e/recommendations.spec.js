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
async function describe(page, symptoms) {
  await page.goto('/recommendations');
  await page.getByLabel(/^Do any warning signs/).selectOption('no');
  await page.getByLabel(/^Primary symptoms/).fill(symptoms);
  await page.getByLabel(/^How long/).fill('2');
  await page
    .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
    .check();
  await page.getByRole('button', { name: 'Get department guidance' }).click();
}
test('patient gets an explained suggestion and books the selected doctor without copying symptom text', async ({
  page,
}) => {
  const day = hospitalDate(new Date(Date.now() + 40 * 86400000));
  await login(page, 'admin');
  await page.goto('/schedules');
  await page.getByRole('button', { name: 'Add a session' }).click();
  await page.getByRole('button', { name: /Test doctor.*General Medicine/ }).click();
  await page.getByLabel('Session date').fill(day);
  await page.getByLabel('Start time').fill('09:00');
  await page.getByLabel('End time').fill('10:00');
  await page.getByRole('button', { name: 'Publish session' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'patient');
  await describe(page, 'cough');
  await expect(
    page.getByRole('heading', { name: 'A possible department', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.guide-suggestion')).toContainText('Matched words: cough');
  await page.screenshot({
    path: '.local/screenshots/department-guide-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'View times with Test doctor' }).click();
  await expect(page.locator('.booking-summary')).toContainText('Test doctor');
  await expect(page.getByLabel('Department', { exact: true })).not.toHaveValue('');
  await page.getByLabel('Appointment date').fill(day);
  await page.getByRole('button', { name: /^09:00 am/ }).click();
  await expect(page.getByLabel(/Reason for visit/)).toHaveValue('');
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByRole('heading', { name: 'You’re booked in.' })).toBeVisible();
});
test('unclear, unavailable and emergency input suppress booking suggestions; mobile guide fits', async ({
  page,
}) => {
  await login(page, 'patient');
  await describe(page, 'unclear concern');
  await expect(
    page.getByRole('heading', { name: 'Contact hospital reception', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.guide-suggestion')).toHaveCount(0);
  await describe(page, 'ear pain');
  await expect(page.getByText(/not currently listed as an active department/)).toBeVisible();
  await describe(page, 'cough');
  await expect(page.locator('.guide-suggestion')).toBeVisible();
  await page.getByLabel('Additional comments (optional)').fill('chest pain');
  await expect(page.locator('.guide-suggestion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Get department guidance' }).click();
  await expect(
    page.getByRole('heading', { name: 'Routine booking suggestions stopped' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /View times with/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '1990', exact: true })).toHaveAttribute(
    'href',
    'tel:1990',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/department-guide-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.goto('/book?doctor=invalid');
  await expect(page.getByRole('link', { name: 'Browse doctors', exact: true })).toBeVisible();
});
