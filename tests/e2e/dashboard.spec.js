import { test, expect } from '@playwright/test';

test('dashboard loads without exposing credentials', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard operasional' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(process.env.SN_PASSWORD || '__no_password__');
  await expect(page.getByRole('button', { name: 'Mulai scraping' })).toBeVisible();
});

test('workspace navigation exposes data and report views', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data tickets' }).click();
  await expect(page.getByRole('heading', { name: 'Data tickets' })).toBeVisible();
  await expect(page.getByText(/Belum ada data tiket/)).toBeVisible();
  await page.getByRole('button', { name: 'Export reports' }).click();
  await expect(page.getByRole('heading', { name: 'Export reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buat dan unduh PDF' })).toBeVisible();
});
