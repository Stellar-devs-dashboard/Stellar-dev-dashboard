import * as StellarSdk from '@stellar/stellar-sdk'

export const NETWORKS = {
  mainnet: {
    name: 'Mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanUrl: 'https://soroban-rpc.stellar.org',
    passphrase: StellarSdk.Networks.PUBLIC,
  },
  testnet: {
    name: 'Testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanUrl: 'https://soroban-testnet.stellar.org',
    passphrase: StellarSdk.Networks.TESTNET,
    faucetUrl: 'https://friendbot.stellar.org',
  },
}

export function getServer(network = 'testnet') {
  return new StellarSdk.Horizon.Server(NETWORKS[network].horizonUrl)
}

export function getSorobanServer(network = 'testnet') {
  return new StellarSdk.SorobanRpc.Server(NETWORKS[network].sorobanUrl)
}

export async function fetchAccount(publicKey, network = 'testnet') {
  const server = getServer(network)
  return await server.loadAccount(publicKey)
}

export async function fetchTransactions(publicKey, network = 'testnet', limit = 20) {
  const server = getServer(network)
  const txs = await server
    .transactions()
    .forAccount(publicKey)
    .order('desc')
    .limit(limit)
    .call()
  return txs.records
}

export async function fetchOperations(publicKey, network = 'testnet', limit = 20) {
  const server = getServer(network)
  const ops = await server
    .operations()
    .forAccount(publicKey)
    .order('desc')
    .limit(limit)
    .call()
  return ops.records
}

export async function fetchNetworkStats(network = 'testnet') {
  const server = getServer(network)
  const [ledger, feeStats] = await Promise.all([
    server.ledgers().order('desc').limit(1).call(),
    server.feeStats(),
  ])
  return {
    latestLedger: ledger.records[0],
    feeStats,
  }
}

export function streamLedgers(callback, network = 'testnet') {
  const server = getServer(network)
  return server
    .ledgers()
    .cursor('now')
    .stream({
      onmessage: (ledger) => callback(ledger),
      onerror: (error) => console.error('Ledger stream error:', error),
    })
}

export async function fundTestnetAccount(publicKey) {
  const res = await fetch(
    `${NETWORKS.testnet.faucetUrl}?addr=${publicKey}`
  )
  if (!res.ok) throw new Error('Faucet request failed')
  return await res.json()
}

export async function fetchContractInfo(contractId, network = 'testnet') {
  const server = getSorobanServer(network)
  try {
    const instance = await server.getContractData(
      contractId,
      StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance(),
      StellarSdk.SorobanRpc.Durability.Persistent
    )
    return instance
  } catch (e) {
    throw new Error(`Contract not found: ${e.message}`)
  }
}

export function isValidPublicKey(key) {
  return StellarSdk.StrKey.isValidEd25519PublicKey(key)
}

export function isValidContractId(id) {
  try {
    StellarSdk.Address.fromString(id)
    return true
  } catch {
    return false
  }
}

export function formatXLM(amount) {
  return parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })
}

export function shortAddress(addr, chars = 6) {
  if (!addr) return ''
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`
}

export async function buildTransaction({ sourceAccount, operations, memo, baseFee, timeBounds, network }) {
  const server = getServer(network)
  const account = await server.loadAccount(sourceAccount)

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORKS[network].passphrase,
  })

  // Add time bounds if specified
  if (timeBounds.minTime || timeBounds.maxTime) {
    txBuilder.setTimeout(
      timeBounds.maxTime ? parseInt(timeBounds.maxTime) - Math.floor(Date.now() / 1000) : 0
    )
  }

  // Add operations
  operations.forEach(op => {
    if (op.type === 'payment') {
      txBuilder.addOperation(StellarSdk.Operation.payment({
        destination: op.destination,
        asset: StellarSdk.Asset.native(),
        amount: op.amount
      }))
    } else if (op.type === 'createAccount') {
      txBuilder.addOperation(StellarSdk.Operation.createAccount({
        destination: op.destination,
        startingBalance: op.startingBalance
      }))
    }
  })

  // Add memo if specified
  if (memo) {
    txBuilder.addMemo(StellarSdk.Memo.text(memo))
  }

  return txBuilder.build()
}

export async function simulateTransaction(params) {
  try {
    const transaction = await buildTransaction(params)

    // For simulation, we'll validate the transaction structure and estimate fees
    // In a real implementation, you might use Soroban RPC for more detailed simulation

    // Basic validation
    if (!isValidPublicKey(params.sourceAccount)) {
      throw new Error('Invalid source account')
    }

    // Validate operations
    const errors = []
    params.operations.forEach((op, index) => {
      if (op.type === 'payment') {
        if (!isValidPublicKey(op.destination)) {
          errors.push(`Operation ${index + 1}: Invalid destination address`)
        }
        if (!op.amount || parseFloat(op.amount) <= 0) {
          errors.push(`Operation ${index + 1}: Invalid amount`)
        }
      } else if (op.type === 'createAccount') {
        if (!isValidPublicKey(op.destination)) {
          errors.push(`Operation ${index + 1}: Invalid destination address`)
        }
        if (!op.startingBalance || parseFloat(op.startingBalance) < 1) {
          errors.push(`Operation ${index + 1}: Starting balance must be at least 1 XLM`)
        }
      }
    })

    // Calculate estimated fee (base fee * number of operations)
    const estimatedFee = params.baseFee * params.operations.length

    return {
      fee: estimatedFee,
      operationCount: transaction.operations.length,
      success: errors.length === 0,
      errors,
      xdr: transaction.toXDR()
    }
  } catch (error) {
    return {
      fee: 0,
      operationCount: params.operations.length,
      success: false,
      errors: [error.message]
    }
  }
}

export async function exportTransactionXDR(params) {
  const transaction = await buildTransaction(params)
  return transaction.toXDR()
}

export async function fetchXLMPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd')
    const data = await res.json()
    return data.stellar.usd
  } catch (e) {
    console.error('Failed to fetch XLM price:', e)
    return null
  }
}

export async function fetchAssetPrice(assetCode, assetIssuer, network = 'testnet') {
  const server = getServer(network)
  try {
    const asset = new StellarSdk.Asset(assetCode, assetIssuer)
    const native = StellarSdk.Asset.native()

    // Check orderbook: buy XLM by selling the Asset
    // In SDK orderbook(buying, selling)
    const orderbook = await server.orderbook(native, asset).call()

    if (orderbook.bids && orderbook.bids.length > 0) {
      return parseFloat(orderbook.bids[0].price)
    }
    return null
  } catch (e) {
    // Gracefully handle assets with no market
    return null
  }
}

export { StellarSdk }
