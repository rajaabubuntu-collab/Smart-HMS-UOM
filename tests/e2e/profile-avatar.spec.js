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

test('uploaded doctor photo is used in booking and department guidance', async ({ page }) => {
  async function login(role) {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(`${role}@test.local`);
    await page.getByLabel(/^Password/).fill(testPassword);
    await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await login('doctor');
  const image = await sharp({
    create: { width: 640, height: 640, channels: 3, background: '#367f83' },
  })
    .png()
    .toBuffer();
  await page
    .locator('.avatar-control input[type="file"]')
    .setInputFiles({ name: 'doctor.png', mimeType: 'image/png', buffer: image });
  await expect(page.locator('.topbar .avatar-picture')).toBeVisible();
  const url = await page.locator('.topbar .avatar-picture').getAttribute('src');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login('patient');
  await page.goto('/book');
  const portrait = page.locator(`.doctor-portrait img[src="${url}"]`);
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate((img) => img.naturalWidth)).toBe(512);
  await expect(page.locator('.doctor-portrait-label')).toHaveCount(0);
  await page.goto('/recommendations');
  await page.getByLabel(/^Do any warning signs/).selectOption('no');
  await page.getByLabel(/^Primary symptoms/).fill('cough');
  await page
    .getByLabel('I understand this is a department guide, not a diagnosis or emergency service.')
    .check();
  await page.getByRole('button', { name: 'Get department guidance' }).click();
  await expect(page.locator(`.guide-doctor img[src="${url}"]`)).toBeVisible();
  // A removed or unavailable upload must recover to a clearly labelled sample.
  await page.route('**/api/users/*/avatar?*', (route) => route.fulfill({ status: 404 }));
  await page.goto('/book');
  await expect(page.locator('.doctor-portrait-label')).toHaveText('Sample photo');
  await expect(page.locator('.doctor-portrait img')).toHaveAttribute('src', /\/images\/doctor-/);
  await page.unroute('**/api/users/*/avatar?*');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login('doctor');
  await page.request.delete('/api/profile/avatar', {
    headers: { Origin: 'http://localhost:5174' },
  });
});
