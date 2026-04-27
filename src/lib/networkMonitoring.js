import { getServer } from './stellar'

const LEDGER_CAPACITY = 1000

export async function fetchValidatorStatus(network = 'testnet') {
  const server = getServer(network)
  try {
    const root = await server.root()
    const healthy = typeof root.core_latest_ledger === 'number' && typeof root.core_supported_protocol_version === 'number'
    return {
      healthy,
      message: healthy ? 'Horizon is connected to Stellar Core' : 'Validator state may be degraded',
      latestCoreLedger: root.core_latest_ledger || null,
      protocolVersion: root.core_supported_protocol_version || null,
      horizonVersion: root.horizon_version || null,
    }
  } catch (error) {
    return {
      healthy: false,
      message: 'Unable to reach Horizon root endpoint',
      error: error?.message || 'Unknown error',
    }
  }
}

export async function fetchNetworkCongestion(network = 'testnet') {
  const server = getServer(network)
  try {
    const [feeStats, ledgerPage] = await Promise.all([
      server.feeStats(),
      server.ledgers().order('desc').limit(10).call(),
    ])

    const ops = ledgerPage.records.map((ledger) => Number(ledger.operation_count) || 0)
    const avgOps = ops.reduce((sum, val) => sum + val, 0) / Math.max(ops.length, 1)
    const load = Math.min(1, avgOps / LEDGER_CAPACITY)
    const level = load >= 0.85 || feeStats.mode_accepted_fee >= 200 ? 'High' : load >= 0.55 || feeStats.mode_accepted_fee >= 100 ? 'Moderate' : 'Normal'

    return {
      load,
      level,
      avgOperations: avgOps,
      range: `${Math.min(...ops)}–${Math.max(...ops)}`,
      feeMode: feeStats.mode_accepted_fee,
      feeMedian: feeStats.median_accepted_fee,
      feeMax: feeStats.max_accepted_fee,
    }
  } catch (error) {
    return {
      load: 0,
      level: 'Unknown',
      avgOperations: 0,
      range: '—',
      feeMode: null,
      feeMedian: null,
      feeMax: null,
      error: error?.message || 'Failed to calculate congestion',
    }
  }
}

export async function fetchFeePredictions(network = 'testnet') {
  const server = getServer(network)
  try {
    const feeStats = await server.feeStats()
    const low = feeStats.p10_accepted_fee || feeStats.min_accepted_fee || feeStats.mode_accepted_fee || 100
    const medium = feeStats.mode_accepted_fee || low
    const high = feeStats.p90_accepted_fee || feeStats.max_accepted_fee || medium * 1.8
    return {
      low,
      medium,
      high,
      recommendation: medium,
      message: `Estimate based on current fee distribution`,
    }
  } catch (error) {
    return {
      low: null,
      medium: null,
      high: null,
      recommendation: null,
      message: 'Unable to calculate fee predictions',
      error: error?.message || 'Unknown error',
    }
  }
}

export async function fetchPerformanceMetrics(network = 'testnet') {
  const server = getServer(network)
  try {
    const page = await server.ledgers().order('desc').limit(20).call()
    const ledgers = page.records
    const sorted = [...ledgers].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))

    const intervals = sorted.slice(1).map((ledger, index) => {
      const previous = sorted[index]
      const currentTime = new Date(ledger.closed_at).getTime()
      const previousTime = new Date(previous.closed_at).getTime()
      return Math.max(0, (currentTime - previousTime) / 1000)
    })

    const averageCloseTime = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0
    const maxCloseTime = intervals.length ? Math.max(...intervals) : 0
    const minCloseTime = intervals.length ? Math.min(...intervals) : 0
    const totalTransactions = ledgers.reduce((sum, ledger) => sum + (Number(ledger.successful_transaction_count) || 0), 0)
    const totalOperations = ledgers.reduce((sum, ledger) => sum + (Number(ledger.operation_count) || 0), 0)
    const txPerSecond = averageCloseTime ? totalTransactions / (averageCloseTime * intervals.length) : 0
    const opsPerSecond = averageCloseTime ? totalOperations / (averageCloseTime * intervals.length) : 0

    return {
      averageCloseTime,
      maxCloseTime,
      minCloseTime,
      totalTransactions,
      totalOperations,
      txPerSecond,
      opsPerSecond,
      ledgerCount: ledgers.length,
    }
  } catch (error) {
    return {
      averageCloseTime: 0,
      maxCloseTime: 0,
      minCloseTime: 0,
      totalTransactions: 0,
      totalOperations: 0,
      txPerSecond: 0,
      opsPerSecond: 0,
      ledgerCount: 0,
      error: error?.message || 'Unable to retrieve performance metrics',
    }
  }
}
