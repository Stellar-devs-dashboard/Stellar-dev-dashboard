import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PASSPHRASE = 'Public Global Stellar Network ; September 2015';

async function installCompatibilityRoutes(page: Page, missingMethod?: string) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'compatibility-e2e',
        consent: {
          status: 'denied',
          usage: false,
          personalization: false,
          updatedAt: new Date().toISOString(),
          policyVersion: 1,
        },
        events: [],
        assignments: [],
      })
    );
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }));
    localStorage.setItem('stellar:selected-network', 'mainnet');
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(style);
    });
  });
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    if (url.hostname === 'horizon.stellar.org') {
      if (url.pathname.endsWith('/ledgers')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            _embedded: {
              records: [{ sequence: '1000', protocol_version: 21, max_tx_set_size: 1000 }],
            },
          }),
        });
      } else {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            network_passphrase: PASSPHRASE,
            horizon_version: '2.30.0-e2e',
            core_version: '21.0.0-e2e',
            current_protocol_version: 21,
          }),
        });
      }
      return;
    }
    if (url.hostname === 'soroban-rpc.stellar.org') {
      const body = request.postDataJSON() as { id: string; method: string };
      const response = { jsonrpc: '2.0', id: body.id };
      if (body.method === missingMethod) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            ...response,
            error: { code: -32601, message: 'Method not found' },
          }),
        });
        return;
      }
      const result =
        body.method === 'getNetwork'
          ? { passphrase: PASSPHRASE, protocolVersion: '21' }
          : body.method === 'getLatestLedger'
            ? { id: 'ledger-e2e', sequence: 1000, protocolVersion: '21' }
            : body.method === 'getVersionInfo'
              ? {
                  version: '21.3.0-e2e',
                  captiveCoreVersion: 'stellar-core 21.0.0',
                  protocolVersion: 21,
                }
              : ['getTransaction', 'getTransactions', 'getEvents'].includes(body.method)
                ? {
                    status: 'NOT_FOUND',
                    transactions: [],
                    events: [],
                    latestLedger: 1000,
                    oldestLedger: 500,
                  }
                : ['simulateTransaction', 'sendTransaction'].includes(body.method)
                  ? null
                  : body.method === 'getHealth'
                    ? { status: 'healthy' }
                    : {};
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          result === null
            ? { ...response, error: { code: -32602, message: 'Invalid params' } }
            : { ...response, result }
        ),
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
}

async function open(page: Page, missingMethod?: string) {
  await installCompatibilityRoutes(page, missingMethod);
  await page.goto('/compatibility', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/compatibility(?:\?|$)/);
  await expect(
    page.getByRole('heading', { name: 'Protocol & Soroban RPC Compatibility' })
  ).toBeVisible();
}

test('renders a fresh compatible result with feature and method evidence', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Compatibility assessment' })).toBeVisible();
  await expect(page.getByLabel('Observed protocol')).toContainText('21');
  await expect(page.getByRole('heading', { name: 'Dashboard feature gates' })).toBeVisible();
  await expect(page.getByLabel('Soroban RPC method support')).toContainText('simulateTransaction');
  await expect(page.getByText('compatible', { exact: true }).first()).toBeVisible();
});

test('surfaces optional missing methods as an actionable degraded mode', async ({ page }) => {
  await open(page, 'getFeeStats');
  await expect(page.getByText('Degraded mode', { exact: true })).toBeVisible();
  await expect(page.getByText(/Live fee statistics are missing/i)).toBeVisible();
  await expect(page.getByText(/getFeeStats optional/i).first()).toBeVisible();
});

test('shows endpoint comparison empty state and preserves the primary endpoint', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('navigation', { name: 'Compatibility views' })
    .getByRole('button', { name: 'Compare' })
    .click();
  await expect(page.getByRole('heading', { name: 'Compare RPC endpoints' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'One endpoint is not a comparison' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mainnet' })).toBeVisible();
});

test('runs a matrix-only upgrade audit from the empty inventory state', async ({ page }) => {
  await open(page);
  await page
    .getByRole('navigation', { name: 'Compatibility views' })
    .getByRole('button', { name: 'Upgrade audit' })
    .click();
  await expect(page.getByRole('heading', { name: 'No saved artifacts discovered' })).toBeVisible();
  await page.getByRole('button', { name: 'Run matrix-only audit' }).click();
  await expect(page.getByRole('heading', { name: 'Protocol 21 readiness' })).toBeVisible();
});

test('exports a redacted versioned compatibility JSON contract', async ({ page }) => {
  await open(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^stellar-compatibility-.*\.json$/);
});

test('reuses cached evidence in an explicit offline state', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Observed protocol')).toContainText('21');
  await page.evaluate(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
  });
  await page.getByRole('button', { name: 'Refresh evidence' }).click();
  await expect(page.getByText('Offline mode', { exact: true })).toBeVisible();
  await expect(page.getByText(/evidence was not refreshed/i).first()).toBeVisible();
});

test('meets automated WCAG 2.1 AA checks in the complete status workflow', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Compatibility assessment' })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
