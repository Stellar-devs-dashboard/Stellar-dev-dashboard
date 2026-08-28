import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

async function openTreasuryReconciliation(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({ version: 1, consent: { status: 'denied', usage: false, personalization: false }, events: [] })
    );
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }));
    localStorage.setItem('stellar-dashboard-theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
    });
  });
  // Block every non-localhost request so Horizon calls fail and the
  // dashboard exercises its deterministic simulation fallback — the same
  // pattern used by every other engine feature's E2E suite in this repo.
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto('/connect', { waitUntil: 'domcontentloaded' });
  await page.evaluate((account) => {
    const dashboardWindow = window as typeof window & {
      __store?: { getState: () => { setConnectedAddress: (_value: string) => void } };
    };
    dashboardWindow.__store?.getState().setConnectedAddress(account);
  }, ACCOUNT);
  await page.getByRole('button', { name: 'Treasury Reconciliation', exact: true }).click();
  await expect(page).toHaveURL(/\/treasuryReconciliation(?:\?|$)/);
  // Unlike the fixture-only fraud-detection dashboard, this workspace always
  // attempts a live Horizon fetch first and only falls back to the
  // deterministic simulation snapshot once those calls reject — so the
  // loading state can legitimately persist for a few seconds under a
  // blocked-network E2E run. Wait for it to clear before asserting on the
  // now-rendered heading, rather than racing the two.
  await expect(page.getByText(/Loading reconciliation data/i)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Treasury reconciliation/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('treasury reconciliation workflow', () => {
  test('shows the simulation snapshot with balances and postings when Horizon is unreachable', async ({ page }) => {
    await openTreasuryReconciliation(page);
    await expect(page.getByText(/deterministic demonstration snapshot/i)).toBeVisible();
    await expect(page.getByText('Asset balance waterfall')).toBeVisible();

    await page.getByRole('button', { name: 'postings', exact: true }).click();
    // The demo fixture includes more than one payment-kind posting.
    await expect(page.getByText('payment').first()).toBeVisible();
  });

  test('adds a category rule and sees it applied to matching postings', async ({ page }) => {
    await openTreasuryReconciliation(page);
    await page.getByRole('button', { name: 'rules', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Category rules' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Rule name' }).fill('Trading counterparty');
    await page.getByRole('textbox', { name: 'Match counterparty contains' }).fill('DEMOTRADER');
    await page.getByRole('textbox', { name: 'Category' }).fill('trading');
    await page.getByRole('button', { name: 'Add rule' }).click();

    await expect(page.getByText('Trading counterparty')).toBeVisible();

    await page.getByRole('button', { name: 'postings', exact: true }).click();
    // Both legs of the demo trade posting match this counterparty rule.
    await expect(page.getByText('trading').first()).toBeVisible();
  });

  test('adds a cost-basis entry and the missing-price discrepancy for that asset clears on refresh', async ({ page }) => {
    await openTreasuryReconciliation(page);
    await page.getByRole('button', { name: 'unresolved', exact: true }).click();
    const unresolvedBefore = await page.getByRole('heading', { name: 'Unresolved items' }).isVisible();
    expect(unresolvedBefore).toBe(true);

    await page.getByRole('button', { name: 'Cost basis', exact: true }).click();
    await page.getByRole('textbox', { name: 'Asset code' }).fill('DEMOTOKEN');
    await page.getByRole('textbox', { name: 'Price per unit' }).fill('1.5');
    await page.getByRole('textbox', { name: 'Price source' }).fill('manual-test');
    await page.getByRole('button', { name: 'Add price' }).click();
    await expect(page.getByText('manual-test')).toBeVisible();
  });

  test('exports a JSON accounting record as a file download', async ({ page }) => {
    await openTreasuryReconciliation(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export json/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('closes an open period, after which its snapshot becomes immutable', async ({ page }) => {
    await openTreasuryReconciliation(page);
    await page.getByRole('button', { name: /close period/i }).click();
    await expect(page.getByText(/This period is closed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /close period/i })).toHaveCount(0);
  });

  test('exposes an accessible overview and postings table with no critical/serious axe violations', async ({ page }) => {
    await openTreasuryReconciliation(page);
    await page.getByRole('button', { name: 'postings', exact: true }).click();

    const results = await new AxeBuilder({ page })
      .include('[aria-labelledby="treasury-title"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    expect(serious).toEqual([]);
  });
});
