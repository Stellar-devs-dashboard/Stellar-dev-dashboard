import React, { useMemo, useState } from 'react'
import { Download, Filter, Search, X } from 'lucide-react'
import { format } from 'date-fns'
import type { Horizon } from '@stellar/stellar-sdk'
import { useStore } from '../../lib/store'
import { shortAddress, getOperationLabel } from '../../lib/stellar'
import CopyableValue from './CopyableValue'
import SearchFilters from '../search/SearchFilters'
import useSearch from '../../hooks/useSearch'
import { usePreferences } from '../../hooks/usePreferences'
import { applyTransactionFilters, applyOperationFilters } from '../../lib/filters'
import { exportCsv, flattenTransaction } from '../../utils/export'
import { VirtualTxList, VirtualOpList, TX_ROW_HEIGHT, OP_ROW_HEIGHT } from './VirtualizedLists'
import {
  useInfiniteTransactions,
  useInfiniteOperations,
  flattenTransactionPages,
  flattenOperationPages,
} from '../../hooks/stellar'
import EnhancedTable, { type TableDensity } from '../common/EnhancedTable'
import { useTablePresets } from '../../hooks/useTablePresets'

const VIRTUAL_SCROLL_THRESHOLD = 200
const PAGE_SIZE = 100

const TRANSACTION_COLUMNS = [
  { id: 'hash', label: 'Hash', width: '2fr' },
  { id: 'ops', label: 'Ops / Time', width: '1fr' },
  { id: 'fee', label: 'Fee', width: '1fr' },
  { id: 'source', label: 'Source', width: '2fr' },
]

const OPERATION_COLUMNS = [
  { id: 'type', label: 'Type / Details', width: '2fr' },
  { id: 'time', label: 'Time', width: '1fr' },
  { id: 'accounts', label: 'Accounts', width: '2fr' },
]

function LoadingRows({ count, height }: { count: number; height: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          style={{
            height,
            margin: '8px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            opacity: 0.6,
          }}
        />
      ))}
    </>
  )
}

function normalizeSearch(value: unknown) {
  return String(value || '').toLowerCase().trim()
}

function searchableText(values) {
  return values.filter(Boolean).join(' ').toLowerCase()
}

function getOperationAccounts(op: Horizon.ServerApi.OperationRecord) {
  const extended = op as Horizon.ServerApi.OperationRecord & Record<string, string | undefined>
  return [
    extended.from,
    extended.to,
    op.source_account,
    extended.account,
    extended.funder,
    extended.into,
    extended.trustor,
    extended.trustee,
    extended.seller,
    extended.buyer,
    extended.selling_asset_issuer,
    extended.buying_asset_issuer,
    extended.asset_issuer,
  ].filter(Boolean)
}

function getOperationAmount(op: Horizon.ServerApi.OperationRecord): string {
  if ('amount' in op && typeof op.amount === 'string') return op.amount
  return ''
}

function getOperationAssetCode(op: Horizon.ServerApi.OperationRecord): string {
  if ('asset_code' in op && typeof op.asset_code === 'string') return op.asset_code
  return 'XLM'
}

function flattenOperation(op: Horizon.ServerApi.OperationRecord) {
  const extended = op as Horizon.ServerApi.OperationRecord & Record<string, string | undefined>
  return {
    id: op.id,
    transaction_hash: op.transaction_hash || '',
    type: op.type,
    type_label: getOperationLabel(op.type),
    created_at: op.created_at,
    from: extended.from || '',
    to: extended.to || '',
    source_account: op.source_account || '',
    account: extended.account || '',
    amount: getOperationAmount(op),
    asset_code: getOperationAssetCode(op),
    asset_issuer: extended.asset_issuer || '',
  }
}

export default function Transactions() {
  const {
    connectedAddress,
    network,
    txScrollPosition,
    setTxScrollPosition,
    opsScrollPosition,
    setOpsScrollPosition,
  } = useStore()

  const [view, setView] = useState('transactions')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedTxHash, setSelectedTxHash] = useState(null)
  const {
    query,
    setQuery,
    filters,
    setFilters,
    savedSearches,
    saveCurrentSearch,
    removeSavedSearch,
    applySavedSearch,
  } = useSearch()
  const { preferences } = usePreferences()

  // Table presets for transactions
  const txPresets = useTablePresets('transactions')
  const [txVisibleColumns, setTxVisibleColumns] = useState(['hash', 'ops', 'fee', 'source'])
  const [txDensity, setTxDensity] = useState<TableDensity>('comfortable')

  // Table presets for operations
  const opPresets = useTablePresets('operations')
  const [opVisibleColumns, setOpVisibleColumns] = useState(['type', 'time', 'accounts'])
  const [opDensity, setOpDensity] = useState<TableDensity>('comfortable')

  // ── React Query data ──────────────────────────────────────────────────────
  const {
    data: txData,
    isLoading: txLoading,
    isFetchingNextPage: txPagingLoading,
    hasNextPage: txHasMore,
    fetchNextPage: fetchMoreTransactions,
  } = useInfiniteTransactions(connectedAddress ?? '', network, PAGE_SIZE, !!connectedAddress)

  const {
    data: opsData,
    isLoading: opsLoading,
    isFetchingNextPage: opsPagingLoading,
    hasNextPage: opsHasMore,
    fetchNextPage: fetchMoreOperations,
  } = useInfiniteOperations(connectedAddress ?? '', network, PAGE_SIZE, !!connectedAddress)

  // Flatten infinite pages into flat arrays
  const transactions = useMemo(() => flattenTransactionPages(txData), [txData])
  const operations = useMemo(() => flattenOperationPages(opsData), [opsData])

  const addressLabels = useMemo(() => {
    return (preferences.savedAddresses || []).reduce((labels, entry) => {
      labels[entry.address] = entry.label
      return labels
    }, {})
  }, [preferences.savedAddresses])

  const filteredTransactions = useMemo(() => {
    let list = transactions
    const q = normalizeSearch(query)

    if (q) {
      list = list.filter((tx) => searchableText([
        tx.hash,
        tx.memo,
        tx.source_account,
        addressLabels[tx.source_account],
        tx.ledger,
        tx.operation_count,
      ]).includes(q))
    }

    return applyTransactionFilters(list, filters)
  }, [transactions, query, filters, addressLabels])

  const filteredOperations = useMemo(() => {
    let list = operations
    const q = normalizeSearch(query)

    if (q) {
      list = list.filter((op) => {
        const accounts = getOperationAccounts(op)
        const labels = accounts.map((account) => addressLabels[account])

        return searchableText([
          op.id,
          op.transaction_hash,
          op.type,
          getOperationLabel(op.type),
          getOperationAmount(op),
          getOperationAssetCode(op),
          ...accounts,
          ...labels,
        ]).includes(q)
      })
    }

    return applyOperationFilters(list, filters)
  }, [operations, query, filters, addressLabels])

  const visibleRows = view === 'transactions' ? filteredTransactions : filteredOperations

  // Load-more callbacks — delegate to React Query, which deduplicates concurrent calls
  const handleLoadMoreTransactions = React.useCallback(async () => {
    if (!txHasMore || txPagingLoading) return
    await fetchMoreTransactions()
  }, [txHasMore, txPagingLoading, fetchMoreTransactions])

  const handleLoadMoreOperations = React.useCallback(async () => {
    if (!opsHasMore || opsPagingLoading) return
    await fetchMoreOperations()
  }, [opsHasMore, opsPagingLoading, fetchMoreOperations])


  function handleExportCsv() {
    if (view === 'transactions') {
      exportCsv(
        filteredTransactions.map((tx) => flattenTransaction(tx as unknown as Record<string, unknown>)),
        `stellar-${network}-filtered-transactions`,
        ['id', 'hash', 'ledger', 'created_at', 'source_account', 'fee_charged', 'operation_count', 'successful', 'memo_type', 'memo']
      )
      return
    }

    exportCsv(
      filteredOperations.map(flattenOperation),
      `stellar-${network}-filtered-operations`,
      ['id', 'transaction_hash', 'type', 'type_label', 'created_at', 'from', 'to', 'source_account', 'account', 'amount', 'asset_code', 'asset_issuer']
    )
  }

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setView(id)}
      style={{
        padding: '7px 16px',
        background: view === id ? 'var(--cyan-glow)' : 'transparent',
        border: `1px solid ${view === id ? 'var(--cyan-dim)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        color: view === id ? 'var(--cyan)' : 'var(--text-secondary)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        transition: 'var(--transition)',
      }}
    >
      {label}
    </button>
  )

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'status') return value !== 'all'
    if (key === 'type') return value !== 'all'
    if (key === 'memoOnly') return value === true
    if (['minFee', 'maxFee', 'minAmount', 'maxAmount', 'startDate', 'endDate'].includes(key)) return value !== ''
    return false
  })

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 10px',
            flex: 1,
          }}>
            <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by account name, address, hash, memo, or operation"
              aria-label="Search transaction history"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                minWidth: 0,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear transaction history search"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '8px 14px',
              background: showFilters ? 'var(--cyan-glow)' : 'var(--bg-elevated)',
              border: `1px solid ${showFilters ? 'var(--cyan-dim)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: showFilters ? 'var(--cyan)' : 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'var(--transition)',
              height: '38px',
            }}
          >
            <Filter size={14} />
            <span>Filters</span>
            {hasActiveFilters && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--cyan)',
                boxShadow: '0 0 8px var(--cyan)',
              }} />
            )}
          </button>

          <button
            onClick={handleExportCsv}
            style={{
              padding: '8px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'var(--transition)',
              height: '38px',
            }}
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <Tab id="transactions" label="Transactions" />
          <Tab id="operations" label="Operations" />
        </div>
      </div>

      {showFilters && (
        <SearchFilters
          filters={filters}
          onChange={setFilters}
          savedSearches={savedSearches}
          onSavePreset={saveCurrentSearch}
          onApplyPreset={applySavedSearch}
          onDeletePreset={removeSavedSearch}
        />
      )}

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Showing {visibleRows.length} filtered {view === 'transactions' ? 'transaction' : 'operation'}{visibleRows.length !== 1 ? 's' : ''}
      </div>

      {view === 'transactions' && (
        <EnhancedTable
          columns={TRANSACTION_COLUMNS}
          visibleColumns={txVisibleColumns}
          onVisibleColumnsChange={setTxVisibleColumns}
          density={txDensity}
          onDensityChange={setTxDensity}
          presets={txPresets.presets}
          onPresetSave={txPresets.onPresetSave}
          onPresetDelete={txPresets.onPresetDelete}
          onPresetApply={txPresets.onPresetApply}
          stickyHeader={true}
          maxHeight="600px"
        >
          {txLoading ? (
            <LoadingRows count={8} height={TX_ROW_HEIGHT} />
          ) : filteredTransactions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {transactions.length === 0 ? 'No transactions found' : 'No transactions match your filters'}
            </div>
          ) : (
            <VirtualTxList
              items={filteredTransactions}
              network={network}
              onLoadMore={handleLoadMoreTransactions}
              hasMore={txHasMore}
              loading={txPagingLoading}
              initialScrollTop={txScrollPosition}
              onScrollPositionChange={setTxScrollPosition}
              addressLabels={addressLabels}
              density={txDensity}
              visibleColumns={txVisibleColumns}
            />
          )}
        </EnhancedTable>
      )}

      {/* Operations panel */}
      {view === 'operations' && (
        <EnhancedTable
          columns={OPERATION_COLUMNS}
          visibleColumns={opVisibleColumns}
          onVisibleColumnsChange={setOpVisibleColumns}
          density={opDensity}
          onDensityChange={setOpDensity}
          presets={opPresets.presets}
          onPresetSave={opPresets.onPresetSave}
          onPresetDelete={opPresets.onPresetDelete}
          onPresetApply={opPresets.onPresetApply}
          stickyHeader={true}
          maxHeight="600px"
        >
          {opsLoading ? (
            <LoadingRows count={8} height={OP_ROW_HEIGHT} />
          ) : filteredOperations.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {operations.length === 0 ? 'No operations found' : 'No operations match your filters'}
            </div>
          ) : (
            <VirtualOpList
              items={filteredOperations}
              network={network}
              onLoadMore={handleLoadMoreOperations}
              hasMore={opsHasMore}
              loading={opsPagingLoading}
              initialScrollTop={opsScrollPosition}
              onScrollPositionChange={setOpsScrollPosition}
              addressLabels={addressLabels}
              density={opDensity}
              visibleColumns={opVisibleColumns}
            />
          )}
        </EnhancedTable>
      )}

      {/* Keyframe animation for spinner — injected once */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .skeleton-pulse { animation: skeleton-pulse 1.5s ease-in-out infinite; }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.25; }
        }
      `}</style>
    </div>
  )
}
