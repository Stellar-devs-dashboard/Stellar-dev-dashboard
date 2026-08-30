import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'
import * as StellarSdk from '@stellar/stellar-sdk'
import { createHash } from 'node:crypto'

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'
const CONTRACT_ID = StellarSdk.StrKey.encodeContract(new Uint8Array(32).fill(9) as unknown as Buffer)
const WASM_BYTES = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
// fetchOnChainWasm cross-checks the fetched code against the hash the instance
// declares, so this fixture must use the real SHA-256 of WASM_BYTES.
const WASM_HASH = createHash('sha256').update(WASM_BYTES).digest()
const CONTRACT_ADDRESS = StellarSdk.Address.fromString(CONTRACT_ID).toScAddress()
const EXT_ZERO = new (StellarSdk.xdr.ExtensionPoint as unknown as new (_value: number) => StellarSdk.xdr.ExtensionPoint)(0)

function instanceEntry(): { key: string; xdr: string } {
  const instance = new StellarSdk.xdr.ScContractInstance({
    executable: StellarSdk.xdr.ContractExecutable.contractExecutableWasm(WASM_HASH),
    storage: [],
  })
  const key = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: CONTRACT_ADDRESS,
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  )
  const entry = StellarSdk.xdr.LedgerEntryData.contractData(
    new StellarSdk.xdr.ContractDataEntry({
      ext: EXT_ZERO,
      contract: CONTRACT_ADDRESS,
      key: StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
      val: StellarSdk.xdr.ScVal.scvContractInstance(instance),
    })
  )
  return { key: key.toXDR('base64'), xdr: entry.toXDR('base64') }
}

function codeEntry(): { key: string; xdr: string } {
  const key = StellarSdk.xdr.LedgerKey.contractCode(new StellarSdk.xdr.LedgerKeyContractCode({ hash: WASM_HASH }))
  const entry = StellarSdk.xdr.LedgerEntryData.contractCode(
    new StellarSdk.xdr.ContractCodeEntry({
      ext: new (StellarSdk.xdr.ContractCodeEntryExt as unknown as new (_value: number) => StellarSdk.xdr.ContractCodeEntryExt)(0),
      hash: WASM_HASH,
      code: WASM_BYTES,
    })
  )
  return { key: key.toXDR('base64'), xdr: entry.toXDR('base64') }
}

async function mockSorobanRpc(page: Page) {
  let callCount = 0
  await page.route('https://soroban-testnet.stellar.org/', async (route: Route) => {
    const body = route.request().postDataJSON() as { id: number; method: string }
    if (body.method !== 'getLedgerEntries') {
      await route.fulfill({ status: 200, json: { jsonrpc: '2.0', id: body.id, result: { entries: [], latestLedger: 100 } } })
      return
    }
    callCount += 1
    const { key, xdr } = callCount === 1 ? instanceEntry() : codeEntry()
    await route.fulfill({
      status: 200,
      json: { jsonrpc: '2.0', id: body.id, result: { entries: [{ key, xdr, lastModifiedLedgerSeq: 100 }], latestLedger: 101 } },
    })
  })
}

async function openWasmVerification(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('stellar-dashboard-theme', 'dark')
    localStorage.setItem('tutorial_state', JSON.stringify({ completed_welcome: Date.now() }))
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
      document.head.appendChild(style)
    })
  })
  await page.route(/^https?:\/\//, async (route) => {
    const hostname = new URL(route.request().url()).hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'soroban-testnet.stellar.org') await route.continue()
    else await route.abort('blockedbyclient')
  })
  await mockSorobanRpc(page)
  await page.goto('/connect', { waitUntil: 'domcontentloaded' })
  await page.evaluate((account) => {
    const dashboardWindow = window as typeof window & {
      __store?: { getState: () => { setConnectedAddress: (_value: string) => void } }
    }
    dashboardWindow.__store?.getState().setConnectedAddress(account)
  }, ACCOUNT)
  await page.getByRole('button', { name: 'Build Verification', exact: true }).click()
  await expect(page).toHaveURL(/\/wasmVerification(?:\?|$)/)
  await expect(page.getByRole('heading', { name: /WASM build verification/i })).toBeVisible()
}

test.describe('WASM build verification workflow', () => {
  test('loads a contract and displays its on-chain artifact', async ({ page }) => {
    await openWasmVerification(page)

    await page.getByLabel('Contract ID').fill(CONTRACT_ID)
    await page.getByRole('button', { name: 'Load', exact: true }).click()

    await expect(page.getByText(/Fetching the deployed WASM/i)).toBeHidden({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Deployed WASM' })).toBeVisible()
    await expect(page.getByText(WASM_HASH.toString('hex')).first()).toBeVisible()
  })

  test('parses a pasted Cargo.lock in the dependencies tab', async ({ page }) => {
    await openWasmVerification(page)
    await page.getByRole('button', { name: 'dependencies', exact: true }).click()
    await page.getByLabel('Cargo.lock contents').fill('[[package]]\nname = "soroban-sdk"\nversion = "21.0.0"\n')
    await expect(page.getByRole('heading', { name: '1 packages' })).toBeVisible()
    await expect(page.locator('span', { hasText: 'soroban-sdk' })).toBeVisible()
  })

  test('rejects a malicious pasted manifest with actionable validation errors', async ({ page }) => {
    await openWasmVerification(page)
    await page.getByRole('button', { name: 'manifest', exact: true }).click()
    await page.getByLabel('Manifest JSON').fill('{"__proto__": {"polluted": true}, "contractId": "not-valid"}')
    await expect(page.getByText(/disallowed key/i)).toBeVisible()
  })

  test('explains the threat model on the methodology tab', async ({ page }) => {
    await openWasmVerification(page)
    await page.getByRole('button', { name: 'methodology', exact: true }).click()
    await expect(page.getByText(/not a trusted third-party signature, code audit/i)).toBeVisible()
  })

  test('has no detectable accessibility violations on the default view', async ({ page }) => {
    await openWasmVerification(page)
    const results = await new AxeBuilder({ page }).include('[aria-labelledby="wasm-verification-title"]').analyze()
    expect(results.violations).toEqual([])
  })
})
