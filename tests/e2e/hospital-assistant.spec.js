import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('visitor chat handles loading, follow-ups, medical boundaries, failures and clear without leaving the homepage', async ({
  page,
}) => {
  const requests = [];
  let release;
  await page.route('**/api/public/assistant', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (body.message === 'Where is the hospital?') {
      await new Promise((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        json: {
          mode: 'information',
          facts: [
            {
              id: 'hospital',
              title: 'Hospital information',
              text: '{details}',
              values: { details: 'Test hospital\nColombo 09' },
              href: '/contact',
            },
          ],
        },
      });
    } else if (body.message === 'What medicine should I take?') {
      await route.fulfill({ json: { mode: 'medical', facts: [] } });
    } else if (body.message === 'Connection test') {
      await route.abort();
    } else
      await route.fulfill({
        json: {
          mode: 'information',
          facts: [
            {
              id: 'hours',
              title: 'Reception opening hours',
              text: 'Doctor appointments follow their published schedules.',
              hours: [],
              allDay: true,
              href: '/#hospital-info',
            },
          ],
        },
      });
  });
  await page.goto('/');
  const launch = page.getByRole('button', { name: 'Ask Smart HMS', exact: true });
  await launch.click();
  const panel = page.getByRole('dialog', { name: 'Hospital assistant' });
  const input = page.getByLabel('Your question');
  await expect(input).toBeFocused();
  await expect(panel).toContainText('Questions are sent to Groq');
  await input.fill('Where is the hospital?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByRole('status')).toContainText('Checking hospital information');
  release();
  await expect(panel).toContainText('Test hospital');
  await input.fill('What about hours?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel).toContainText('Reception open 24/7');
  expect(requests[1].history).toEqual(['Where is the hospital?']);
  await input.fill('What medicine should I take?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel).toContainText('cannot assess symptoms');
  await input.fill('Connection test');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(panel.getByRole('alert')).toContainText('Cannot reach Smart HMS');
  await expect(input).toHaveValue('Connection test');
  await page.screenshot({ path: '.local/screenshots/hospital-assistant-desktop.png' });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(panel).not.toContainText('Test hospital');
  await expect(input).toBeFocused();
  await input.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(launch).toBeFocused();
  await page.goto('/about');
  await expect(launch).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test('chat fits narrow screens in all languages and provides accessible controls', async ({
  page,
}) => {
  await page.route('**/api/public/assistant', (route) =>
    route.fulfill({ json: { mode: 'unavailable', facts: [] } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const language of ['en', 'si', 'ta']) {
    await page.locator('#hms-language').selectOption(language);
    await page.locator('.hospital-assistant-launcher').click();
    const panel = page.locator('.hospital-assistant-panel');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const box = await panel.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }
    await page.locator('.hospital-assistant-suggestions button').first().click();
    await expect(panel.locator('.hospital-assistant-turn')).toHaveCount(1);
    if (language !== 'en')
      await expect(panel).not.toContainText('AI help is temporarily unavailable');
    const accessibility = await new AxeBuilder({ page })
      .include('.hospital-assistant-panel')
      .analyze();
    expect(
      accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact)),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.local/screenshots/hospital-assistant-${language}.png` });
    await panel.locator('.hospital-assistant-actions button').first().click();
    await panel.locator('.hospital-assistant-close').click();
  }
});

// Real scheduling/auth endpoints; only the model's public answer is substituted.
for (const stale of [false, true]) {
  test(`assistant time choice survives sign-in and ${stale ? 'rejects a stale time' : 'is rechecked before confirmation'}`, async ({
    page,
    request,
  }) => {
    const { testPassword } = await import('../../server/test/helpers.js');
    const { hospitalDate } = await import('../../server/src/scheduling/time.js');
    const headers = { Origin: 'http://localhost:5174' };
    expect(
      (
        await request.post('http://127.0.0.1:4100/api/auth/login', {
          headers,
          data: { email: 'admin@test.local', password: testPassword },
        })
      ).ok(),
    ).toBeTruthy();
    const { items } = await (
      await request.get('http://127.0.0.1:4100/api/directory/doctors')
    ).json();
    const doctor = items.find((item) => item.name === 'Test doctor');
    const date = hospitalDate(new Date(Date.now() + (stale ? 61 : 60) * 86400000));
    const schedule = await request.post('http://127.0.0.1:4100/api/schedules', {
      headers,
      data: { doctor: doctor.id, date, startTime: '09:00', endTime: '10:00', slotMinutes: 15 },
    });
    expect(schedule.status()).toBe(201);
    const { slots } = await (
      await request.get(
        `http://127.0.0.1:4100/api/directory/doctors/${doctor.id}/availability?date=${date}`,
      )
    ).json();
    const slot = { ...slots[0], id: stale ? 'b'.repeat(24) : slots[0].id };
    const href = `/book?${new URLSearchParams({ doctor: doctor.id, date, slot: slot.id })}`;
    const response = {
      mode: 'information',
      reply: 'Here is the matching demonstration doctor. Choose a time to review your appointment.',
      context: 'signed-test-context',
      facts: [],
      total: 1,
      status: 'checked',
      checkedAt: new Date().toISOString(),
      filters: { date, period: 'morning' },
      doctors: [
        {
          ...doctor,
          department: doctor.department.name,
          demo: true,
          href: `/doctors/${doctor.id}`,
          bookingHref: `/book?doctor=${doctor.id}&date=${date}`,
          slots: [{ ...slot, href }],
        },
      ],
    };
    const questions = [];
    await page.route('**/api/public/assistant', (route) => {
      questions.push(route.request().postDataJSON());
      return route.fulfill({ json: response });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Ask Smart HMS', exact: true }).click();
    await page.getByLabel('Your question').fill('Find a general medicine doctor');
    await page.getByRole('button', { name: 'Send question' }).click();
    const panel = page.getByRole('dialog', { name: 'Hospital assistant' });
    await expect(panel).toContainText('Demonstration information');
    await expect(panel).toContainText('Here is the matching demonstration doctor');
    await page.getByLabel('Your question').fill('The first doctor tomorrow morning');
    await page.getByRole('button', { name: 'Send question' }).click();
    await expect(panel.locator('.hospital-assistant-doctor')).toHaveCount(2);
    expect(questions[1].context).toBe('signed-test-context');
    await page.setViewportSize({ width: 390, height: 844 });
    const violations = (
      await new AxeBuilder({ page }).include('.hospital-assistant-panel').analyze()
    ).violations;
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
    await page.screenshot({
      path: `.local/screenshots/assistant-doctor-${stale ? 'stale' : 'available'}.png`,
    });
    await panel
      .getByRole('link', { name: /Choose time:/ })
      .last()
      .click();
    await expect(page).toHaveURL(/\/login$/);
    // Switching to registration and back must retain the same destination.
    await page.getByRole('link', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
    await page.getByLabel('Email address').fill('patient@test.local');
    await page.getByLabel(/^Password/).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(page).toHaveURL(
      new RegExp(`/book\\?doctor=${doctor.id}&date=${date}&slot=${slot.id}$`),
    );
    await expect(page.getByLabel('Appointment date')).toHaveValue(date);
    if (stale) {
      await expect(
        page.getByText('The time you chose is no longer available. Please select another time.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeDisabled();
      await expect(page.locator('.slot-option[aria-pressed="true"]')).toHaveCount(0);
    } else {
      await expect(page.locator('.slot-option[aria-pressed="true"]')).toContainText('09:00');
      await expect(page.getByRole('button', { name: 'Confirm appointment' })).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'You’re booked in.' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Confirm appointment' }).click();
      await expect(page.getByRole('heading', { name: 'You’re booked in.' })).toBeVisible();
    }
  });
}
