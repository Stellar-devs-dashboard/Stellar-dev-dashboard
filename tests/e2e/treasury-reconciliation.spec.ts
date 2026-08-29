import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const ACCOUNT = 'GCABR6KL52ARFBCF2YBZLSXPH6T6GOXXPUEOP5D3T5HTSUZJHHXVZUE5'
const COUNTERPARTY = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAJWL'
const HORIZON_BASE = 'https://horizon-testnet.stellar.org'

function transactionRecord(hash: string, successful = true) {
  return {
    hash, source_account: ACCOUNT, successful, fee_charged: '100', paging_token: hash,
    created_at: '2026-01-15T00:00:00.000Z', memo: 'invoice-42',
  }
}

function paymentOperation(id: string, txHash: string, from: string, to: string, amount: string) {
  return {
    id, type: 'payment', transaction_hash: txHash, transaction_successful: true,
    created_at: '2026-01-15T00:00:00.000Z', paging_token: id,
    from, to, amount, asset_type: 'native',
  }
}

async function mockHorizonAccountHistory(page: Page) {
  await page.route(`${HORIZON_BASE}/accounts/${ACCOUNT}/transactions*`, async (route) => {
    await route.fulfill({ status: 200, json: { _embedded: { records: [transactionRecord('e2e-tx-1')] }, _links: {} } })
  })
  await page.route(`${HORIZON_BASE}/accounts/${ACCOUNT}/operations*`, async (route) => {
    await route.fulfill({ status: 200, json: { _embedded: { records: [paymentOperation('e2e-op-1', 'e2e-tx-1', COUNTERPARTY, ACCOUNT, '42.5000000')] }, _links: {} } })
  })
}

async function openTreasuryDashboard(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('stellar-dashboard-theme', 'dark')
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }))
    localStorage.setItem(
      'stellar:behavior-analytics:v1',
      JSON.stringify({
        schemaVersion: 1,
        pseudonymousId: 'e2e-visitor',
        consent: { status: 'denied', usage: false, personalization: false, updatedAt: new Date().toISOString(), policyVersion: 1 },
        events: [],
        assignments: [],
      })
    )
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
      document.head.appendChild(style)
    })
  })
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'horizon-testnet.stellar.org') await route.continue()
    else await route.abort('blockedbyclient')
  })
  await mockHorizonAccountHistory(page)
  await page.goto('/connect', { waitUntil: 'domcontentloaded' })
  await page.evaluate((account) => {
    const dashboardWindow = window as typeof window & {
      __store?: { getState: () => { setConnectedAddress: (_value: string) => void } }
    }
    dashboardWindow.__store?.getState().setConnectedAddress(account)
  }, ACCOUNT)
  await page.getByRole('button', { name: 'Treasury', exact: true }).click()
  await expect(page).toHaveURL(/\/treasuryReconciliation(?:\?|$)/)
  await expect(page.getByRole('heading', { name: /Reconciliation.*accounting exports/i })).toBeVisible()
  await expect(page.getByText(/Loading ledger activity/i)).toBeHidden({ timeout: 15_000 })
}

test.describe('Treasury reconciliation workflow', () => {
  test('builds a period and shows the balance waterfall from real account history', async ({ page }) => {
    await openTreasuryDashboard(page)
    await page.getByLabel('Period start time').fill('2000-01-01T00:00:00.000Z')
    await page.getByLabel('Period end time').fill('2100-01-01T00:00:00.000Z')
    await page.getByRole('button', { name: 'Build period' }).click()
    await expect(page.getByRole('heading', { name: 'Balance waterfall' })).toBeVisible()
    await expect(page.getByText('42.5').first()).toBeVisible()
  })

  test('exports a CSV journal after building a period', async ({ page }) => {
    await openTreasuryDashboard(page)
    await page.getByRole('button', { name: 'Build period' }).click()
    await page.getByRole('button', { name: 'exports', exact: true }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download CSV/i }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/journal-.*\.csv/)
  })

  test('lets the user add a category rule', async ({ page }) => {
    await openTreasuryDashboard(page)
    await page.getByRole('button', { name: 'rules', exact: true }).click()
    await page.getByLabel('Rule counterparty pattern').fill(COUNTERPARTY)
    await page.getByLabel('Rule category').fill('Vendor payments')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await expect(page.getByText('Vendor payments')).toBeVisible()
  })

  test('shows the operational-record disclaimer on the methodology tab', async ({ page }) => {
    await openTreasuryDashboard(page)
    await page.getByRole('button', { name: 'methodology', exact: true }).click()
    await expect(page.getByText(/not tax or accounting advice/i)).toBeVisible()
  })

  test('has no detectable accessibility violations on the default view', async ({ page }) => {
    await openTreasuryDashboard(page)
    const results = await new AxeBuilder({ page }).include('[aria-labelledby="treasury-title"]').analyze()
    expect(results.violations).toEqual([])
  })
})
