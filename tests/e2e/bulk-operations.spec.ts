import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

async function openBulkOperations(page: Page) {
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
  await page.getByRole('button', { name: 'Bulk Operations', exact: true }).click();
  await expect(page).toHaveURL(/\/bulkOperations(?:\?|$)/);
  await expect(page.getByRole('heading', { name: /Bulk operations planner/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('bulk operations planner workflow', () => {
  test('loads demo manifest and shows operation stats', async ({ page }) => {
    await openBulkOperations(page);
    await page.getByRole('button', { name: 'Load demo', exact: true }).click();
    await expect(page.getByText(/Operations/i).first()).toBeVisible();
    await expect(page.getByText(/4/).first()).toBeVisible();
  });

  test('previews CSV import via preview tab', async ({ page }) => {
    await openBulkOperations(page);
    await page.getByRole('button', { name: 'Load demo CSV', exact: true }).click();
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    await page.getByRole('button', { name: 'preview', exact: true }).click();
    await expect(page.getByText(/Mapped operations|Validation issues|Import preview/i)).toBeVisible();
  });

  test('builds a plan and runs simulated execution', async ({ page }) => {
    await openBulkOperations(page);
    await page.getByRole('button', { name: 'Load demo', exact: true }).click();
    await page.getByRole('button', { name: 'plan', exact: true }).click();
    await page.getByRole('button', { name: 'Build plan', exact: true }).click();
    await page.getByRole('button', { name: 'execute', exact: true }).click();
    await page.getByRole('button', { name: 'Start run', exact: true }).click();
    await page.getByRole('button', { name: 'receipts', exact: true }).click();
    await expect(page.getByText(/Run .* finished|Receipts/i)).toBeVisible({ timeout: 20_000 });
  });

  test('shows dependency graph for demo manifest', async ({ page }) => {
    await openBulkOperations(page);
    await page.getByRole('button', { name: 'Load demo', exact: true }).click();
    await page.getByRole('button', { name: 'graph', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dependency graph' })).toBeVisible();
    await expect(page.getByText(/demo-pay-1/i)).toBeVisible();
  });

  test('exposes accessible bulk planner shell with no critical/serious axe violations', async ({ page }) => {
    await openBulkOperations(page);
    const results = await new AxeBuilder({ page })
      .include('[aria-labelledby="bulk-ops-title"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    expect(serious).toEqual([]);
  });
});
