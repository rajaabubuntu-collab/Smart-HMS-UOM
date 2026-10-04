import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Welcome, Test/ })).toBeVisible();
}
test('doctor completes a saved consultation, revises prescription and patient sees history on mobile', async ({
  page,
}) => {
  test.setTimeout(60000);
  await login(page, 'doctor');
  await page.goto('/queue');
  const row = page.locator('.clinical-queue-row').filter({ hasText: 'HMS-CLINICALTEST' });
  await expect(row).toContainText('Waiting');
  await page.screenshot({ path: '.local/screenshots/queue-desktop.png', fullPage: true });
  await row.getByRole('link', { name: 'Open patient' }).click();
  await expect(
    page.getByText('No allergies recorded. This does not confirm there are no allergies.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start consultation' }).click();
  await page
    .getByLabel('Consultation notes', { exact: true })
    .fill('Synthetic browser consultation notes.');
  await page.getByLabel('Diagnosis', { exact: true }).fill('Synthetic browser diagnosis');
  await page.getByLabel('Treatment plan').fill('Synthetic follow-up plan');
  await page.getByLabel('Reported current medications').fill('Patient reports none.');
  await page.getByLabel('Reason for no medication').fill('No medication for this synthetic test.');
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  await page.getByLabel('I have reviewed the reported allergies with the patient.').check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Consultation notes', { exact: true })).toHaveValue(
    'Synthetic browser consultation notes.',
  );
  await page.getByLabel('I have reviewed the reported allergies with the patient.').check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/screenshots/consultation-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Complete visit' }).click();
  await page.getByRole('button', { name: 'Confirm completion' }).click();
  await expect(
    page.getByRole('heading', { name: 'Completed consultation', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Consultation notes', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await page
    .getByLabel('Reason for no medication')
    .fill('Updated synthetic no-medication explanation.');
  await page
    .getByLabel('Reason for prescription change')
    .fill('Clarified the recorded explanation.');
  await page.getByLabel('I have reviewed the reported allergies with the patient.').check();
  await page.getByRole('button', { name: 'Save prescription revision' }).click();
  await expect(page.getByText('Prescription versions (2)')).toBeVisible();
  await page.goto('/queue');
  await expect(
    page.locator('.clinical-queue-row').filter({ hasText: 'HMS-CLINICALTEST' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, 'patient');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/records');
  await expect(page.getByText('Synthetic browser diagnosis', { exact: true })).toBeVisible();
  await page.getByText('Prescription versions (2)').click();
  await expect(page.getByText('Clarified the recorded explanation.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/screenshots/medical-records-mobile.png', fullPage: true });
  await page.goto('/billing');
  await expect(page.locator('.billing-row').filter({ hasText: 'HMS-CLINICALTEST' })).toContainText(
    'Pending',
  );
});
