import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe.configure({ timeout: 90_000 });

async function openDiagnostics(page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'visitor_diagnostics-e2e',
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
    if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      await route.continue();
      return;
    }
    if (url.hostname === 'horizon-testnet.stellar.org') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ network_passphrase: 'Test SDF Network ; September 2015' }),
      });
      return;
    }
    if (url.hostname === 'soroban-testnet.stellar.org') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'diagnostic-health',
          result: { status: 'healthy' },
        }),
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
  await page.goto('/diagnostics', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/diagnostics(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Privacy-safe diagnostics' })).toBeVisible();
}

test('opens as a public, local-only incident workspace with bounded evidence', async ({ page }) => {
  await openDiagnostics(page);

  await expect(page.getByText(/Nothing is transmitted/)).toBeVisible();
  await expect(page.getByText('Local only', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Capture buffer' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('diagnostics.initialized');
  await expect(page.getByText(/Bounded in memory/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Pause capture/ })).toBeVisible();
});

test('runs deterministic read-only Horizon and Soroban guided checks', async ({ page }) => {
  await openDiagnostics(page);
  await page.getByRole('button', { name: 'Guided checks' }).click();
  const endpointFlow = page.getByRole('article').filter({ hasText: 'Endpoint connectivity' });
  await endpointFlow.getByRole('button', { name: 'Run checks' }).click();

  await expect(
    page.getByRole('heading', { name: 'Latest result: Endpoint connectivity' })
  ).toBeVisible();
  await expect(page.getByText('Horizon returned a successful root response.')).toBeVisible();
  await expect(page.getByText('Soroban RPC reports healthy.')).toBeVisible();
  await expect(page.getByText('resolved', { exact: true }).last()).toBeVisible();
});

test('previews inclusion choices and downloads a verifiable JSON bundle', async ({ page }) => {
  await openDiagnostics(page);
  await page.getByRole('button', { name: 'Bundle preview' }).click();
  await page.getByRole('checkbox', { name: /Language/ }).check();
  await page.getByRole('checkbox', { name: /Timezone/ }).check();
  await page.getByRole('button', { name: /Generate local preview/ }).click();

  await expect(page.getByRole('heading', { name: 'Diagnostic bundle preview' })).toBeVisible();
  await expect(page.getByText('SHA-256', { exact: true })).toBeVisible();
  await expect(page.getByText('none', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: /Save locally/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Saved local bundles' }).locator('xpath=ancestor::section[1]')
  ).toContainText(/events · expires/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download JSON/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^stellar-diagnostic-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = await readFile(path!, 'utf8');
  const parsed = JSON.parse(exported);
  expect(parsed.kind).toBe('stellar-dashboard-diagnostic-bundle');
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.manifest.algorithm).toBe('SHA-256');
  expect(parsed.manifest.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(parsed.manifest.inclusion.environmentLocale).toBe(true);
  expect(exported).not.toMatch(/\bS[A-Z2-7]{55}\b/);
  expect(exported).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/i);
});

test('rejects a malicious or malformed imported bundle without replacing local evidence', async ({
  page,
}) => {
  await openDiagnostics(page);
  await page
    .getByRole('navigation', { name: 'Diagnostic workspace sections' })
    .getByRole('button', { name: 'Compare' })
    .click();
  await page.getByLabel('Import diagnostic JSON').setInputFiles({
    name: 'malicious.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"__proto__":{"polluted":true},"kind":"wrong"}'),
  });

  await expect(page.locator('.diagnostic-callout.error[role="alert"]')).toContainText(
    /prohibited key|not a Stellar dashboard/i
  );
  await expect(page.getByText('not selected', { exact: true })).toBeVisible();
});

test('confirms destructive local cleanup and reports offline state', async ({ page, context }) => {
  await openDiagnostics(page);
  await page.getByRole('button', { name: 'Clear local data' }).click();
  const dialog = page.getByRole('dialog', { name: /Clear local diagnostic data/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep data' }).click();
  await expect(dialog).not.toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Offline', { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/Existing evidence remains available/)).toBeVisible();
});

test('meets automated accessibility checks for the primary workspace', async ({ page }) => {
  await openDiagnostics(page);
  const results = await new AxeBuilder({ page }).include('.diagnostics-root').analyze();
  expect(results.violations).toEqual([]);
});
