import type {
  FeeBumpTemplate,
  FeeBumpExportPayload,
  FeeBumpEnvelopeModel,
} from '../../types/feeBumpSponsorship';
import { validateFeeBumpEnvelope } from './envelopeModel';

const STORAGE_KEY = 'stellar_fee_bump_templates_v1';

export const DEFAULT_FEE_BUMP_TEMPLATES: FeeBumpTemplate[] = [
  {
    id: 'template_sponsored_onboarding',
    name: 'Sponsored Account Onboarding',
    description: 'Creates a new account and sponsors its initial base reserve without funding it from the new user.',
    category: 'onboarding',
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    tags: ['onboarding', 'sponsorship', 'gasless'],
    envelope: {
      isFeeBump: true,
      feeSource: '',
      maxFee: '500',
      innerTransaction: {
        sourceAccount: '',
        sequenceNumber: '0',
        baseFee: '100',
        operations: [
          {
            id: 'op_begin_onboarding',
            type: 'beginSponsoringFutureReserves',
            sourceAccount: '',
            params: { sponsoredId: '' },
          },
          {
            id: 'op_create_acc',
            type: 'createAccount',
            params: { destination: '', startingBalance: '1.0' },
          },
          {
            id: 'op_end_onboarding',
            type: 'endSponsoringFutureReserves',
            params: {},
          },
        ],
        signatures: [],
      },
      outerSignatures: [],
    },
  },
  {
    id: 'template_sponsored_trustline',
    name: 'Sponsored Asset Trustline Setup',
    description: 'Adds an asset trustline to an existing account with the 0.5 XLM entry reserve sponsored by an anchor/app.',
    category: 'sponsored_trustline',
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    tags: ['trustline', 'usdc', 'sponsorship'],
    envelope: {
      isFeeBump: true,
      feeSource: '',
      maxFee: '500',
      innerTransaction: {
        sourceAccount: '',
        sequenceNumber: '0',
        baseFee: '100',
        operations: [
          {
            id: 'op_begin_trustline',
            type: 'beginSponsoringFutureReserves',
            sourceAccount: '',
            params: { sponsoredId: '' },
          },
          {
            id: 'op_change_trust',
            type: 'changeTrust',
            params: { assetCode: 'USDC', assetIssuer: '', limit: '1000000' },
          },
          {
            id: 'op_end_trustline',
            type: 'endSponsoringFutureReserves',
            params: {},
          },
        ],
        signatures: [],
      },
      outerSignatures: [],
    },
  },
  {
    id: 'template_fee_delegation',
    name: 'Third-Party Fee Delegation Wrapper',
    description: 'Wraps any user transaction in a Fee-Bump envelope allowing a backend service or relayer to pay the network fees.',
    category: 'fee_delegation',
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    tags: ['fee-bump', 'delegation', 'relayer'],
    envelope: {
      isFeeBump: true,
      feeSource: '',
      maxFee: '1000',
      innerTransaction: {
        sourceAccount: '',
        sequenceNumber: '0',
        baseFee: '100',
        operations: [
          {
            id: 'op_payment_sample',
            type: 'payment',
            params: { destination: '', amount: '5.0', assetType: 'native' },
          },
        ],
        signatures: [],
      },
      outerSignatures: [],
    },
  },
];

/**
 * Load all user and default fee bump templates
 */
export function loadAllFeeBumpTemplates(): FeeBumpTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_FEE_BUMP_TEMPLATES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const customIds = new Set(parsed.map((t: FeeBumpTemplate) => t.id));
      const builtins = DEFAULT_FEE_BUMP_TEMPLATES.filter((t) => !customIds.has(t.id));
      return [...builtins, ...parsed];
    }
    return DEFAULT_FEE_BUMP_TEMPLATES;
  } catch {
    return DEFAULT_FEE_BUMP_TEMPLATES;
  }
}

/**
 * Save custom fee-bump template
 */
export function saveCustomFeeBumpTemplate(
  template: Omit<FeeBumpTemplate, 'id' | 'createdAt' | 'version'>
): FeeBumpTemplate {
  const newTemplate: FeeBumpTemplate = {
    ...template,
    id: `fb_custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
  };

  const existing = loadAllFeeBumpTemplates().filter(
    (t) => !DEFAULT_FEE_BUMP_TEMPLATES.some((d) => d.id === t.id)
  );
  existing.push(newTemplate);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  return newTemplate;
}

/**
 * Export templates as versioned JSON string with sensitive value redaction
 */
export function exportFeeBumpTemplatesToJson(templates: FeeBumpTemplate[]): string {
  // Redact any signatures or sensitive private keys
  const sanitized = templates.map((t) => {
    const copy = JSON.parse(JSON.stringify(t));
    if (copy.envelope?.innerTransaction?.signatures) {
      copy.envelope.innerTransaction.signatures = [];
    }
    if (copy.envelope?.outerSignatures) {
      copy.envelope.outerSignatures = [];
    }
    return copy;
  });

  const payload: FeeBumpExportPayload = {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    templates: sanitized,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Import templates from JSON
 */
export function importFeeBumpTemplatesFromJson(jsonStr: string): {
  success: boolean;
  importedCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  try {
    const payload = JSON.parse(jsonStr);
    if (!payload || typeof payload !== 'object') {
      return { success: false, importedCount: 0, errors: ['Invalid JSON.'] };
    }
    if (payload.schemaVersion !== '1.0.0') {
      return { success: false, importedCount: 0, errors: [`Unsupported schema version: ${payload.schemaVersion}`] };
    }
    if (!Array.isArray(payload.templates)) {
      return { success: false, importedCount: 0, errors: ['Missing templates array.'] };
    }

    let count = 0;
    const existing = loadAllFeeBumpTemplates().filter(
      (t) => !DEFAULT_FEE_BUMP_TEMPLATES.some((d) => d.id === t.id)
    );

    for (const t of payload.templates) {
      if (!t.name || !t.envelope) {
        errors.push(`Skipping template '${t.name || 'Unnamed'}': Missing name or envelope.`);
        continue;
      }
      existing.push({
        ...t,
        id: `fb_import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        version: '1.0.0',
      });
      count++;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    return {
      success: count > 0,
      importedCount: count,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      importedCount: 0,
      errors: [err.message || 'JSON parse error.'],
    };
  }
}
