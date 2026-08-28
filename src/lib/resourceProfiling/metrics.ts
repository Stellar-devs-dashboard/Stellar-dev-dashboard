import type { MetricDescriptor, ResourceMetricKey } from '../../types/resourceProfiling';

export const METRIC_DESCRIPTORS: Record<ResourceMetricKey, MetricDescriptor> = {
  cpuInstructions: {
    key: 'cpuInstructions',
    label: 'CPU instructions',
    category: 'compute',
    unit: 'instructions',
    higherIsWorse: true,
  },
  memoryBytes: {
    key: 'memoryBytes',
    label: 'Memory',
    category: 'compute',
    unit: 'bytes',
    higherIsWorse: true,
  },
  readBytes: {
    key: 'readBytes',
    label: 'Read bytes',
    category: 'storage',
    unit: 'bytes',
    higherIsWorse: true,
  },
  writeBytes: {
    key: 'writeBytes',
    label: 'Write bytes',
    category: 'storage',
    unit: 'bytes',
    higherIsWorse: true,
  },
  readLedgerEntries: {
    key: 'readLedgerEntries',
    label: 'Read ledger entries',
    category: 'footprint',
    unit: 'entries',
    higherIsWorse: true,
  },
  writeLedgerEntries: {
    key: 'writeLedgerEntries',
    label: 'Write ledger entries',
    category: 'footprint',
    unit: 'entries',
    higherIsWorse: true,
  },
  eventCount: {
    key: 'eventCount',
    label: 'Events emitted',
    category: 'events',
    unit: 'count',
    higherIsWorse: true,
  },
  eventSizeBytes: {
    key: 'eventSizeBytes',
    label: 'Event payload size',
    category: 'events',
    unit: 'bytes',
    higherIsWorse: true,
  },
  returnValueSizeBytes: {
    key: 'returnValueSizeBytes',
    label: 'Return value size',
    category: 'size',
    unit: 'bytes',
    higherIsWorse: true,
  },
  transactionSizeBytes: {
    key: 'transactionSizeBytes',
    label: 'Transaction size',
    category: 'size',
    unit: 'bytes',
    higherIsWorse: true,
  },
  resourceFeeStroops: {
    key: 'resourceFeeStroops',
    label: 'Resource fee',
    category: 'fee',
    unit: 'stroops',
    higherIsWorse: true,
  },
  inclusionFeeStroops: {
    key: 'inclusionFeeStroops',
    label: 'Inclusion fee',
    category: 'fee',
    unit: 'stroops',
    higherIsWorse: true,
  },
  totalFeeStroops: {
    key: 'totalFeeStroops',
    label: 'Total fee',
    category: 'fee',
    unit: 'stroops',
    higherIsWorse: true,
  },
};

export const ALL_METRIC_KEYS = Object.keys(METRIC_DESCRIPTORS) as ResourceMetricKey[];

export const DEFAULT_THRESHOLD_METRICS: ResourceMetricKey[] = [
  'cpuInstructions',
  'memoryBytes',
  'readBytes',
  'writeBytes',
  'transactionSizeBytes',
  'totalFeeStroops',
];

/** Values beyond this are treated as instrumentation errors, not real resource usage. */
export const METRIC_SANITY_CEILING = 100_000_000_000; // 100B

export function formatMetricValue(key: ResourceMetricKey, value: number): string {
  const descriptor = METRIC_DESCRIPTORS[key];
  if (!Number.isFinite(value)) return '—';
  switch (descriptor.unit) {
    case 'bytes':
      return formatBytes(value);
    case 'stroops':
      return `${value.toLocaleString()} stroops`;
    default:
      return value.toLocaleString();
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes.toLocaleString()} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
