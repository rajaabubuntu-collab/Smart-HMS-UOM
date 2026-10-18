import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { testPassword } from '../../server/test/helpers.js';
const origin = 'http://localhost:5174';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page).toHaveURL(/dashboard$/);
}
test('doctor search, department details and selected doctor survive the sign-in journey', async ({
  page,
  request,
}) => {
  // Published synthetic fixtures are scoped to this test; the booking lookup uses a real test doctor.
  const signedIn = await request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { email: 'patient@test.local', password: testPassword },
  });
  expect(signedIn.ok()).toBeTruthy();
  const response = await request.get('/api/directory/doctors');
  const directory = await response.json();
  const doctor = directory.items?.[0] || directory.doctors?.[0];
  expect(doctor).toBeTruthy();
  const id = doctor._id || doctor.id;
  const departmentId = doctor.department._id;
  const profile = {
    _id: id,
    name: 'Test doctor',
    department: 'General Medicine',
    departmentId,
    specialization: 'General Medicine',
    qualification: 'Test qualification',
    consultationFeeMinor: 250000,
  };
  await page.route('**/api/public/doctors?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    const items =
      query && !'test doctor general medicine'.includes(query.toLowerCase()) ? [] : [profile];
    return route.fulfill({ json: { items, total: items.length, page: 1, limit: 20 } });
  });
  await page.route(`**/api/public/doctors/${id}`, (route) =>
    route.fulfill({ json: { doctor: profile } }),
  );
  const department = {
    _id: departmentId,
    name: 'General Medicine',
    description: 'Approved synthetic service description.',
  };
  await page.route('**/api/public/departments?*', (route) =>
    route.fulfill({ json: { items: [department], total: 1, page: 1, limit: 20 } }),
  );
  await page.route(`**/api/public/departments/${departmentId}`, (route) =>
    route.fulfill({ json: { department } }),
  );
  await page.goto('/doctors');
  await page.getByLabel('Doctor name or speciality').fill('missing');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching doctors' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'Test doctor' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel('Department', { exact: true }).selectOption(departmentId);
  await expect(page).toHaveURL(new RegExp(`department=${departmentId}`));
  await page.getByRole('link', { name: 'View doctor profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test doctor');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'General Medicine', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('General Medicine');
  await expect(page.getByText(department.description)).toBeVisible();
  await page.getByRole('link', { name: 'View doctor profile' }).click();
  await page.getByRole('link', { name: 'Check availability' }).click();
  await expect(page).toHaveURL(/login$/);
  // Switching to registration and back must not discard the selected doctor.
  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/register$/);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page).toHaveURL(new RegExp(`/book\\?doctor=${id}$`));
  await expect(page.locator('.doctor-option.selected')).toContainText('Test doctor');
});
test('visitor enquiry reaches reception inbox and status changes persist', async ({ page }) => {
  await page.goto('/contact');
  await page.getByLabel('Your name').fill('Website Browser Visitor');
  await page.getByLabel('Email address').fill('website-visitor@test.local');
  await page.getByLabel('Phone number (optional)').fill('0771234567');
  await page.getByLabel('Enquiry topic').selectOption('visiting');
  await page
    .getByRole('textbox', { name: 'Message', exact: true })
    .fill('Please help with directions to the reception entrance.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your enquiry has been received.');
  const reference = await page.locator('.hospital-enquiry-reference').innerText();
  expect(reference).toMatch(/^ENQ-/);
  await login(page, 'receptionist');
  await page.getByRole('link', { name: 'Website enquiries' }).click();
  const card = page.locator('.hospital-inbox article').filter({ hasText: reference });
  await expect(card).toContainText('Website Browser Visitor');
  await expect(card).toContainText('+94771234567');
  await card.getByLabel('Update enquiry status').selectOption('resolved');
  await card.getByRole('button', { name: 'Save status' }).click();
  await expect(card.locator('.status-pill')).toHaveText('Resolved');
  await page.reload();
  await expect(card.locator('.status-pill')).toHaveText('Resolved');
  await page.getByLabel('Enquiry status', { exact: true }).selectOption('new');
  await expect(card).toHaveCount(0);
});
test('public pages stay accessible, translated and usable on narrow screens without a session', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) => route.abort());
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/about', '/contact', '/doctors', '/departments']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    for (const language of ['en', 'si', 'ta']) {
      await page.locator('#hms-language').selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBeTruthy();
      }
      if (language !== 'en')
        await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(
          /^(About us|Contact us|Doctors & services|Our departments)$/,
        );
    }
    await page.locator('#hms-language').selectOption('en');
  }
  await page.goto('/contact');
  await page.getByRole('link', { name: 'Patient guide', exact: true }).click();
  await expect(page.locator('#visitor-guide')).toBeInViewport();
  expect(errors).toEqual([]);
});
