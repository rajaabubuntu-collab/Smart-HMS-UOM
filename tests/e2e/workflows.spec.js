import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';

async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
test('patient registration, profile persistence, route protection, and logout', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Browser Patient');
  await page.getByLabel('Email address').fill('browser-patient@test.local');
  await page.getByLabel('Date of birth').fill('2001-03-10');
  await page.getByLabel('Gender').selectOption('female');
  await page.getByLabel('Phone number').fill('0771234567');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByLabel('Confirm password').fill(testPassword);
  await page.getByRole('button', { name: 'Create patient account' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Browser.' })).toBeVisible();
  await page.getByRole('link', { name: 'Review my profile' }).click();
  await page.getByLabel('Address', { exact: true }).fill('Synthetic browser-test address');
  await page.getByLabel('Contact name').fill('Sample Parent');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await page.reload();
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue(
    'Synthetic browser-test address',
  );
  await page.goto('/admin/staff');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test('administrator creates a department and doctor through the UI', async ({ page }) => {
  await login(page, 'admin');
  await page.screenshot({ path: '.local/screenshots/admin-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Departments', exact: true }).click();
  await page.getByLabel('Department name').fill('Browser Cardiology');
  await page.getByLabel('Description', { exact: true }).fill('Synthetic test department');
  await page.getByRole('button', { name: 'Create department' }).click();
  await expect(page.getByRole('heading', { name: 'Browser Cardiology' })).toBeVisible();
  await page.getByRole('link', { name: 'Care team', exact: true }).click();
  await page.getByLabel('Full name').fill('Browser Doctor');
  await page.getByLabel('Email address').fill('browser-doctor@test.local');
  await page.getByLabel('Initial password').fill(testPassword);
  await page.getByLabel(/^Department/).selectOption({ label: 'Browser Cardiology' });
  await page.getByLabel('Specialisation').fill('Cardiology');
  await page.getByLabel('Consultation fee (LKR)').fill('3500.50');
  await page.getByRole('button', { name: 'Create staff account' }).click();
  await expect(page.getByRole('heading', { name: 'Browser Doctor' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('browser-doctor@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your clinical profile' })).toBeVisible();
  await expect(page.getByText('Browser Cardiology', { exact: true })).toBeVisible();
});
test('doctor and receptionist receive their own workspaces', async ({ page }) => {
  await login(page, 'doctor');
  await expect(page.getByRole('heading', { name: 'Your clinical profile' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Care team', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'receptionist');
  await expect(page.getByRole('heading', { name: 'Front desk overview' })).toBeVisible();
});
test('mobile navigation and profile form fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'patient');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/screenshots/patient-mobile.png', fullPage: true });
});
test('login errors are visible; password toggle works; login has no overflow', async ({ page }) => {
  await page.goto('/login');
  await page.screenshot({ path: '.local/screenshots/login-desktop.png', fullPage: true });
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill('wrong-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel(/^Password/)).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
