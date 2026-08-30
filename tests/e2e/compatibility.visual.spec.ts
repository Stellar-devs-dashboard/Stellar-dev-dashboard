import { expect, test } from '@playwright/test';

test('compatibility dashboard status visual', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }));
    localStorage.setItem('stellar:selected-network', 'mainnet');
  });
  await page.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'horizon.stellar.org') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          url.pathname.endsWith('/ledgers')
            ? {
                _embedded: {
                  records: [{ sequence: '1000', protocol_version: 21, max_tx_set_size: 1000 }],
                },
              }
            : {
                network_passphrase: 'Public Global Stellar Network ; September 2015',
                horizon_version: '2.30.0-visual',
                core_version: '21.0.0-visual',
                current_protocol_version: 21,
              }
        ),
      });
    }
    if (url.hostname === 'soroban-rpc.stellar.org') {
      const body = request.postDataJSON() as { id: string; method: string };
      const base = { jsonrpc: '2.0', id: body.id };
      if (['simulateTransaction', 'sendTransaction'].includes(body.method)) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ...base, error: { code: -32602, message: 'Invalid params' } }),
        });
      }
      const result =
        body.method === 'getNetwork'
          ? { passphrase: 'Public Global Stellar Network ; September 2015', protocolVersion: '21' }
          : body.method === 'getLatestLedger'
            ? { id: 'visual-ledger', sequence: 1000, protocolVersion: '21' }
            : body.method === 'getVersionInfo'
              ? {
                  version: '21.3.0-visual',
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
                : {};
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...base, result }),
      });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/compatibility', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Compatibility assessment' })).toBeVisible();
  await expect(page).toHaveScreenshot('compatibility-status.png');
});
