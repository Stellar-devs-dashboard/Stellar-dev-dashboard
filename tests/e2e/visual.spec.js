import { test, expect } from '@playwright/test';

/**
 * Visual regression tests — snapshots are stored in tests/e2e/snapshots/
 * Run `npx playwright test --update-snapshots` to update baselines.
 */

test.describe('Visual regression', () => {
  test('dashboard overview matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('overview.png', { maxDiffPixels: 100 });
  });

  test('multisig setup panel matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.locator('button', { hasText: 'Multisig' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('multisig-setup.png', { maxDiffPixels: 100 });
  });

  test('multisig sessions panel matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.locator('button', { hasText: 'Multisig' }).click();
    await page.locator('button', { hasText: /Sessions/ }).click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('multisig-sessions.png', { maxDiffPixels: 100 });
  });

  test('sidebar matches snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveScreenshot('sidebar.png', { maxDiffPixels: 50 });
  });
});
