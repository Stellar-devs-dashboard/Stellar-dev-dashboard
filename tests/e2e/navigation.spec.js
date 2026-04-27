import { test, expect } from '@playwright/test';

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the dashboard and shows sidebar', async ({ page }) => {
    await expect(page.locator('text=STELLAR')).toBeVisible();
    await expect(page.locator('text=DEV DASHBOARD')).toBeVisible();
  });

  test('network toggle switches between testnet and mainnet', async ({ page }) => {
    const mainBtn = page.locator('button', { hasText: 'Main' });
    await mainBtn.click();
    await expect(mainBtn).toHaveCSS('color', /0, 229, 255/); // cyan active color
  });

  test('clicking Multisig nav item shows multisig page', async ({ page }) => {
    await page.locator('button', { hasText: 'Multisig' }).click();
    await expect(page.locator('text=Multi-Signature')).toBeVisible();
  });

  test('clicking Overview nav item shows overview page', async ({ page }) => {
    await page.locator('button', { hasText: 'Overview' }).click();
    await expect(page.locator('text=Overview')).toBeVisible();
  });
});
