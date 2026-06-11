import {
  fetchPaymentPaths,
  isValidPublicKey,
  type NetworkName,
  type PaymentPathRecord,
} from './stellar'

export interface PathPaymentPath extends Omit<PaymentPathRecord, 'path'> {
  path: string[]
}

export interface FetchPathPaymentsParams {
  destination: string
  amount: string
  sourceAsset: string
  sourceAssetIssuer?: string
  destAsset?: string
  destAssetIssuer?: string
  network?: NetworkName
}

function toPathAsset(asset: string, issuer?: string) {
  if (asset === 'native' || asset === 'XLM') {
    return { type: 'native' as const, code: 'XLM' }
  }
  return { type: 'credit' as const, code: asset, issuer: issuer ?? '' }
}

function hopToLabel(hop: PaymentPathRecord['path'][number]): string {
  if (hop.asset_type === 'native') return 'native'
  if (hop.asset_code && hop.asset_issuer) return `${hop.asset_code}:${hop.asset_issuer}`
  return hop.asset_code ?? hop.asset_type
}

export async function fetchPathPayments(
  params: FetchPathPaymentsParams
): Promise<PathPaymentPath[]> {
  if (params.destination && !isValidPublicKey(params.destination)) {
    throw new Error('Destination must be a valid Stellar public key.')
  }

  const sourceAsset = toPathAsset(params.sourceAsset, params.sourceAssetIssuer)
  const destAsset = params.destAsset
    ? toPathAsset(params.destAsset, params.destAssetIssuer)
    : { type: 'native' as const, code: 'XLM' }

  const records = await fetchPaymentPaths({
    sourceAsset,
    destAsset,
    amount: params.amount,
    mode: 'strict-send',
    network: params.network ?? 'testnet',
  })

  return records.map((record) => ({
    ...record,
    path: (record.path ?? []).map(hopToLabel),
  }))
}
