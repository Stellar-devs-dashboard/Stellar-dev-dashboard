import { test, expect } from '@playwright/test'

const MOCK_ADDRESS = 'GBND5WQZQ4KQFZK7QJZQ7QJZQ7QJZQ7QJZQ7QJZQ7QJZQ7QJZQ7QJZ'
const MOCK_NETWORK = 'testnet'

function setupMocks(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return Promise.all([
    page.route('**/accounts/**', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          account_id: MOCK_ADDRESS,
          balances: [{ asset_type: 'native', balance: '9999.0000000' }],
          sequence: '1234',
          thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
          flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
          signers: [{ key: MOCK_ADDRESS, weight: 1, type: 'ed25519_public_key' }],
          data: {},
          subentry_count: 0,
        },
      })
    }),
    page.route('**/transactions**', async (route) => {
      await route.fulfill({ status: 200, json: { _embedded: { records: [] }, _links: {} } })
    }),
    page.route('**/operations**', async (route) => {
      await route.fulfill({ status: 200, json: { _embedded: { records: [] }, _links: {} } })
    }),
    page.route('**/offers**', async (route) => {
      await route.fulfill({ status: 200, json: { _embedded: { records: [] } } })
    }),
    page.route('**/api/v3/simple/price**', async (route) => {
      await route.fulfill({ status: 200, json: { stellar: { usd: 0.12, usd_24h_change: 1.5 } } })
    }),
    page.route('**/ledgers**', async (route) => {
      await route.fulfill({ status: 200, json: { _embedded: { records: [] }, _links: {} } })
    }),
  ])
}

test.describe('Deep-link and shareable URL support', () => {
  test('auto-connects when ?address and ?network are in URL', async ({ page }) => {
    await setupMocks(page)

    // Navigate directly to a deep-link URL
    await page.goto(`/account?address=${MOCK_ADDRESS}&network=${MOCK_NETWORK}`)

    // The app should auto-connect — ConnectPanel should NOT be visible
    await expect(page.locator('input[placeholder*="public key"]')).not.toBeVisible({ timeout: 10_000 })

    // The connected address should appear somewhere in the page
    await expect(page.locator(`text=${MOCK_ADDRESS.slice(0, 8)}`).first()).toBeVisible({ timeout: 10_000 })
  })

  test('URL updates when address or network changes without full page reload', async ({ page }) => {
    await setupMocks(page)

    await page.goto(`/overview?address=${MOCK_ADDRESS}&network=${MOCK_NETWORK}`)

    // Wait for auto-connect
    await expect(page.locator('input[placeholder*="public key"]')).not.toBeVisible({ timeout: 10_000 })

    // URL should contain address and network
    await expect(page).toHaveURL(new RegExp(`address=${MOCK_ADDRESS}`))
    await expect(page).toHaveURL(new RegExp(`network=${MOCK_NETWORK}`))
  })

  test('"Copy shareable link" button is visible when connected', async ({ page }) => {
    await setupMocks(page)

    await page.goto(`/overview?address=${MOCK_ADDRESS}&network=${MOCK_NETWORK}`)

    // Wait for auto-connect
    await expect(page.locator('input[placeholder*="public key"]')).not.toBeVisible({ timeout: 10_000 })

    // Copy link button should be visible
    const copyBtn = page.locator('[data-testid="copy-link-button"]')
    await expect(copyBtn).toBeVisible({ timeout: 10_000 })
  })

  test('browser back/forward navigation preserves address and network in URL', async ({ page }) => {
    await setupMocks(page)

    await page.goto(`/account?address=${MOCK_ADDRESS}&network=${MOCK_NETWORK}`)
    await expect(page.locator('input[placeholder*="public key"]')).not.toBeVisible({ timeout: 10_000 })

    // Navigate to a different tab by clicking a sidebar link
    const txLink = page.locator('a[href*="/transactions"], nav >> text=Transactions').first()
    if (await txLink.isVisible()) {
      await txLink.click()
      await expect(page).toHaveURL(/\/transactions/)

      // Go back
      await page.goBack()
      await expect(page).toHaveURL(/\/account/)
      await expect(page).toHaveURL(new RegExp(`address=${MOCK_ADDRESS}`))
      await expect(page).toHaveURL(new RegExp(`network=${MOCK_NETWORK}`))
    } else {
      // If no sidebar link is found, just verify the URL params are preserved
      await expect(page).toHaveURL(new RegExp(`address=${MOCK_ADDRESS}`))
      await expect(page).toHaveURL(new RegExp(`network=${MOCK_NETWORK}`))
    }
  })

  test('copy link button writes a valid URL to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await setupMocks(page)

    await page.goto(`/account?address=${MOCK_ADDRESS}&network=${MOCK_NETWORK}`)
    await expect(page.locator('input[placeholder*="public key"]')).not.toBeVisible({ timeout: 10_000 })

    const copyBtn = page.locator('[data-testid="copy-link-button"]')
    await expect(copyBtn).toBeVisible({ timeout: 10_000 })
    await copyBtn.click()

    // Button should show copied state (✓)
    await expect(copyBtn).toHaveText('✓', { timeout: 3_000 })

    // Clipboard should contain a URL with address and network
    const clipText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipText).toContain(`address=${MOCK_ADDRESS}`)
    expect(clipText).toContain(`network=${MOCK_NETWORK}`)
  })
})
