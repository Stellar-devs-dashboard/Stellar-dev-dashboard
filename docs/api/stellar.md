# stellar.js

Horizon and Soroban RPC wrappers with built-in caching and rate limiting.

## Functions

### `fetchAccount(publicKey, network?, identifier?)`

Loads a Stellar account record.

```js
const account = await fetchAccount('GABC...', 'testnet');
console.log(account.balances);
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| publicKey | string | required | G... address |
| network | `'testnet'` \| `'mainnet'` | `'testnet'` | Network to query |
| identifier | string | `'anonymous'` | Rate limit bucket |

Returns: `Promise<AccountRecord>`

---

### `fetchTransactions(publicKey, network?, limit?, cursor?, identifier?)`

Fetches paginated transaction history for an account.

```js
const txs = await fetchTransactions('GABC...', 'testnet', 20);
txs.records.forEach(tx => console.log(tx.hash));
```

Returns: `Promise<{ records: TransactionRecord[], next: fn, prev: fn }>`

---

### `fetchNetworkStats(network?, identifier?)`

Returns latest ledger info and fee statistics.

```js
const { latestLedger, feeStats } = await fetchNetworkStats('mainnet');
```

---

### `fetchXLMPrice(identifier?)`

Fetches current XLM/USD price from CoinGecko with SDEX fallback.

```js
const { usd } = await fetchXLMPrice();
```

---

### `getServer(network?)`

Returns a configured `Horizon.Server` instance.

```js
const server = getServer('mainnet');
const ledger = await server.ledgers().order('desc').limit(1).call();
```

---

### `getSorobanServer(network?)`

Returns a configured `SorobanRpc.Server` instance for contract interactions.

---

### `getOperationLabel(type)`

Returns a human-readable label for a Stellar operation type.

```js
getOperationLabel('invoke_host_function'); // → "Contract Call"
```

---

## Constants

### `NETWORKS`

```js
{
  mainnet: { name, horizonUrl, sorobanUrl, passphrase },
  testnet: { name, horizonUrl, sorobanUrl, passphrase, faucetUrl },
}
```
