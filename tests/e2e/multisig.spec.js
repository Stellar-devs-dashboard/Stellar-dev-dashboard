import { test, expect } from '@playwright/test';

test.describe('Multisig page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('button', { hasText: 'Multisig' }).click();
    await expect(page.locator('text=Multi-Signature')).toBeVisible();
  });

  test('shows Setup and Sessions tabs', async ({ page }) => {
    await expect(page.locator('button', { hasText: /Setup/ })).toBeVisible();
    await expect(page.locator('button', { hasText: /Sessions/ })).toBeVisible();
  });

  test('Setup tab shows threshold inputs', async ({ page }) => {
    await expect(page.locator('text=Thresholds')).toBeVisible();
    await expect(page.locator('text=Co-Signers')).toBeVisible();
  });

  test('shows connect wallet prompt when not connected', async ({ page }) => {
    await expect(page.locator('text=/connect a wallet/i')).toBeVisible();
  });

  test('Sessions tab shows empty state', async ({ page }) => {
    await page.locator('button', { hasText: /Sessions/ }).click();
    await expect(page.locator('text=/no sessions yet/i')).toBeVisible();
  });

  test('Sessions tab shows New Session form', async ({ page }) => {
    await page.locator('button', { hasText: /Sessions/ }).click();
    await page.locator('button', { hasText: '+ New Session' }).click();
    await expect(page.locator('text=New Signature Session')).toBeVisible();
  });

  test('can create a session from the form', async ({ page }) => {
    await page.locator('button', { hasText: /Sessions/ }).click();
    await page.locator('button', { hasText: '+ New Session' }).click();

    await page.locator('input[placeholder="e.g. Treasury payment"]').fill('E2E Test Session');
    await page.locator('textarea[aria-label="Transaction XDR"]').fill('AAAA');
    await page.locator('input[aria-label="Signature threshold"]').fill('1');

    await page.locator('button', { hasText: 'Create Session' }).click();

    // Should switch to session detail view
    await expect(page.locator('text=E2E Test Session')).toBeVisible();
  });
});
