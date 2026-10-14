import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';
import { hospitalDate } from '../../server/src/scheduling/time.js';
async function login(page, role) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(`${role}@test.local`);
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await expect(page.getByText('Live updates', { exact: true })).toBeVisible();
}

test('each role sees scoped dashboard charts with accessible data and mobile layout', async ({
  page,
}) => {
  for (const role of ['admin', 'doctor', 'receptionist', 'patient']) {
    await login(page, role);
    await expect(page.getByRole('heading', { name: 'Appointments by day' })).toBeVisible();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Net receipts (LKR)' })).toHaveCount(
      role === 'admin' ? 1 : 0,
    );
    const chart = page.getByRole('region', { name: 'Appointments by day', exact: true });
    await chart.getByText('View chart data', { exact: true }).click();
    await expect(chart.getByRole('row')).toHaveCount(8);
    if (role === 'admin')
      await page.screenshot({
        path: '.local/screenshots/charts-admin.png',
        fullPage: true,
        animations: 'disabled',
      });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'patient');
  await page.getByLabel('Chart period').selectOption('upcoming');
  await expect(page.getByRole('heading', { name: 'Appointment status' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/charts-patient-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('booking produces real-time notification and local email/SMS previews without page reload', async ({
  browser,
}) => {
  const patientContext = await browser.newContext(),
    adminContext = await browser.newContext();
  const patient = await patientContext.newPage(),
    admin = await adminContext.newPage();
  try {
    await login(patient, 'patient');
    const origin = 'http://localhost:5174';
    const updated = await patient.request.patch(`${origin}/api/patients/me`, {
      headers: { Origin: origin },
      data: {
        phone: '0771234567',
        address: 'Synthetic test address',
        emergencyContact: { name: '', phone: '', relationship: '' },
      },
    });
    expect(updated.status()).toBe(200);
    await patient.goto('/messages');
    await patient.getByLabel('Email updates', { exact: false }).check();
    await patient.getByLabel('SMS updates', { exact: false }).check();
    await patient.getByRole('button', { name: 'Save notification preferences' }).click();
    await expect(patient.getByRole('status')).toContainText('Notification preferences saved');
    await patient.goto('/notifications');
    await expect(patient.getByText('Live updates', { exact: true })).toBeVisible();
    await login(admin, 'admin');
    const doctors = await (await admin.request.get(`${origin}/api/directory/doctors`)).json();
    const doctor = doctors.items.find((d) => d.name === 'Test doctor');
    const date = hospitalDate(new Date(Date.now() + 40 * 86400000));
    const schedule = await admin.request.post(`${origin}/api/schedules`, {
      headers: { Origin: origin },
      data: { doctor: doctor.id, date, startTime: '15:00', endTime: '16:00', slotMinutes: 15 },
    });
    expect(schedule.status()).toBe(201);
    const availability = await (
      await patient.request.get(
        `${origin}/api/directory/doctors/${doctor.id}/availability?date=${date}`,
      )
    ).json();
    const booking = await patient.request.post(`${origin}/api/appointments`, {
      headers: { Origin: origin },
      data: { slot: availability.slots[0].id, reason: '' },
    });
    expect(booking.status()).toBe(201);
    const { appointment } = await booking.json();
    // Under five seconds proves this is not the 30-second notification poll.
    await expect(
      patient.locator('.notification-row').filter({ hasText: appointment.reference }),
    ).toBeVisible({ timeout: 5000 });
    await patient.goto('/messages');
    await expect(patient.getByText('Local preview — not sent', { exact: true })).toHaveCount(2, {
      timeout: 10000,
    });
    const email = patient.locator('.delivery-row').filter({ hasText: 'EMAIL ·' });
    await expect(email).toContainText(`Appointment confirmed | ${appointment.reference}`);
    await email.getByText('View local message preview', { exact: true }).click();
    await expect(email).toContainText('Doctor: Test doctor');
    await expect(email).toContainText('Consultation fee: LKR 2,500.00');
    await expect(email).toContainText('Sri Lanka time');
    const sms = patient.locator('.delivery-row').filter({ hasText: 'SMS ·' });
    await sms.getByText('View local message preview', { exact: true }).click();
    await expect(sms).toContainText('Smart HMS: You have a new update');
    await expect(sms).not.toContainText(appointment.reference);
    await patient.screenshot({
      path: '.local/screenshots/delivery-previews.png',
      fullPage: true,
      animations: 'disabled',
    });
    // A link opened from email while signed out should survive authentication.
    await patientContext.clearCookies();
    await patient.goto(`/appointments?selected=${appointment.id}`);
    await expect(patient).toHaveURL(/\/login$/);
    await patient.getByLabel('Email address').fill('patient@test.local');
    await patient.getByLabel(/^Password/).fill(testPassword);
    await patient.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(patient).toHaveURL(new RegExp(`/appointments\\?selected=${appointment.id}$`));
    await expect(patient.getByRole('dialog')).toContainText(appointment.reference);
    await admin.goto('/messages');
    await expect(admin.getByText('Local preview — not sent', { exact: true })).toHaveCount(2);
  } finally {
    await patientContext.close();
    await adminContext.close();
  }
});
