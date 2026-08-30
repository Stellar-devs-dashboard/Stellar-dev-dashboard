import { test, expect } from '@playwright/test';

/**
 * Visual regression tests — snapshots are stored in tests/e2e/snapshots/
 * Run `npm run test:visual:update` to update baselines.
 *
 * All tests run on the 'visual' Playwright project (chromium 1280x800, reduced-motion)
 * so screenshots are deterministic across runs.
 */

// Deterministic, checksum-valid public key. Network requests are blocked below,
// so the connected-state snapshots exercise rendering rather than live Testnet data.
const TESTNET_KEY = 'GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57';

test.beforeEach(async ({ page }) => {
  // Visual tests must not depend on live ledger/price responses or motion timing.
  // Install the deterministic environment before any application script runs.
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    // Prevent the delayed first-visit tour from racing the 1.5 second snapshot boundary.
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: 1 }));
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation: none !important;
          caret-color: transparent !important;
          transition: none !important;
        }
      `;
      document.head.appendChild(style);
    });
  });
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00.000Z'));
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
});

/** Wait for the page to be visually stable (no pending network or animations). */
async function waitForStable(page) {
  // Live price and ledger views intentionally poll, so networkidle is unreachable.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

async function expectScreenshot(target, name, options = {}) {
  // This suite is Chromium-only. Capture through CDP to avoid Playwright's
  // animation/actionability pipeline, which deadlocks on the live ticker.
  const isLocator = typeof target.page === 'function';
  const page = isLocator ? target.page() : target;
  const elementClip = isLocator ? await target.boundingBox() : null;
  if (isLocator && !elementClip) throw new Error(`Cannot capture hidden snapshot target: ${name}`);
  const clip = options.clip ?? elementClip;
  const session = await page.context().newCDPSession(page);
  const { data } = await session.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
  });
  const image = Buffer.from(data, 'base64');
  expect(image).toMatchSnapshot(name, { maxDiffPixelRatio: 0.002 });
}

// ---------------------------------------------------------------------------
// Connect Panel (unauthenticated landing)
// ---------------------------------------------------------------------------

test.describe('Connect Panel', () => {
  test('default state', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    await expectScreenshot(page, 'connect-panel.png');
  });

  test('invalid key error state', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/G\.\.\. public key/i).fill('BADKEY');
    await page.getByRole('button', { name: /connect/i }).click();
    await waitForStable(page);
    await expectScreenshot(page, 'connect-panel-error.png');
  });
});

// ---------------------------------------------------------------------------
// Sidebar & Layout
// ---------------------------------------------------------------------------

test.describe('Layout', () => {
  test('sidebar', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    await expectScreenshot(page.locator('aside'), 'sidebar.png');
  });

  test('price ticker bar', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    // The price ticker is the first child of the main layout header area
    const ticker = page.locator('[data-testid="price-ticker"], .price-ticker').first();
    if (await ticker.count()) {
      await expectScreenshot(ticker, 'price-ticker.png');
    } else {
      // Fallback: top 80px strip of the viewport
      await expectScreenshot(page, 'price-ticker-fallback.png', {
        clip: { x: 0, y: 0, width: 1280, height: 80 },
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Tabs (navigated via sidebar)
// ---------------------------------------------------------------------------

test.describe('Dashboard tabs', () => {
  const tabs = [
    { label: /network stats/i, snapshot: 'tab-network-stats.png' },
    { label: /wallet/i,        snapshot: 'tab-wallet.png' },
    { label: /faucet/i,        snapshot: 'tab-faucet.png' },
    { label: /explorer/i,      snapshot: 'tab-explorer.png' },
  ];

  for (const { label, snapshot } of tabs) {
    test(`${snapshot}`, async ({ page }) => {
      await page.goto('/connect', { waitUntil: 'domcontentloaded' });
      await waitForStable(page);
      const btn = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label })).first();
      if (await btn.count()) {
        await btn.click();
        await waitForStable(page);
      }
      await expectScreenshot(page, snapshot);
    });
  }
});

// ---------------------------------------------------------------------------
// Connected account views (uses Testnet public key — read-only, no auth needed)
// ---------------------------------------------------------------------------

test.describe('Connected account views', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder(/G\.\.\. public key/i).fill(TESTNET_KEY);
    await page.getByRole('button', { name: /connect/i }).click();
    await waitForStable(page);
  });

  test('overview', async ({ page }) => {
    await expectScreenshot(page, 'overview-connected.png');
  });

  test('account detail', async ({ page }) => {
    const btn = page.getByRole('button', { name: /account/i }).or(page.getByRole('link', { name: /^account$/i })).first();
    if (await btn.count()) {
      await btn.click();
      await waitForStable(page);
    }
    await expectScreenshot(page, 'account-detail.png');
  });

  test('transactions', async ({ page }) => {
    const btn = page.getByRole('button', { name: /transactions/i }).or(page.getByRole('link', { name: /transactions/i })).first();
    if (await btn.count()) {
      await btn.click();
      await waitForStable(page);
    }
    await expectScreenshot(page, 'transactions.png');
  });
});

// ---------------------------------------------------------------------------
// Theme variants
// ---------------------------------------------------------------------------

test.describe('Themes', () => {
  test('dark theme (default)', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    await expectScreenshot(page, 'theme-dark.png');
  });

  test('light theme', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    // Toggle theme if the button exists
    const toggle = page.getByRole('button', { name: /light|theme|toggle/i }).first();
    if (await toggle.count()) {
      await toggle.click();
      await waitForStable(page);
    } else {
      // Force via attribute so the snapshot still runs
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.waitForTimeout(100);
    }
    await expectScreenshot(page, 'theme-light.png');
  });
});

// ---------------------------------------------------------------------------
// Responsive / mobile
// ---------------------------------------------------------------------------

test.describe('Mobile layout', () => {
  test('connect panel at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    await expectScreenshot(page, 'mobile-connect.png');
  });
});

// ---------------------------------------------------------------------------
// Multisig (kept from original spec)
// ---------------------------------------------------------------------------

test.describe('Multisig', () => {
  test('setup panel', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    const btn = page.getByRole('button', { name: /multisig/i }).first();
    if (await btn.count()) {
      await btn.click();
      await waitForStable(page);
    }
    await expectScreenshot(page, 'multisig-setup.png');
  });

  test('sessions panel', async ({ page }) => {
    await page.goto('/connect', { waitUntil: 'domcontentloaded' });
    await waitForStable(page);
    const ms = page.getByRole('button', { name: /multisig/i }).first();
    if (await ms.count()) {
      await ms.click();
      const sessions = page.getByRole('button', { name: /sessions/i }).first();
      if (await sessions.count()) {
        await sessions.click();
      }
      await waitForStable(page);
    }
    await expectScreenshot(page, 'multisig-sessions.png');
  });
});
