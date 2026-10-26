import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('redesigned public pages display published data and work across languages and sizes', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const department = {
    _id: 'preview-department',
    name: 'General Medicine',
    description: 'Demonstration department for website layout verification.',
    isDemo: true,
  };
  const doctors = ['Amara Perera', 'Nimal Silva', 'Kavitha Kumar'].map((name, index) => ({
    _id: `preview-doctor-${index}`,
    name,
    departmentId: department._id,
    department: department.name,
    specialization: 'General Medicine',
    qualification: 'Demonstration qualification',
    consultationFeeMinor: 250000,
    isDemo: true,
  }));
  await page.route('**/api/public/hospital', (route) =>
    route.fulfill({
      json: {
        hospital: {
          name: 'Preview Hospital',
          address: 'Demonstration address, Colombo, Sri Lanka',
          phone: '+94110000000',
          email: 'reception@example.test',
          isDemo: true,
          description: 'Demonstration hospital information for design verification.',
          hours: [{ day: 'Monday', opens: '09:00', closes: '17:00', closed: false, allDay: false }],
        },
      },
    }),
  );
  await page.route('**/api/public/doctors?*', (route) =>
    route.fulfill({ json: { items: doctors, total: doctors.length, page: 1, limit: 12 } }),
  );
  await page.route('**/api/public/departments?*', (route) =>
    route.fulfill({ json: { items: [department], total: 1, page: 1, limit: 12 } }),
  );
  await page.route('**/api/public/doctors/preview-doctor-0', (route) =>
    route.fulfill({ json: { doctor: doctors[0] } }),
  );
  await page.route('**/api/public/departments/preview-department', (route) =>
    route.fulfill({ json: { department } }),
  );
  const paths = [
    '/',
    '/doctors',
    '/departments',
    '/doctors/preview-doctor-0',
    '/departments/preview-department',
    '/about',
    '/contact',
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('.public-redesign h1')).toBeVisible();
    await expect(page.locator('.hospital-contact-strip')).toContainText('Demonstration address');
    await expect(page.locator('.loading')).toHaveCount(0);
    if (path === '/') {
      await expect(page.locator('.hospital-doctor-grid article')).toHaveCount(3);
      await expect(page.locator('.hospital-department-grid article')).toHaveCount(1);
    }
    const accessibility = await new AxeBuilder({ page }).include('.public-redesign').analyze();
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
      path,
    ).toEqual([]);
    for (const language of ['en', 'si', 'ta']) {
      await page.locator('#hms-language').selectOption(language);
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const layout = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          outside: [...document.querySelectorAll('.public-redesign main *')]
            .filter(
              (element) =>
                element.getBoundingClientRect().width > 0 &&
                element.getBoundingClientRect().right > innerWidth + 2,
            )
            .map((element) => element.getAttribute('class') || element.tagName)
            .slice(0, 8),
        }));
        expect(
          layout.scrollWidth,
          `${path} ${language} ${width}: ${JSON.stringify(layout)}`,
        ).toBeLessThanOrEqual(width);
        expect(layout.outside, `${path} ${language} ${width}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 812, height: 375 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${path} landscape`,
    ).toBe(true);
    await page.locator('#hms-language').selectOption('en');
    await page.setViewportSize({ width: 375, height: 812 });
    const menu = page.getByRole('button', { name: 'Hospital navigation', exact: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(page.locator('#homepage-navigation a').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    const name = path.replaceAll('/', '-').replace(/^-/, '') || 'home';
    await page.screenshot({
      path: `.local/screenshots/public-redesign-${name}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `.local/screenshots/public-redesign-${name}-desktop.png`,
      fullPage: true,
    });
    if (path === '/')
      await page.screenshot({ path: '.local/screenshots/public-redesign-preview.png' });
  }
});
