# transactionBuilder.js

Multi-operation Stellar transaction builder and simulator.

## `OPERATION_TYPES`

Array of `{ value, label }` objects listing all supported operation types for use in UI selects.

```js
import { OPERATION_TYPES } from './src/lib/transactionBuilder';
// [{ value: 'payment', label: 'Payment' }, ...]
```

## `createOperation(type, params)`

Build a single `StellarSdk.Operation` from a type string and a params object.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `string` | One of the values in `OPERATION_TYPES` |
| `params` | `Object` | Operation-specific fields (see below) |

**Returns:** `StellarSdk.xdr.Operation`

### Supported operation types

| type | Required params |
|------|----------------|
| `payment` | `destination`, `assetType`, `amount` (+ `assetCode`/`assetIssuer` for non-native) |
| `createAccount` | `destination`, `startingBalance` |
| `changeTrust` | `assetCode`, `assetIssuer`, `limit?` |
| `manageSellOffer` | `sellingAsset*`, `buyingAsset*`, `amount`, `price` |
| `manageBuyOffer` | `sellingAsset*`, `buyingAsset*`, `buyAmount`, `price` |
| `setOptions` | `homeDomain?`, `setFlags?`, `clearFlags?` |
| `accountMerge` | `destination` |
| `manageData` | `name`, `value?` |
| `pathPaymentStrictSend` | `sendAsset*`, `sendAmount`, `destination`, `destAsset*`, `destMin`, `path?` |
| `pathPaymentStrictReceive` | `sendAsset*`, `sendMax`, `destination`, `destAsset*`, `destAmount`, `path?` |
| `claimClaimableBalance` | `balanceId` |
| `createClaimableBalance` | `asset*`, `amount`, `claimants` |
| `bumpSequence` | `bumpTo` |
| `revokeSponsorship` | `account` |
| `beginSponsoringFutureReserves` | `sponsoredId` |
| `endSponsoringFutureReserves` | _(none)_ |

## `buildTransaction(params)`

Async. Loads the source account from Horizon and builds a signed-ready `Transaction` object.

```js
const tx = await buildTransaction({
  sourceAccount: 'G...',
  operations: [{ type: 'payment', params: { destination: 'G...', assetType: 'native', amount: '10' } }],
  memo: 'Hello',
  memoType: 'text',  // 'text' | 'id' | 'hash' | 'return'
  baseFee: 100,
  timeout: 180,
  network: 'testnet',
});
```

## `simulateTransaction(params)`

Async. Builds and validates a transaction without submitting it.

**Returns:**
```js
{
  success: boolean,
  errors: string[],
  fee: number,
  operationCount: number,
  xdr: string,
  hash: string,
}
```

## `signAndSubmitTransaction(transaction, secretKey, network?)`

Sign a built transaction with a secret key and submit it to the network.

**Returns:**
```js
{ hash: string, ledger: number, successful: boolean }
```
