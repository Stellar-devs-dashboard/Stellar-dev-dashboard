import { describe, it, expect } from 'vitest';
import {
  analyzeSponsorshipBoundaries,
  wrapWithSponsorship,
  createRevokeSponsorshipOperation,
} from '../sponsorshipManager';
import type { SponsoredOperationEntry } from '../../../types/feeBumpSponsorship';

describe('Sponsorship Manager', () => {
  const sponsor = 'GBZXN7PIRZGNMHGA72STUFTOPTQOMBVGLBGQ4G2KYG4XCEBQU7YMGSO2';
  const sponsored = 'GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODBBI';

  it('correctly analyzes balanced sponsorship boundaries', () => {
    const ops: SponsoredOperationEntry[] = [
      {
        id: '1',
        type: 'beginSponsoringFutureReserves',
        sourceAccount: sponsor,
        params: { sponsoredId: sponsored },
      },
      {
        id: '2',
        type: 'changeTrust',
        params: { assetCode: 'USDC', assetIssuer: sponsor },
      },
      {
        id: '3',
        type: 'endSponsoringFutureReserves',
        params: {},
      },
    ];

    const analysis = analyzeSponsorshipBoundaries(ops);
    expect(analysis.unbalancedErrors.length).toBe(0);
    expect(analysis.boundaries.length).toBe(1);
    expect(analysis.boundaries[0].operations.length).toBe(1);
  });

  it('detects unbalanced unterminated sponsorships', () => {
    const ops: SponsoredOperationEntry[] = [
      {
        id: '1',
        type: 'beginSponsoringFutureReserves',
        sourceAccount: sponsor,
        params: { sponsoredId: sponsored },
      },
      {
        id: '2',
        type: 'changeTrust',
        params: { assetCode: 'USDC', assetIssuer: sponsor },
      },
    ];

    const analysis = analyzeSponsorshipBoundaries(ops);
    expect(analysis.unbalancedErrors.length).toBeGreaterThan(0);
    expect(analysis.unbalancedErrors[0]).toContain('Unterminated sponsorship');
  });

  it('wraps operations in sponsorship brackets', () => {
    const innerOps: SponsoredOperationEntry[] = [
      {
        id: 'p1',
        type: 'payment',
        params: { destination: sponsored, amount: '5' },
      },
    ];

    const wrapped = wrapWithSponsorship(innerOps, sponsor, sponsored);
    expect(wrapped.length).toBe(3);
    expect(wrapped[0].type).toBe('beginSponsoringFutureReserves');
    expect(wrapped[1].type).toBe('payment');
    expect(wrapped[2].type).toBe('endSponsoringFutureReserves');
  });

  it('creates revocation operations for various target types', () => {
    const revokeTL = createRevokeSponsorshipOperation({
      type: 'trustline',
      account: sponsored,
      assetCode: 'USDC',
      assetIssuer: sponsor,
    });
    expect(revokeTL.type).toBe('revokeSponsorship');
    expect(revokeTL.params.type).toBe('trustline');
  });
});
