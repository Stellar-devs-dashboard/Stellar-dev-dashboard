import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ timeout: 60_000 });

async function clickNavButton(page, name: string | RegExp) {
  await page.getByRole('navigation', { name: 'Resource profiling views' }).getByRole('button', { name }).click();
}

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'e2e-visitor',
        consent: { status: 'denied', usage: false, personalization: false, updatedAt: new Date().toISOString(), policyVersion: 1 },
        events: [],
        assignments: [],
      })
    );
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }));
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
    });
  });
  // Resource capture requires live RPC access; e2e runs offline-by-default against non-localhost
  // hosts, so these tests exercise the sample-data + persistence + comparison/budget/export paths
  // exactly like a contributor without network access would.
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto('/resourceProfiling', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/resourceProfiling(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Resource Profiling Lab' })).toBeVisible();
}

test('shows an empty state before any baseline is loaded', async ({ page }) => {
  await open(page);
  await expect(page.getByText(/No baselines saved yet/i)).toBeVisible();
});

test('loads sample data and surfaces a regression in the comparison view', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'load bundled sample data' }).click();

  await clickNavButton(page, 'Baselines');
  await expect(page.getByRole('button', { name: 'Token transfer (sample)', exact: true })).toBeVisible();

  await clickNavButton(page, 'Compare');
  await expect(page.getByText(/Comparing against baseline/i)).toBeVisible();
  await expect(page.getByText('regression').first()).toBeVisible();
});

test('resource breakdown, timeline, and hot-path views render for the sample candidate', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'load bundled sample data' }).click();

  await clickNavButton(page, 'Resource View');
  await expect(page.getByRole('heading', { name: 'Resource breakdown' })).toBeVisible();

  await clickNavButton(page, 'Timeline');
  await expect(page.getByRole('heading', { name: 'Metric timeline' })).toBeVisible();

  await clickNavButton(page, 'Hot Paths');
  await expect(page.getByRole('heading', { name: 'Footprint hot paths' })).toBeVisible();
});

test('the seeded default budget evaluates pass/fail against the sample candidate', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'load bundled sample data' }).click();

  await clickNavButton(page, 'Budgets');
  await expect(page.getByRole('heading', { name: 'Default budget' })).toBeVisible();
  await expect(page.getByText(/^(PASS|FAIL)$/)).toBeVisible();
});

test('exporting the CI budget gate triggers a JSON download', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'load bundled sample data' }).click();

  await clickNavButton(page, 'Export / CI');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CI budget gate' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test('has no detectable accessibility violations once sample data is loaded', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'load bundled sample data' }).click();
  await clickNavButton(page, 'Compare');

  const results = await new AxeBuilder({ page }).withTags(['wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
