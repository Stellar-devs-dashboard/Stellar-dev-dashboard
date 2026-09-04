/**
 * E2E test for the Asset Issuance & Trustline Control Center.
 *
 * Tests the core UI workflows: navigation, issuer address input,
 * tab switching, form validation, and accessibility.
 */

import { test, expect } from '@playwright/test';

test.describe('Asset Control Center', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the asset control tab
    await page.goto('/?tab=assetControl');
    // Wait for the component to render
    await page.waitForSelector('#asset-control-center', { timeout: 10_000 });
  });

  test('renders the main heading', async ({ page }) => {
    const heading = page.getByRole('heading', {
      name: /Asset Issuance.*Trustline Control Center/i,
    });
    await expect(heading).toBeVisible();
  });

  test('shows empty state when no issuer address is entered', async ({ page }) => {
    const emptyState = page.locator('.ac-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Enter an issuer account address');
  });

  test('validates invalid issuer address', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('INVALID_ADDRESS');

    const errorBanner = page.locator('.ac-danger-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Invalid Stellar public key');
  });

  test('shows tabs when valid issuer address is entered', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    // Use a valid-format G-address (may not exist on network but passes format validation)
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    const tablist = page.getByRole('tablist', { name: /Asset Control sections/i });
    await expect(tablist).toBeVisible();

    // All four tabs should be present
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
  });

  test('tab keyboard navigation works', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    // Focus the first tab
    const firstTab = page.getByRole('tab', { name: /Issuer Config/i });
    await firstTab.focus();

    // Arrow right should move to Trustlines
    await page.keyboard.press('ArrowRight');
    const activeTab = page.getByRole('tab', { selected: true });
    await expect(activeTab).toContainText('Trustlines');
  });

  test('issuance workflow shows form fields', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    // Switch to Issue Supply tab
    const issueTab = page.getByRole('tab', { name: /Issue Supply/i });
    await issueTab.click();

    // Check form fields are present
    await expect(page.locator('#ac-issue-code')).toBeVisible();
    await expect(page.locator('#ac-issue-dest')).toBeVisible();
    await expect(page.locator('#ac-issue-amount')).toBeVisible();
    await expect(page.locator('#ac-issue-memo')).toBeVisible();
  });

  test('issuance form validates empty fields', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    const issueTab = page.getByRole('tab', { name: /Issue Supply/i });
    await issueTab.click();

    // Click "Next" without filling in any fields
    const nextBtn = page.getByRole('button', { name: /Next.*Readiness/i });
    await nextBtn.click();

    // Should show validation error
    const errorBanner = page.locator('.ac-danger-banner');
    await expect(errorBanner).toBeVisible();
  });

  test('clawback tab shows warning when clawback not enabled', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    const clawbackTab = page.getByRole('tab', { name: /Clawback/i });
    await clawbackTab.click();

    // The panel content should render (either the workflow or a message about clawback state)
    const tabPanel = page.locator('[role="tabpanel"]');
    await expect(tabPanel).toBeVisible();
  });

  test('trustlines tab shows empty state without asset code', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    const trustlineTab = page.getByRole('tab', { name: /Trustlines/i });
    await trustlineTab.click();

    const emptyState = page.locator('.ac-empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('Enter an asset code');
  });

  test('all form inputs have associated labels', async ({ page }) => {
    const input = page.locator('#ac-issuer-address');
    await input.fill('GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEBD9AFZQ7TM4JRS9A');

    // Switch to issuance tab which has the most form fields
    const issueTab = page.getByRole('tab', { name: /Issue Supply/i });
    await issueTab.click();

    // All inputs in the form should have labels
    const inputs = page.locator('.ac-form-group input, .ac-form-group select');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const inputEl = inputs.nth(i);
      const id = await inputEl.getAttribute('id');
      expect(id).toBeTruthy();
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        await expect(label).toBeVisible();
      }
    }
  });
});
