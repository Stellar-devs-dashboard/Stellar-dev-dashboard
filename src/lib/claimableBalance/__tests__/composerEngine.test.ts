import { describe, it, expect } from 'vitest';
import {
  estimateClaimableBalanceReserves,
  validateClaimableBalanceParams,
  buildAssetFromSpec,
} from '../composerEngine';
import { createUnconditional } from '../predicateTree';

describe('Composer Engine', () => {
  const validAddress1 = 'GBZXN7PIRZGNMHGA72STUFTOPTQOMBVGLBGQ4G2KYG4XCEBQU7YMGSO2';
  const validAddress2 = 'GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODBBI';

  it('calculates reserve requirements correctly', () => {
    const single = estimateClaimableBalanceReserves(1);
    expect(single.totalReserveRequired).toBe(1.0); // 0.5 base + 0.5 claimant

    const multi = estimateClaimableBalanceReserves(3, validAddress1, 5.0);
    expect(multi.totalReserveRequired).toBe(2.0); // 0.5 base + 1.5 claimants
    expect(multi.isSponsorSufficient).toBe(true);

    const insufficient = estimateClaimableBalanceReserves(3, validAddress1, 1.0);
    expect(insufficient.isSponsorSufficient).toBe(false);
  });

  it('validates claimable balance parameters and rejects malformed inputs', () => {
    const validParams = {
      asset: { type: 'native' as const, code: 'XLM', issuer: '' },
      amount: '100',
      sourceAccount: validAddress1,
      claimants: [
        {
          id: 'c1',
          destination: validAddress2,
          predicate: createUnconditional(),
        },
      ],
    };

    const res = validateClaimableBalanceParams(validParams);
    expect(res.isValid).toBe(true);

    // Test duplicate destination
    const dupParams = {
      ...validParams,
      claimants: [
        { id: 'c1', destination: validAddress2, predicate: createUnconditional() },
        { id: 'c2', destination: validAddress2, predicate: createUnconditional() },
      ],
    };
    const dupRes = validateClaimableBalanceParams(dupParams);
    expect(dupRes.isValid).toBe(false);
    expect(dupRes.errors.some((e) => e.includes('Duplicate destination'))).toBe(true);

    // Test invalid amount
    const badAmount = { ...validParams, amount: '-10' };
    expect(validateClaimableBalanceParams(badAmount).isValid).toBe(false);
  });

  it('builds assets correctly from spec', () => {
    const native = buildAssetFromSpec({ type: 'native', code: 'XLM', issuer: '' });
    expect(native.isNative()).toBe(true);

    const credit = buildAssetFromSpec({
      type: 'credit_alphanum4',
      code: 'USDC',
      issuer: validAddress1,
    });
    expect(credit.getCode()).toBe('USDC');
    expect(credit.getIssuer()).toBe(validAddress1);
  });
});
