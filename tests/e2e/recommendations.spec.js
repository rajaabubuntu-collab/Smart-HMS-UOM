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
  await page.evaluate(() => window.scrollTo(0, 0));
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
  await page.getByText('Add more details (optional)', { exact: true }).click();
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

test('AI labels, quoted evidence and fallback notice are distinct in the patient UI', async ({
  page,
}) => {
  await login(page, 'patient');
  await page.route('**/api/recommendations/status', (route) =>
    route.fulfill({ json: { aiEnabled: true } }),
  );
  let fallback = false;
  await page.route('**/api/recommendations', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.source = fallback ? 'rules' : 'ai';
    data.fallback = fallback;
    if (!fallback) {
      data.explanation = 'AI identified a possible department from your description.';
      data.suggestions[0].matchedTerms = [];
      data.suggestions[0].evidence = ['cough'];
    }
    await route.fulfill({ json: data });
  });
  await describe(page, 'cough');
  await expect(page.getByText('AI-assisted department guide', { exact: true })).toBeVisible();
  await expect(page.getByText('AI-assisted guidance', { exact: true })).toBeVisible();
  await expect(page.locator('.guide-suggestion')).toContainText('From your description: “cough”');
  await expect(page.getByText('Matched words:', { exact: true })).toHaveCount(0);
  fallback = true;
  await describe(page, 'cough');
  await expect(page.getByText('Rule-based guidance', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/This result uses basic matching rules, not an AI recommendation/),
  ).toBeVisible();
  await expect(page.getByText('AI-assisted guidance', { exact: true })).toHaveCount(0);
});

test('local Ollama generates guidance through the real patient browser and API', async ({
  page,
}) => {
  test.skip(process.env.E2E_LOCAL_AI !== 'true', 'Opt-in local model smoke test');
  test.setTimeout(90000);
  await login(page, 'patient');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recommendations') && r.request().method() === 'POST',
  );
  await describe(page, 'I have been coughing for two days');
  const result = await (await response).json();
  expect(result.source).toBe('ai');
  expect(result.fallback).toBe(false);
  expect(result.aiStatus).toBe('ok');
  await expect(page.getByText('AI-assisted guidance', { exact: true })).toBeVisible();
  await expect(page.locator('.guide-suggestion')).toContainText('General Medicine');
  await expect(page.locator('.guide-suggestion')).toContainText('From your description:');
  await page.screenshot({ path: '.local/screenshots/department-ai-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/department-ai-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'View times with Test doctor' }).click();
  await expect(page.locator('.booking-summary')).toContainText('Test doctor');
  await expect(page.getByLabel(/Reason for visit/)).toHaveValue('');
  await describe(page, 'cough and chest pain');
  await expect(page.getByText('Safety and scope check', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Routine booking suggestions stopped' }),
  ).toBeVisible();
  await expect(page.locator('.guide-suggestion')).toHaveCount(0);
});

test('demo directory supports new specialties, real slots, profiles and form shortcuts', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_AI_DEMO !== 'true' || process.env.E2E_LOCAL_AI !== 'true',
    'Opt-in full demo directory and real model',
  );
  test.setTimeout(120000);
  await login(page, 'patient');
  await page.goto('/recommendations');
  await expect(page.locator('.guide-demo-panel summary')).toBeVisible();
  await expect(page.getByLabel('Example department').locator('option')).toHaveCount(19);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/screenshots/ai-guide-empty-desktop.png', fullPage: true });
  if (!(await page.locator('.guide-demo-panel').evaluate((el) => el.open)))
    await page.locator('.guide-demo-panel summary').click();
  await page.getByLabel('Example department').selectOption({ label: 'Endocrinology' });
  await expect(page.getByLabel(/^Primary symptoms/)).toHaveValue(
    'I would like a routine review for diabetes',
  );
  await page.getByLabel(/^Do any warning signs/).selectOption('no');
  await page
    .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
    .check();
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/recommendations') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Get department guidance' }).click();
  const result = await (await response).json();
  expect(result.source).toBe('ai');
  expect(result.outcome).toBe('matched');
  expect(result.suggestions[0].department.name).toBe('Endocrinology');
  await expect(page.locator('.guide-doctor')).toHaveCount(3);
  await expect(page.getByText('Fictional demo doctor', { exact: true })).toHaveCount(3);
  await page.locator('.guide-profile summary').first().click();
  await expect(
    page.getByText('Fictional clinician profile — demonstration only').first(),
  ).toBeVisible();
  await expect(page.locator('.guide-slot')).toHaveCount(9);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/screenshots/ai-guide-demo-desktop.png', fullPage: true });
  const link = page.locator('.guide-slot').first();
  const url = new URL(await link.getAttribute('href'), 'http://localhost');
  await link.click();
  await expect(page.getByLabel('Appointment date')).toHaveValue(url.searchParams.get('date'));
  await expect(page.locator('.booking-summary')).toContainText('(Demo)');
  await expect(page.getByLabel(/Reason for visit/)).toHaveValue('');
  // Re-enter on mobile to inspect keyboard-accessible controls without another inference.
  await page.goto('/recommendations');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  if (!(await page.locator('.guide-demo-panel').evaluate((el) => el.open)))
    await page.locator('.guide-demo-panel summary').click();
  await page.getByLabel('Example department').selectOption({ label: 'Cardiology' });
  await expect(page.getByLabel(/^Primary symptoms/)).not.toHaveValue('');
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByLabel(/^Primary symptoms/)).toHaveValue('');
  await expect(
    page.getByLabel(
      'I understand this is a department guide, not a diagnosis or emergency service.',
    ),
  ).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/ai-guide-demo-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('local AI understands everyday nose wording without guessing for vague or urgent concerns', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_AI_DEMO !== 'true' || process.env.E2E_LOCAL_AI !== 'true',
    'Opt-in full demo directory and real model',
  );
  test.setTimeout(150000);
  await login(page, 'patient');
  async function guidance(symptoms) {
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/api/recommendations') && r.request().method() === 'POST',
    );
    await describe(page, symptoms);
    return (await response).json();
  }
  const matched = await guidance('my nose hurt and itchy. ');
  expect(matched.source).toBe('ai');
  expect(matched.fallback).toBe(false);
  expect(matched.outcome).toBe('matched');
  expect(matched.suggestions[0].department.name).toBe('ENT');
  await expect(page.locator('.guide-doctor')).toHaveCount(3);
  await expect(page.getByText('AI-assisted guidance', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/screenshots/ai-nose-wording.png', fullPage: true });
  const vague = await guidance('itchy');
  expect(vague.outcome).toBe('staff');
  expect(vague.suggestions).toEqual([]);
  const urgent = await guidance('my nose hurt and itchy and I cannot breathe');
  expect(urgent.source).toBe('safety');
  expect(urgent.outcome).toBe('urgent');
  expect(urgent.suggestions).toEqual([]);
  await expect(page.locator('.guide-suggestion')).toHaveCount(0);
});

test('loading animation is cancellable, respects reduced motion and labels the thinking check', async ({
  page,
}) => {
  await login(page, 'patient');
  await page.route('**/api/recommendations/status', (route) =>
    route.fulfill({ json: { aiEnabled: true, thinkingEnabled: true } }),
  );
  let release;
  let waiting = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/recommendations', async (route) => {
    await waiting;
    await route
      .fulfill({
        json: {
          source: 'ai',
          outcome: 'staff',
          explanation: 'Please contact a clinician.',
          suggestions: [],
          thinkingAttempted: true,
          thinkingStatus: 'ok',
        },
      })
      .catch(() => {});
  });
  await describe(page, 'My ear feels blocked');
  const progress = page.getByRole('progressbar', { name: 'Checking your description' });
  await expect(progress).toBeVisible();
  await expect(page.getByText(/Elapsed: [1-9]\d* seconds/)).toBeVisible();
  await expect(page.getByText(/a second local model may review it/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get department guidance' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await progress.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().right))
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: '.local/screenshots/ai-thinking-loading-mobile.png',
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(progress.locator('span')).toHaveCSS('animation-name', 'none');
  await page.getByRole('button', { name: 'Cancel request' }).click();
  await expect(progress).toHaveCount(0);
  release();
  waiting = Promise.resolve();
  await page.getByRole('button', { name: 'Get department guidance' }).click();
  await expect(page.getByText(/A second local thinking model checked/)).toBeVisible();
  await expect(progress).toHaveCount(0);
});

test('Groq disclosure and consent control submission, with provider-aware loading and result labels', async ({
  page,
}) => {
  await login(page, 'patient');
  await page.route('**/api/recommendations/status', (route) =>
    route.fulfill({
      json: {
        aiEnabled: true,
        provider: 'groq',
        requiresCloudConsent: true,
        thinkingEnabled: false,
      },
    }),
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let sent;
  await page.route('**/api/recommendations', async (route) => {
    sent = route.request().postDataJSON();
    await gate;
    await route.fulfill({
      json: {
        source: 'ai',
        provider: 'groq',
        outcome: 'staff',
        suggestions: [],
        explanation: 'Please contact reception to choose a service.',
        disclaimer: 'Department guidance only.',
      },
    });
  });
  await page.goto('/recommendations');
  await expect(page.getByRole('heading', { name: 'Department guide', exact: true })).toBeVisible();
  await expect(page.getByLabel('Pain level (optional)')).toHaveCount(0);
  await expect(page.getByLabel(/^How long/)).toHaveCount(0);
  await page.screenshot({
    path: '.local/screenshots/groq-redesign-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByText('Add more details (optional)', { exact: true }).click();
  await page.getByLabel('Additional comments (optional)').fill('Fictional test description');
  await page.getByText('Add more details (optional)', { exact: true }).click();
  await page.getByLabel(/^Do any warning signs/).selectOption('no');
  await page.getByLabel(/^Primary symptoms/).fill('my nose hurt and itchy.');
  await page
    .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
    .check();
  const submit = page.getByRole('button', { name: 'Get department guidance' });
  const consent = page.getByLabel('I agree to send this description to Groq for AI guidance.');
  await expect(page.getByText('How your description is processed')).toBeVisible();
  await expect(submit).toBeDisabled();
  await consent.check();
  await submit.click();
  await expect(page.getByText(/^Groq is reviewing your description/)).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Checking your description' })).toBeVisible();
  await expect(page.getByText(/^The local model is reviewing/)).toHaveCount(0);
  await expect.poll(() => sent?.cloudConsent).toBe(true);
  expect(sent).not.toHaveProperty('painLevel');
  expect(sent).not.toHaveProperty('duration');
  expect(sent.comments).toBe('Fictional test description');
  release();
  await expect(page.getByText('Groq AI guidance', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '.local/screenshots/groq-guide-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(consent).not.toBeChecked();
  await expect(page.getByLabel('Pain level (optional)')).toHaveCount(0);
  await expect(page.getByLabel(/^How long/)).toHaveCount(0);
  await page.getByText('Add more details (optional)', { exact: true }).click();
  await expect(page.getByLabel('Additional comments (optional)')).toHaveValue('');
  await expect(submit).toBeDisabled();
  await page.locator('#symptoms').fill('Fictional description');
  for (const [language, heading] of [
    ['si', 'අංශ මාර්ගෝපදේශය'],
    ['ta', 'பிரிவு வழிகாட்டி'],
  ]) {
    await page.locator('#hms-language').selectOption(language);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.locator('#symptoms')).toHaveValue('Fictional description');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({
    path: '.local/screenshots/groq-redesign-tamil-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`guidance loading, results and errors stay in view at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, 'patient');
    await page.route('**/api/recommendations/status', (route) =>
      route.fulfill({ json: { aiEnabled: true, provider: 'groq' } }),
    );
    let release;
    let fail = false;
    await page.route('**/api/recommendations', async (route) => {
      await new Promise((resolve) => {
        release = resolve;
      });
      await route
        .fulfill(
          fail
            ? {
                status: 503,
                json: { message: 'Cannot reach Smart HMS. Check your connection and try again.' },
              }
            : {
                json: {
                  source: 'ai',
                  provider: 'groq',
                  outcome: 'staff',
                  suggestions: [],
                  explanation: 'Please contact reception to choose a service.',
                },
              },
        )
        .catch(() => {});
    });
    await page.goto('/recommendations');
    await expect(page.getByText('Your guidance will appear here')).toHaveCount(0);
    await page.getByLabel(/^Do any warning signs/).selectOption('no');
    const symptoms = page.getByLabel(/^Primary symptoms/);
    await symptoms.fill('My ear feels blocked');
    await page
      .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
      .check();
    await page.getByLabel('I agree to send this description to Groq for AI guidance.').check();
    const submit = page.getByRole('button', { name: 'Get department guidance' });
    const panel = page.getByRole('region', { name: 'Your guidance' });
    const progress = page.getByRole('progressbar', { name: 'Checking your description' });
    const cancel = page.getByRole('button', { name: 'Cancel request' });
    await submit.click();
    // These assertions never scroll the page: submission itself must reveal the status.
    await expect(progress).toBeInViewport({ ratio: 1 });
    await expect(cancel).toBeInViewport({ ratio: 1 });
    await expect(panel).toBeFocused();
    expect(await progress.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(49);
    await page.screenshot({
      path: `.local/screenshots/simple-guide-loading-${viewport.width}.png`,
    });
    await expect.poll(() => typeof release).toBe('function');
    release();
    const heading = page.getByRole('heading', { name: 'Contact hospital reception', exact: true });
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(panel).toBeFocused();
    await page.screenshot({ path: `.local/screenshots/simple-guide-result-${viewport.width}.png` });
    await panel.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(symptoms).toBeFocused();
    await expect(symptoms).toHaveValue('My ear feels blocked');
    fail = true;
    release = null;
    await submit.click();
    await expect(progress).toBeInViewport({ ratio: 1 });
    await expect.poll(() => typeof release).toBe('function');
    release();
    await expect(panel.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(panel).toBeFocused();
    await panel.getByRole('button', { name: 'Edit', exact: true }).click();
    release = null;
    await submit.click();
    await expect(cancel).toBeInViewport({ ratio: 1 });
    await expect.poll(() => typeof release).toBe('function');
    await cancel.click();
    await expect(symptoms).toBeFocused();
    await expect(progress).toHaveCount(0);
    release();
    await expect(symptoms).toHaveValue('My ear feels blocked');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
