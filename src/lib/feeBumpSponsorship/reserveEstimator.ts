import type {
  SponsoredOperationEntry,
  ReserveRequirementBreakdown,
  ReserveImpactItem,
} from '../../types/feeBumpSponsorship';
import { analyzeSponsorshipBoundaries } from './sponsorshipManager';

const BASE_RESERVE_XLM = 0.5;

/**
 * Calculates detailed reserve impact for all operations in a transaction
 */
export function estimateTransactionReserves(
  operations: SponsoredOperationEntry[],
  defaultSourceAccount: string,
  sponsorBalances: Record<string, number> = {}
): ReserveRequirementBreakdown {
  const impactItems: ReserveImpactItem[] = [];
  const sponsorObligations: ReserveRequirementBreakdown['sponsorObligations'] = {};

  let currentSponsor: string | null = null;

  operations.forEach((op) => {
    if (op.type === 'beginSponsoringFutureReserves') {
      currentSponsor = op.sourceAccount || defaultSourceAccount;
      return;
    }

    if (op.type === 'endSponsoringFutureReserves') {
      currentSponsor = null;
      return;
    }

    const effectiveResponsible = currentSponsor || op.sourceAccount || defaultSourceAccount;
    const isSponsored = currentSponsor !== null;
    const p = op.params || {};

    switch (op.type) {
      case 'createAccount':
        impactItems.push({
          entryType: 'account',
          name: `New Account (${p.destination ? p.destination.slice(0, 8) : 'G...'}...)`,
          reserveAmountXLM: BASE_RESERVE_XLM * 2, // Account takes 2 base reserves (1.0 XLM)
          responsibleAccount: effectiveResponsible,
          isSponsored,
        });
        break;

      case 'changeTrust':
        // Deleting trustline (limit 0) frees a reserve, creating consumes 1 reserve
        if (p.limit === '0' || p.limit === 0) {
          impactItems.push({
            entryType: 'trustline',
            name: `Remove Trustline (${p.assetCode || 'Asset'})`,
            reserveAmountXLM: -BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        } else {
          impactItems.push({
            entryType: 'trustline',
            name: `Add Trustline (${p.assetCode || 'Asset'})`,
            reserveAmountXLM: BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        }
        break;

      case 'manageData':
        if (!p.value || p.value === '') {
          impactItems.push({
            entryType: 'data',
            name: `Delete Data (${p.name})`,
            reserveAmountXLM: -BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        } else {
          impactItems.push({
            entryType: 'data',
            name: `Data Entry (${p.name})`,
            reserveAmountXLM: BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        }
        break;

      case 'manageSellOffer':
      case 'manageBuyOffer':
        if (p.amount === '0' || p.amount === 0) {
          impactItems.push({
            entryType: 'offer',
            name: `Cancel Offer #${p.offerId || '0'}`,
            reserveAmountXLM: -BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        } else {
          impactItems.push({
            entryType: 'offer',
            name: `New DEX Offer`,
            reserveAmountXLM: BASE_RESERVE_XLM,
            responsibleAccount: effectiveResponsible,
            isSponsored,
          });
        }
        break;

      case 'setOptions':
        if (p.signerKey) {
          const weight = parseInt(p.signerWeight || '1', 10);
          if (weight === 0) {
            impactItems.push({
              entryType: 'signer',
              name: `Remove Signer (${p.signerKey.slice(0, 8)}...)`,
              reserveAmountXLM: -BASE_RESERVE_XLM,
              responsibleAccount: effectiveResponsible,
              isSponsored,
            });
          } else {
            impactItems.push({
              entryType: 'signer',
              name: `Add Signer (${p.signerKey.slice(0, 8)}...)`,
              reserveAmountXLM: BASE_RESERVE_XLM,
              responsibleAccount: effectiveResponsible,
              isSponsored,
            });
          }
        }
        break;

      case 'createClaimableBalance': {
        const claimantCount = Array.isArray(p.claimants) ? p.claimants.length : 1;
        const totalCBReserve = BASE_RESERVE_XLM * (1 + claimantCount);
        impactItems.push({
          entryType: 'claimableBalance',
          name: `Claimable Balance (${claimantCount} claimant${claimantCount > 1 ? 's' : ''})`,
          reserveAmountXLM: totalCBReserve,
          responsibleAccount: effectiveResponsible,
          isSponsored,
        });
        break;
      }
    }
  });

  // Calculate totals and sponsor aggregations
  let totalReserve = 0;
  impactItems.forEach((item) => {
    totalReserve += item.reserveAmountXLM;
    if (item.isSponsored) {
      if (!sponsorObligations[item.responsibleAccount]) {
        sponsorObligations[item.responsibleAccount] = {
          sponsorAddress: item.responsibleAccount,
          sponsoredEntriesCount: 0,
          totalReserveXLM: 0,
          availableBalanceXLM: sponsorBalances[item.responsibleAccount],
          isSufficient: true,
        };
      }
      sponsorObligations[item.responsibleAccount].sponsoredEntriesCount += 1;
      sponsorObligations[item.responsibleAccount].totalReserveXLM += item.reserveAmountXLM;
    }
  });

  // Check sufficiency
  Object.values(sponsorObligations).forEach((entry) => {
    if (entry.availableBalanceXLM !== undefined) {
      entry.isSufficient = entry.availableBalanceXLM >= entry.totalReserveXLM;
    }
  });

  return {
    baseReservePerEntry: BASE_RESERVE_XLM,
    totalEntriesCount: impactItems.length,
    totalReserveRequiredXLM: Math.max(0, totalReserve),
    sponsorObligations,
    impactItems,
  };
}
