import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import { testPassword } from '../../server/test/helpers.js';
const origin = 'http://localhost:5174';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
}
test('language switch persists and keeps form values stable in Sinhala and Tamil', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#hms-language').selectOption('si');
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await expect(page.getByLabel('ඊමේල් ලිපිනය')).toBeVisible();
  await page.reload();
  await expect(page.locator('#hms-language')).toHaveValue('si');
  await page.locator('#hms-language').selectOption('ta');
  await expect(page.getByLabel('மின்னஞ்சல் முகவரி')).toBeVisible();
  await page.getByLabel('மின்னஞ்சல் முகவரி').fill('patient@test.local');
  await page.locator('input[name=password]').fill(testPassword);
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/dashboard$/);
  await expect(page.getByRole('heading', { name: 'வரவேற்கிறோம், Test.' })).toBeVisible();
  await page.goto('/billing');
  await expect(
    page.getByRole('heading', { name: 'எனது கட்டணப்பட்டியல்கள் மற்றும் செலுத்தல்கள்' }),
  ).toBeVisible();
  await page.locator('#billStatus').selectOption('Paid');
  await expect(page.locator('#billStatus')).toHaveValue('Paid');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/tamil-public-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy();
});
test('public recovery resets a separate account and does not expose the token in the URL', async ({
  page,
  request,
}) => {
  const email = `recovery-${Date.now()}@test.local`;
  await request.post('/api/auth/register', {
    headers: { Origin: origin },
    data: {
      name: 'Recovery Test',
      email,
      password: testPassword,
      dateOfBirth: '2000-01-01',
      gender: 'other',
    },
  });
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an active account matches');
  let link;
  await expect
    .poll(
      async () => {
        for (const name of await readdir('.local/e2e-reset-mail').catch(() => [])) {
          const mail = JSON.parse(await readFile(`.local/e2e-reset-mail/${name}`, 'utf8'));
          if (mail.to === email && mail.subject.startsWith('Reset'))
            link = mail.text.match(/http[^\s]+/)[0];
        }
        return Boolean(link);
      },
      { timeout: 15000 },
    )
    .toBeTruthy();
  await page.goto(link);
  await expect(page).toHaveURL(/reset-password$/);
  await page
    .getByRole('textbox', { name: 'New password', exact: true })
    .fill('Changed-browser-password-42!');
  await page.getByLabel('Confirm password').fill('Changed-browser-password-42!');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status')).toContainText('Password changed');
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel(/^Password/).fill('Changed-browser-password-42!');
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Recovery.' })).toBeVisible();
});
test('administrator edits and publishes directory entries, and opens complete report print view', async ({
  page,
}) => {
  await login(page, 'admin');
  await page.goto('/admin/departments');
  const row = page
    .locator('.department-row')
    .filter({ has: page.getByRole('heading', { name: 'General Medicine', exact: true }) });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Public website visibility').selectOption('true');
  await page.getByLabel('Reason for department change').fill('Synthetic approval for browser test');
  await page.getByRole('button', { name: 'Save department' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/admin/staff');
  await page
    .locator('.staff-row')
    .filter({ has: page.getByRole('heading', { name: 'Test doctor', exact: true }) })
    .getByRole('button', { name: 'Publish approved profile' })
    .click();
  await expect(page.getByRole('button', { name: 'Unpublish profile' })).toBeVisible();
  await page.goto('/doctors');
  await expect(page.getByRole('heading', { name: 'Test doctor', exact: true })).toBeVisible();
  await page.goto('/admin/reports');
  await expect(page.getByRole('link', { name: 'Download CSV' })).toBeVisible();
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Print / save PDF' }).click();
  const print = await popup;
  await expect(print.getByRole('heading', { name: /Smart HMS.*Daily appointments/ })).toBeVisible();
  await expect(print.locator('tbody tr').first()).toBeVisible();
  await print.close();
  await page.goto('/admin/patients');
  await expect(page.getByRole('heading', { name: 'Patient accounts', exact: true })).toBeVisible();
});
test('automated WCAG checks on public, login, recovery and doctor workspace', async ({
  page,
}, testInfo) => {
  for (const path of ['/', '/login', '/forgot-password', '/doctors']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    await testInfo.attach(`accessibility-${path.replaceAll('/', '') || 'home'}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
    expect
      .soft(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
        path,
      )
      .toEqual([]);
  }
  await login(page, 'doctor');
  await page.goto('/queue');
  await expect(page.getByRole('heading', { name: 'Daily timeline' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach('accessibility-queue', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([]);
});
