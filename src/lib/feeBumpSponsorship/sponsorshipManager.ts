import type {
  SponsoredOperationEntry,
  SponsorshipBoundary,
  RevokeSponsorshipParams,
} from '../../types/feeBumpSponsorship';
import { isValidPublicKey } from '../stellar';

/**
 * Parses an array of operations and identifies all begin/end sponsorship boundaries
 */
export function analyzeSponsorshipBoundaries(
  operations: SponsoredOperationEntry[]
): {
  boundaries: SponsorshipBoundary[];
  unbalancedErrors: string[];
  balancedOperationsCount: number;
} {
  const boundaries: SponsorshipBoundary[] = [];
  const unbalancedErrors: string[] = [];

  interface OpenSponsorship {
    id: string;
    sponsor: string;
    sponsoredAccount: string;
    startIndex: number;
    ops: SponsoredOperationEntry[];
  }

  let activeSponsorship: OpenSponsorship | null = null;
  let balancedCount = 0;

  operations.forEach((op, index) => {
    if (op.type === 'beginSponsoringFutureReserves') {
      if (activeSponsorship) {
        unbalancedErrors.push(
          `Operation #${index + 1}: Nested 'beginSponsoringFutureReserves' detected before previous sponsorship from ${activeSponsorship.sponsor} ended.`
        );
      }

      const sponsor = op.sourceAccount || 'Default Source';
      const sponsoredAccount = op.params?.sponsoredId || op.params?.account || '';

      if (!sponsoredAccount || !isValidPublicKey(sponsoredAccount)) {
        unbalancedErrors.push(
          `Operation #${index + 1}: 'beginSponsoringFutureReserves' missing valid sponsoredId.`
        );
      }

      activeSponsorship = {
        id: `boundary_${index}`,
        sponsor,
        sponsoredAccount,
        startIndex: index,
        ops: [],
      };
    } else if (op.type === 'endSponsoringFutureReserves') {
      if (!activeSponsorship) {
        unbalancedErrors.push(
          `Operation #${index + 1}: 'endSponsoringFutureReserves' found without a preceding 'beginSponsoringFutureReserves'.`
        );
      } else {
        const boundary: SponsorshipBoundary = {
          id: activeSponsorship.id,
          sponsor: activeSponsorship.sponsor,
          sponsoredAccount: activeSponsorship.sponsoredAccount,
          startIndex: activeSponsorship.startIndex,
          endIndex: index,
          operations: [...activeSponsorship.ops],
          isValid: true,
        };

        if (boundary.operations.length === 0) {
          boundary.isValid = false;
          boundary.validationError = 'Empty sponsorship block with no enclosed operations.';
          unbalancedErrors.push(`Sponsorship from ${boundary.sponsor} contains 0 operations.`);
        }

        boundaries.push(boundary);
        balancedCount += boundary.operations.length + 2; // + begin and end
        activeSponsorship = null;
      }
    } else {
      if (activeSponsorship) {
        activeSponsorship.ops.push(op);
      }
    }
  });

  if (activeSponsorship) {
    unbalancedErrors.push(
      `Unterminated sponsorship: 'beginSponsoringFutureReserves' at operation #${(activeSponsorship as OpenSponsorship).startIndex + 1} was never closed with 'endSponsoringFutureReserves'.`
    );
  }

  return {
    boundaries,
    unbalancedErrors,
    balancedOperationsCount: balancedCount,
  };
}

/**
 * Wraps an array of operations with beginSponsoring and endSponsoring brackets
 */
export function wrapWithSponsorship(
  operations: SponsoredOperationEntry[],
  sponsor: string,
  sponsoredAccount: string
): SponsoredOperationEntry[] {
  const beginOp: SponsoredOperationEntry = {
    id: `begin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'beginSponsoringFutureReserves',
    sourceAccount: sponsor,
    params: {
      sponsoredId: sponsoredAccount,
    },
  };

  const endOp: SponsoredOperationEntry = {
    id: `end_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'endSponsoringFutureReserves',
    sourceAccount: sponsoredAccount,
    params: {},
  };

  return [beginOp, ...operations, endOp];
}

/**
 * Creates a Revoke Sponsorship operation entry for any supported ledger entry
 */
export function createRevokeSponsorshipOperation(
  params: RevokeSponsorshipParams,
  sourceAccount?: string
): SponsoredOperationEntry {
  return {
    id: `revoke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'revokeSponsorship',
    sourceAccount,
    params: {
      ...params,
    },
  };
}
