import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

async function openLedgerSnapshots(page: Page) {
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
  await page.getByRole('button', { name: 'Ledger Snapshots', exact: true }).click();
  await expect(page).toHaveURL(/\/ledgerSnapshots(?:\?|$)/);
  await expect(page.getByRole('heading', { name: /Portable ledger snapshots/i })).toBeVisible({ timeout: 20_000 });
}

test.describe('ledger snapshots workflow', () => {
  test('loads demo snapshot library with diagnostic banner', async ({ page }) => {
    await openLedgerSnapshots(page);
    await expect(page.getByText(/deterministic demonstration snapshot/i)).toBeVisible();
    await expect(page.getByText(/Diagnostic simulation only/i)).toBeVisible();
  });

  test('runs deterministic offline replay', async ({ page }) => {
    await openLedgerSnapshots(page);
    await page.getByRole('button', { name: 'Replay', exact: true }).click();
    await page.getByRole('button', { name: 'Run replay', exact: true }).click();
    await expect(page.getByText(/Replay completed|Replay partial/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/diagnostic simulation/i)).toBeVisible();
  });

  test('shows inspect view with simulations', async ({ page }) => {
    await openLedgerSnapshots(page);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText('Captured simulations')).toBeVisible();
    await expect(page.getByText('classic').first()).toBeVisible();
  });

  test('meets accessibility expectations on library view', async ({ page }) => {
    await openLedgerSnapshots(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toHaveLength(0);
  });
});
