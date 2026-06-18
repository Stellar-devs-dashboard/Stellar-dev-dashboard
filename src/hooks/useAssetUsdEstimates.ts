import { useEffect, useState } from 'react';
import { fetchAssetPrice, fetchXLMPrice, type NetworkName } from '../lib/stellar';

export interface BalanceLine {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

export interface AssetUsdEstimate {
  usd: number;
  amount: number;
  priceXlm: number;
  priceUsd: number;
}

export interface UseAssetUsdEstimatesParams {
  balances?: BalanceLine[];
  connectedAddress: string | null | undefined;
  network: NetworkName;
  refreshKey?: string | number;
}

function getBalanceEstimateKey(balance: BalanceLine): string {
  if (balance.asset_type === 'native') return 'native';
  return `${balance.asset_type}:${balance.asset_code || ''}:${balance.asset_issuer || ''}`;
}

export function formatEstimatedUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export default function useAssetUsdEstimates({
  balances = [],
  connectedAddress,
  network,
  refreshKey,
}: UseAssetUsdEstimatesParams) {
  const [estimates, setEstimates] = useState<Record<string, AssetUsdEstimate>>({});
  const balanceSignature = balances
    .map((balance) => `${getBalanceEstimateKey(balance)}:${balance.balance}`)
    .join('|');

  useEffect(() => {
    if (!connectedAddress || balances.length === 0) {
      setEstimates({});
      return;
    }

    let cancelled = false;

    const loadEstimates = async () => {
      setEstimates({});

      try {
        const xlmPrice = await fetchXLMPrice();
        const pricedBalances = await Promise.all(
          balances.map(async (balance): Promise<[string, AssetUsdEstimate] | null> => {
            const amount = parseFloat(balance.balance);

            if (!Number.isFinite(amount)) return null;

            if (balance.asset_type === 'native') {
              return [
                getBalanceEstimateKey(balance),
                {
                  usd: amount * xlmPrice.usd,
                  amount,
                  priceXlm: 1,
                  priceUsd: xlmPrice.usd,
                },
              ];
            }

            try {
              const assetPrice = await fetchAssetPrice(balance, network);
              if (!assetPrice) return null;

              return [
                getBalanceEstimateKey(balance),
                {
                  usd: amount * assetPrice.xlm * xlmPrice.usd,
                  amount,
                  priceXlm: assetPrice.xlm,
                  priceUsd: assetPrice.xlm * xlmPrice.usd,
                },
              ];
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;

        const entries = pricedBalances.filter(
          (entry): entry is [string, AssetUsdEstimate] => entry !== null
        );
        setEstimates(Object.fromEntries(entries));
      } catch {
        if (!cancelled) {
          setEstimates({});
        }
      }
    };

    loadEstimates();

    return () => {
      cancelled = true;
    };
  }, [balanceSignature, connectedAddress, network, refreshKey]);

  return {
    getEstimate: (balance: BalanceLine) => estimates[getBalanceEstimateKey(balance)] || null,
  };
}
