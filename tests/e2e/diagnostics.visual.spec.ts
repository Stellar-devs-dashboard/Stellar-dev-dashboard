import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-28T12:00:00.000Z'));
  await page.addInitScript(() => {
    Math.random = () => 0.42;
    localStorage.setItem('theme', 'dark');
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'visitor_diagnostics-visual',
        consent: {
          status: 'denied',
          usage: false,
          personalization: false,
          updatedAt: '2026-08-28T12:00:00.000Z',
          policyVersion: 1,
        },
        events: [],
        assignments: [],
      })
    );
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
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.goto('/diagnostics', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Privacy-safe diagnostics' })).toBeVisible();
});

test('diagnostic overview desktop', async ({ page }) => {
  await expect(page.locator('.diagnostics-root')).toHaveScreenshot('diagnostics-overview.png', {
    animations: 'disabled',
  });
});

test('guided troubleshooting catalog desktop', async ({ page }) => {
  await page.getByRole('button', { name: 'Guided checks' }).click();
  await expect(
    page.getByRole('heading', { name: 'Guided incident troubleshooting' })
  ).toBeVisible();
  await expect(page.locator('.diagnostics-root')).toHaveScreenshot('diagnostics-guided.png', {
    animations: 'disabled',
  });
});
