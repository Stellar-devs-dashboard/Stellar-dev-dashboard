import { describe, it, expect } from 'vitest';
import { estimateTransactionReserves } from '../reserveEstimator';
import type { SponsoredOperationEntry } from '../../../types/feeBumpSponsorship';

describe('Reserve Estimator', () => {
  const source = 'GBZXN7PIRZGNMHGA72STUFTOPTQOMBVGLBGQ4G2KYG4XCEBQU7YMGSO2';
  const sponsor = 'GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODBBI';

  it('computes reserves for unsponsored operations', () => {
    const ops: SponsoredOperationEntry[] = [
      {
        id: '1',
        type: 'changeTrust',
        params: { assetCode: 'USDC', assetIssuer: sponsor, limit: '1000' },
      },
    ];

    const breakdown = estimateTransactionReserves(ops, source);
    expect(breakdown.totalReserveRequiredXLM).toBe(0.5);
    expect(breakdown.totalEntriesCount).toBe(1);
    expect(breakdown.impactItems[0].responsibleAccount).toBe(source);
    expect(breakdown.impactItems[0].isSponsored).toBe(false);
  });

  it('attributes liabilities to sponsor when operations are wrapped', () => {
    const ops: SponsoredOperationEntry[] = [
      {
        id: '1',
        type: 'beginSponsoringFutureReserves',
        sourceAccount: sponsor,
        params: { sponsoredId: source },
      },
      {
        id: '2',
        type: 'createAccount',
        params: { destination: 'GNEWACCOUNT', startingBalance: '1.0' },
      },
      {
        id: '3',
        type: 'changeTrust',
        params: { assetCode: 'USDC', assetIssuer: sponsor, limit: '1000' },
      },
      {
        id: '4',
        type: 'endSponsoringFutureReserves',
        params: {},
      },
    ];

    const breakdown = estimateTransactionReserves(ops, source, { [sponsor]: 10.0 });
    // Account creation: 1.0 XLM (2 reserves) + Trustline: 0.5 XLM (1 reserve) = 1.5 XLM
    expect(breakdown.totalReserveRequiredXLM).toBe(1.5);
    expect(breakdown.sponsorObligations[sponsor]).toBeDefined();
    expect(breakdown.sponsorObligations[sponsor].totalReserveXLM).toBe(1.5);
    expect(breakdown.sponsorObligations[sponsor].isSufficient).toBe(true);
  });
});
