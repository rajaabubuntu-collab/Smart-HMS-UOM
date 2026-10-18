import { test, expect } from '@playwright/test';
import { testPassword } from '../../server/test/helpers.js';

test('licensed photographs, visit guidance and FAQs work in all three languages', async ({
  page,
}) => {
  await page.goto('/');
  const images = page.locator('.hospital-landing main figure img');
  await expect(images).toHaveCount(6);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    await expect(image).toHaveAttribute('alt', /Stock photograph|Colombo/);
  }
  await expect(
    page.locator('figcaption').filter({ hasText: 'Healthcare stock photograph' }),
  ).toHaveCount(5);
  await expect(
    page.getByRole('link', { name: 'Explore doctors & services', exact: true }),
  ).toHaveAttribute('href', '/doctors');
  const question = page.locator('summary').filter({ hasText: 'Does reception being open' });
  await question.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Reception hours and doctor schedules are different.', { exact: false }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(question.locator('..')).not.toHaveAttribute('open');
  for (const language of ['en', 'si', 'ta']) {
    await page.locator('#hms-language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    if (language !== 'en')
      await expect(page.locator('#prepare-title')).not.toContainText('Arrive with confidence.');
  }
});

test('public homepage stays usable without session API and links to real entry points', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/auth/me', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Your health. Your next step.',
  );
  await expect(page.getByText('University project · Demonstration website')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create patient account' })).toHaveAttribute(
    'href',
    '/register',
  );
  await expect(page.getByRole('link', { name: 'Patient portal', exact: true })).toHaveAttribute(
    'href',
    '/login',
  );
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page).toHaveURL(/#your-visit$/);
  await expect(
    page.getByRole('heading', { name: 'Your visit. One step at a time.' }),
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/public-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'Patient portal', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: '.local/screenshots/public-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.unroute('**/api/auth/me');
  await page.getByRole('link', { name: 'Create patient account' }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get you started.' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('solid surfaces persists through login and public-to-workspace navigation', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Solid surfaces' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Patient portal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Solid surfaces' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Email address').fill('patient@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Solid surfaces' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Hospital website', exact: true }).click();
  await expect(page.getByRole('link', { name: 'My workspace', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Go to my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Test.' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  const sidebar = await page.locator('.sidebar').boundingBox();
  const content = await page.locator('.main-shell').boundingBox();
  expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(content.x);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/records');
  await expect(page).toHaveURL(/\/login$/);
});

test('homepage shows approved directory data, local contacts and licensed photo credits', async ({
  page,
}) => {
  await page.route('**/api/public/hospital', (route) =>
    route.fulfill({
      json: {
        hospital: {
          name: 'Synthetic Hospital',
          address: 'Synthetic road, Colombo 09',
          phone: '+94112345678',
          email: 'reception@test.local',
          isDemo: false,
          hours: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
            (day) => ({ day, allDay: true, closed: false }),
          ),
        },
      },
    }),
  );
  await page.route('**/api/public/departments?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            _id: 'department',
            name: 'Published department',
            description: 'Approved public description.',
          },
        ],
        total: 1,
      },
    }),
  );
  await page.route('**/api/public/doctors?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            _id: 'doctor',
            name: 'Published doctor',
            department: 'Published department',
            specialization: 'Approved speciality',
            qualification: 'Approved qualification',
            consultationFeeMinor: 250000,
          },
        ],
        total: 1,
      },
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Reception open 24/7', { exact: true })).toHaveCount(1);
  await expect(page.locator('.local-strip')).toHaveCount(0);
  await expect(page.getByText('Appointment timezone', { exact: true })).toHaveCount(0);
  await expect(page.getByText('University of Moratuwa · BIT final-year project')).toHaveCount(0);
  const directory = page.locator('#clinical-directory');
  await expect(
    directory.getByRole('heading', { name: 'Published department', exact: true }),
  ).toBeVisible();
  await expect(
    directory.getByRole('heading', { name: 'Published doctor', exact: true }),
  ).toBeVisible();
  await expect(directory.getByText('Approved qualification')).toBeVisible();
  await expect(directory.locator('.hospital-doctor-fee')).toContainText('2,500.00');
  await expect(directory.getByRole('link', { name: 'Check availability' })).toHaveAttribute(
    'href',
    '/book?doctor=doctor',
  );
  await expect(page.getByRole('link', { name: 'Call for directions' })).toHaveAttribute(
    'href',
    'tel:+94112345678',
  );
  const map = page.getByRole('link', { name: 'Explore the area on Google Maps' });
  expect(new URL(await map.getAttribute('href')).searchParams.get('query')).toBe(
    'Synthetic road, Colombo 09, Sri Lanka',
  );
  await expect(page.getByRole('link', { name: 'Call 1990', exact: true })).toHaveAttribute(
    'href',
    'tel:1990',
  );
  await page.getByText('Photography & credits', { exact: true }).click();
  await expect(
    page.getByText('Healthcare photographs are stock images for illustration;', { exact: false }),
  ).toBeVisible();
  await expect(page.locator('.hospital-photo-credits a')).toHaveCount(7);
});

test('directory failure preserves visitor guidance and never claims unpublished opening hours', async ({
  page,
}) => {
  await page.route('**/api/public/hospital', (route) =>
    route.fulfill({ json: { hospital: null } }),
  );
  await page.route('**/api/public/departments?*', (route) => route.abort());
  await page.route('**/api/public/doctors?*', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.hospital-directory-status')).toBeVisible();
  await expect(page.getByText('Reception open 24/7', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Explore the area on Google Maps' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Payments & insurance' })).toBeVisible();
  await page.getByRole('link', { name: 'Patient portal', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('empty directory and reduced reception hours do not imply available clinical services', async ({
  page,
}) => {
  await page.route('**/api/public/hospital', (route) =>
    route.fulfill({
      json: {
        hospital: {
          name: 'Synthetic Hospital',
          address: 'Colombo',
          isDemo: true,
          hours: [{ day: 'Monday', allDay: false, closed: false, opens: '09:00', closes: '17:00' }],
        },
      },
    }),
  );
  for (const endpoint of ['departments', 'doctors'])
    await page.route(`**/api/public/${endpoint}?*`, (route) =>
      route.fulfill({ json: { items: [], total: 0 } }),
    );
  await page.goto('/');
  await expect(page.locator('.hospital-directory-empty')).toBeVisible();
  await expect(page.getByText('Reception open 24/7', { exact: true })).toHaveCount(0);
  await expect(page.locator('.hospital-doctor-grid article')).toHaveCount(0);
  await expect(page.locator('.hospital-hours')).toContainText('Monday');
  await expect(page.locator('.hospital-hours')).toContainText('09:00–17:00');
});
