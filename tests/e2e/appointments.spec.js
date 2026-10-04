import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
import { hospitalDate } from '../../server/src/scheduling/time.js';

const bookingDay = hospitalDate(new Date(Date.now() + 30 * 86400000));
const mobileDay = hospitalDate(new Date(Date.now() + 31 * 86400000));
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}
async function selectDoctor(page) {
  await page.getByRole('button', { name: /Test doctor.*General Medicine/ }).click();
}
async function publishSession(page, day) {
  await page.goto('/schedules');
  await page.getByRole('button', { name: 'Add a session' }).click();
  await expect(page.getByRole('button', { name: 'Publish session' })).toBeDisabled();
  await selectDoctor(page);
  await page.getByLabel('Session date').fill(day);
  await page.getByLabel('Start time').fill('09:00');
  await page.getByLabel('End time').fill('10:00');
  await page.getByRole('button', { name: 'Publish session' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Session published' })).toBeVisible();
}

test('admin publishes slots, patient books, receptionist reschedules, patient cancels', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await login(page, 'admin');
  await publishSession(page, bookingDay);
  await page.screenshot({ path: '.local/screenshots/schedules-desktop.png', fullPage: true });
  await logout(page);
  await login(page, 'patient');
  await page.goto('/book');
  await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeDisabled();
  await selectDoctor(page);
  await page.getByLabel('Appointment date').fill(bookingDay);
  await page.getByRole('button', { name: /^09:00 am/ }).click();
  await page.getByLabel('Reason for visit').fill('Synthetic test visit');
  await page.screenshot({ path: '.local/screenshots/booking-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByRole('heading', { name: 'You’re booked in.' })).toBeVisible();
  const reference = await page.locator('.confirmation-card .eyebrow').innerText();
  await page.getByRole('link', { name: 'View appointment' }).click();
  await expect(page.getByRole('dialog')).toContainText(reference);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await logout(page);
  await login(page, 'receptionist');
  await page.goto('/appointments');
  await page.getByLabel('Appointment date').fill(bookingDay);
  const row = page.locator('.appointment-row').filter({ hasText: reference });
  await row.getByRole('button', { name: 'Reschedule' }).click();
  await selectDoctor(page);
  await page.getByRole('dialog').getByLabel('Appointment date').fill(bookingDay);
  await page.getByRole('button', { name: /^09:15 am/ }).click();
  await page.getByLabel('Reason for rescheduling').fill('Patient requested a later slot');
  await page.getByRole('button', { name: 'Confirm new appointment time' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('09:15 am');
  await page.screenshot({ path: '.local/screenshots/appointments-desktop.png', fullPage: true });
  await logout(page);
  await login(page, 'patient');
  await page.goto('/appointments');
  await page
    .locator('.appointment-row')
    .filter({ hasText: reference })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await page.getByLabel('Cancellation reason').fill('Patient cancellation test');
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.appointment-row').filter({ hasText: reference })).toContainText(
    'Cancelled',
  );
  expect(errors).toEqual([]);
});

test('reception registers and books a walk-in without losing staff access', async ({ page }) => {
  test.setTimeout(45000);
  await login(page, 'admin');
  const day = hospitalDate(new Date(Date.now() + 32 * 86400000));
  await publishSession(page, day);
  await logout(page);
  await login(page, 'receptionist');
  await page.goto('/reception/patients');
  await page.getByRole('button', { name: 'Register walk-in' }).click();
  await page.getByLabel('Patient full name').fill('Walkin Browser');
  await page.getByLabel('Patient email').fill('walkin-browser@test.local');
  await page.getByLabel('Date of birth').fill('1990-05-20');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Initial password').fill(testPassword);
  await page.getByLabel('Reported allergies').fill('Sample reported allergy');
  await page.getByRole('button', { name: 'Create patient account' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Book for Walkin Browser' }).click();
  await expect(page.locator('.selected-patient')).toContainText('Walkin Browser');
  await selectDoctor(page);
  await page.getByLabel('Appointment date').fill(day);
  await page.getByRole('button', { name: /^09:00 am/ }).click();
  await page.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(page.getByRole('heading', { name: 'You’re booked in.' })).toBeVisible();
  await page.goto('/reception/patients');
  await page.getByLabel('Find a patient').fill('walkin-browser');
  await page.getByRole('button', { name: 'Search patients' }).click();
  await page.getByRole('button', { name: /Walkin Browser.*Select/ }).click();
  await page.getByRole('button', { name: 'Review patient record' }).click();
  await expect(page.getByLabel('Reported allergies')).toHaveValue('Sample reported allergy');
  await page.getByLabel('Patient phone').fill('0778888888');
  await page.getByRole('button', { name: 'Save patient record' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.user-label')).toContainText('receptionist');
});

test('reception checks in today’s patient; doctor sees Waiting in their appointments', async ({
  page,
}) => {
  await login(page, 'receptionist');
  await page.goto('/appointments');
  const row = page.locator('.appointment-row').filter({ hasText: 'HMS-ARRIVALTEST' });
  await row.getByRole('button', { name: 'Check in', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm check-in' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('Waiting');
  await expect(row.getByRole('button', { name: 'Check in', exact: true })).toHaveCount(0);
  await logout(page);
  await login(page, 'doctor');
  await page.goto('/appointments');
  await expect(
    page.locator('.appointment-row').filter({ hasText: 'HMS-ARRIVALTEST' }),
  ).toContainText('Waiting');
  await expect(page.getByRole('link', { name: 'Book appointment', exact: true })).toHaveCount(0);
});

test('mobile patient booking and schedule dialog fit the viewport', async ({ page }) => {
  await login(page, 'admin');
  await publishSession(page, mobileDay);
  await logout(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'patient');
  await page.goto('/book');
  await selectDoctor(page);
  await page.getByLabel('Appointment date').fill(mobileDay);
  await page.getByRole('button', { name: /^09:00 am/ }).click();
  await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/screenshots/booking-mobile.png', fullPage: true });
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'All appointments', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/screenshots/appointments-mobile.png', fullPage: true });
});

test('admin edits staff status and closes an unused session', async ({ page }) => {
  test.setTimeout(45000);
  await login(page, 'admin');
  await page.goto('/admin/staff');
  await page.getByLabel('Role', { exact: true }).selectOption('receptionist');
  await page.getByLabel('Full name').fill('Editable Staff');
  await page.getByLabel('Email address').fill('editable@test.local');
  await page.getByLabel('Initial password').fill(testPassword);
  await page.getByRole('button', { name: 'Create staff account' }).click();
  const row = page.locator('.staff-row').filter({ hasText: 'Editable Staff' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Account status').selectOption('false');
  await page.getByRole('button', { name: 'Save staff changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('Inactive');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Account status').selectOption('true');
  await page.getByRole('button', { name: 'Save staff changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).not.toContainText('Inactive');
  const day = hospitalDate(new Date(Date.now() + 33 * 86400000));
  await publishSession(page, day);
  await page.getByLabel('Filter by date').fill(day);
  await page.getByRole('button', { name: 'Close session', exact: true }).click();
  await page.getByLabel('Reason for closure').fill('Doctor unavailable');
  await page.getByRole('button', { name: 'Confirm session closure' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.session-row')).toContainText('Closed');
  await page.goto('/book');
  await selectDoctor(page);
  await page.getByLabel('Appointment date').fill(day);
  await expect(
    page.getByRole('heading', { name: 'No available slots on this date' }),
  ).toBeVisible();
});
