import type { Baseline, ProfileProvenance, ResourceProfile } from '../../types/resourceProfiling';

const REDACTED = '[redacted]';

/**
 * Shortens a Stellar contract/account id to a non-reversible-looking prefix/suffix so exported
 * artifacts, screenshots, and logs don't casually leak full addresses by default.
 */
function redactAddress(value: string | null): string | null {
  if (!value) return value;
  if (value.length <= 10) return REDACTED;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function redactProvenance(provenance: ProfileProvenance): ProfileProvenance {
  return {
    ...provenance,
    contractId: redactAddress(provenance.contractId),
    inputsSummary: redactInputsSummary(provenance.inputsSummary),
  };
}

/**
 * Input summaries are free text built from user-supplied call arguments; strip anything that
 * looks like a G/C-prefixed Stellar strkey or a secret-shaped token before it is persisted,
 * logged, or exported.
 */
export function redactInputsSummary(summary: string): string {
  if (!summary) return summary;
  return summary
    .replace(/\bG[A-Z2-7]{55}\b/g, REDACTED)
    .replace(/\bC[A-Z2-7]{55}\b/g, REDACTED)
    .replace(/\bS[A-Z2-7]{55}\b/g, REDACTED);
}

export function redactResourceProfile(profile: ResourceProfile): ResourceProfile {
  return {
    ...profile,
    provenance: redactProvenance(profile.provenance),
    footprint: profile.footprint.map((entry) => ({ ...entry, xdr: REDACTED })),
  };
}

export function redactBaseline(baseline: Baseline): Baseline {
  return {
    ...baseline,
    profiles: baseline.profiles.map(redactResourceProfile),
  };
}
