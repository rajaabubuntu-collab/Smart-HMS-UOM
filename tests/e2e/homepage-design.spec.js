import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage navigation works by keyboard on phones in every language and stays scoped', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.locator('.homepage-menu-toggle');
  const nav = page.locator('#homepage-navigation');
  for (const language of ['en', 'si', 'ta']) {
    await page.locator('#hms-language').selectOption(language);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Tab');
    await expect(nav.locator('a').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.locator('#hms-language').selectOption('en');
  const mapDetails = page.locator('.homepage-map-disclosure');
  await expect(mapDetails).not.toHaveAttribute('open');
  await page.getByText('Show interactive map', { exact: true }).click();
  await expect(mapDetails).toHaveAttribute('open', '');
  await expect(mapDetails.getByTitle('Location map')).toBeVisible();
  await page.getByText('Show interactive map', { exact: true }).click();
  await expect(mapDetails).not.toHaveAttribute('open');
  await expect(page.getByRole('link', { name: 'Open location in Google Maps' })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('.homepage-design').analyze();
  expect(
    accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact)),
  ).toEqual([]);
  await toggle.click();
  await nav.getByRole('link', { name: 'About us', exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('.homepage-design')).toHaveCount(0);
  await expect(page.locator('.homepage-menu-toggle')).toHaveCount(0);
  await expect(page.locator('header nav')).toBeVisible();
  await page.goto('/');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(nav).toBeVisible();
  await expect(toggle).toBeHidden();
});
