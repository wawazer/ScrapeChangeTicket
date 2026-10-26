import { test, expect } from '@playwright/test';

test('dashboard loads without exposing credentials', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pelindo Change Task Scraper' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(process.env.SN_PASSWORD || '__no_password__');
  await expect(page.getByRole('button', { name: 'Mulai scraping' })).toBeVisible();
});
