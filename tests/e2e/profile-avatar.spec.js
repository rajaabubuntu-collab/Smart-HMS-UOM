import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { testPassword } from '../../server/test/helpers.js';

test('every account role can upload and display a profile picture', async ({ page }) => {
  const image = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#2b8f79' },
  })
    .png()
    .toBuffer();

  for (const role of ['patient', 'doctor', 'receptionist', 'admin']) {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(`${role}@test.local`);
    await page.getByLabel(/^Password/).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    try {
      await page.locator('.avatar-control input[type="file"]').setInputFiles({
        name: 'profile.png',
        mimeType: 'image/png',
        buffer: image,
      });
      const avatar = page.locator('.topbar .avatar-picture');
      await expect(avatar).toBeVisible();
      await expect.poll(() => avatar.evaluate((element) => element.naturalWidth)).toBe(512);
    } finally {
      await page.evaluate(async () => {
        await fetch('/api/profile/avatar', { method: 'DELETE' });
      });
    }
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});
