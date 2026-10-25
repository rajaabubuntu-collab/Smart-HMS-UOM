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
  await expect(launch).toHaveCount(0);
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
