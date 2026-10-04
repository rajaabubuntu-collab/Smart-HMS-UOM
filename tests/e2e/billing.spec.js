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
async function openBill(page) {
  await page.goto('/billing');
  await page.getByLabel('Search bills').fill('HMS-BILLINGTEST');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .locator('.billing-row')
    .filter({ hasText: 'HMS-BILLINGTEST' })
    .getByRole('link', { name: 'View bill' })
    .click();
  await expect(page.getByRole('heading', { name: 'Bill & payment statement' })).toBeVisible();
}
test('staff generate and revise a bill, record partial payments; patient sees history and admin reverses an error', async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page, 'receptionist');
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'All appointments', exact: true }).click();
  await page
    .locator('.appointment-row')
    .filter({ hasText: 'HMS-BILLINGTEST' })
    .getByRole('link', { name: 'Billing', exact: true })
    .click();
  await page.getByRole('button', { name: 'Generate missing bill' }).click();
  await page.getByLabel('Reason / billing note').fill('Generate historical visit bill');
  await page.getByRole('button', { name: 'Generate bill', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'View bill' }).click();
  await page.getByRole('button', { name: 'Edit charges / due date' }).click();
  await page.getByRole('button', { name: 'Add service charge' }).click();
  await page.getByLabel(/^Description/).fill('Synthetic service');
  await page.getByLabel(/^Quantity/).fill('3');
  await page.getByLabel(/^Unit price/).fill('100.25');
  await page.getByLabel('Due date').fill('2000-01-01');
  await page.getByLabel('Reason / billing note').fill('Itemise associated service');
  await page.getByRole('button', { name: 'Save bill changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.billing-totals')).toContainText('2,800.75');
  await expect(page.locator('.status-pill')).toHaveText('Overdue');
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel(/^Amount received/).fill('1000.25');
  await expect(page.getByRole('button', { name: 'Confirm received payment' })).toBeDisabled();
  await page.getByLabel('I confirm this payment has been received.').check();
  await page.getByRole('button', { name: 'Confirm received payment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.billing-totals')).toContainText('1,800.50');
  await expect(page.getByRole('button', { name: 'Edit charges / due date' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Payment method').selectOption('Bank transfer');
  await page.getByLabel(/^Payment reference/).fill('SYNTHETIC-TRANSFER');
  await page.getByLabel('I confirm this payment has been received.').check();
  await page.getByRole('button', { name: 'Confirm received payment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.status-pill')).toHaveText('Paid');
  await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/screenshots/bill-desktop.png', fullPage: true });
  await logout(page);
  await login(page, 'patient');
  await openBill(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('SYNTHETIC-TRANSFER', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: '.local/screenshots/bill-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print statement' })).toBeHidden();
  await page.pdf({
    path: '.local/screenshots/bill-statement.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await logout(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'admin');
  await openBill(page);
  await page.getByRole('button', { name: 'Reverse record' }).first().click();
  await page.getByLabel('Reason for reversal').fill('Correct synthetic entry recorded in error');
  await page.getByRole('button', { name: 'Confirm reversal' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.status-pill')).toContainText('Overdue');
  await expect(page.locator('.billing-totals')).toContainText('1,000.25');
  await expect(page.getByText(/Reversed on/)).toBeVisible();
});
