import type {
  PredicateTemplate,
  TemplateExportPayload,
  PredicateNode,
} from '../../types/claimableBalanceExplorer';
import {
  createUnconditional,
  createAbsBefore,
  createRelBefore,
  createAnd,
  createOr,
  createNot,
  validatePredicateTree,
  clonePredicateTree,
} from './predicateTree';

const STORAGE_KEY = 'stellar_claimable_balance_templates_v1';

/**
 * Built-in standard templates
 */
export const DEFAULT_PREDICATE_TEMPLATES: PredicateTemplate[] = [
  {
    id: 'template_immediate',
    name: 'Immediate Unrestricted Claim',
    description: 'Claimant can withdraw funds immediately at any time with no constraints.',
    category: 'custom',
    tags: ['basic', 'unconditional', 'instant'],
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    predicate: createUnconditional(),
  },
  {
    id: 'template_timelock_30d',
    name: '30-Day Cliff Time-Lock',
    description: 'Funds are locked for 30 days from creation, unlocking strictly thereafter.',
    category: 'timelock',
    tags: ['timelock', 'cliff', 'vesting'],
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    predicate: createNot(createRelBefore(30 * 24 * 60 * 60)),
    parameters: [
      {
        key: 'durationSeconds',
        label: 'Lock Duration (Seconds)',
        type: 'duration',
        defaultValue: 30 * 24 * 60 * 60,
      },
    ],
  },
  {
    id: 'template_escrow_clawback',
    name: 'Escrow with Sender Reclaim Window',
    description:
      'Recipient can claim within 14 days; if unclaimed, original sender can reclaim via OR fallback.',
    category: 'escrow',
    tags: ['escrow', 'safety', 'refund'],
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    predicate: createOr(
      createRelBefore(14 * 24 * 60 * 60),
      createNot(createRelBefore(30 * 24 * 60 * 60))
    ),
    parameters: [
      {
        key: 'recipientWindow',
        label: 'Recipient Claim Window (Seconds)',
        type: 'duration',
        defaultValue: 14 * 24 * 60 * 60,
      },
      {
        key: 'senderReclaimWindow',
        label: 'Sender Reclaim After (Seconds)',
        type: 'duration',
        defaultValue: 30 * 24 * 60 * 60,
      },
    ],
  },
  {
    id: 'template_windowed_release',
    name: 'Time-Windowed Claim Window',
    description: 'Can only be claimed between two absolute timestamps (Start Date to End Date).',
    category: 'vesting',
    tags: ['window', 'deadline', 'vesting'],
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    predicate: createAnd(
      createNot(createAbsBefore(Math.floor(Date.now() / 1000) + 86400 * 7)), // Unlocks in 7 days
      createAbsBefore(Math.floor(Date.now() / 1000) + 86400 * 30) // Expires in 30 days
    ),
    parameters: [
      {
        key: 'unlockEpoch',
        label: 'Unlock Epoch Timestamp',
        type: 'date',
        defaultValue: Math.floor(Date.now() / 1000) + 86400 * 7,
      },
      {
        key: 'expiryEpoch',
        label: 'Expiry Epoch Timestamp',
        type: 'date',
        defaultValue: Math.floor(Date.now() / 1000) + 86400 * 30,
      },
    ],
  },
];

/**
 * Load all user and default templates
 */
export function loadAllTemplates(): PredicateTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREDICATE_TEMPLATES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const customIds = new Set(parsed.map((t: PredicateTemplate) => t.id));
      const builtins = DEFAULT_PREDICATE_TEMPLATES.filter((t) => !customIds.has(t.id));
      return [...builtins, ...parsed];
    }
    return DEFAULT_PREDICATE_TEMPLATES;
  } catch {
    return DEFAULT_PREDICATE_TEMPLATES;
  }
}

/**
 * Save a custom user template
 */
export function saveCustomTemplate(template: Omit<PredicateTemplate, 'id' | 'createdAt' | 'version'>): PredicateTemplate {
  const newTemplate: PredicateTemplate = {
    ...template,
    id: `template_custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
    predicate: clonePredicateTree(template.predicate, true),
  };

  const validation = validatePredicateTree(newTemplate.predicate);
  if (!validation.isValid) {
    throw new Error('Cannot save invalid predicate template.');
  }

  const existing = loadAllTemplates().filter((t) => !DEFAULT_PREDICATE_TEMPLATES.some((d) => d.id === t.id));
  existing.push(newTemplate);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  return newTemplate;
}

/**
 * Delete a custom template
 */
export function deleteCustomTemplate(id: string): void {
  const existing = loadAllTemplates().filter(
    (t) => t.id !== id && !DEFAULT_PREDICATE_TEMPLATES.some((d) => d.id === t.id)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Export templates as versioned JSON string
 */
export function exportTemplatesToJson(templates: PredicateTemplate[]): string {
  const payload: TemplateExportPayload = {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    templates,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Import and validate templates from JSON string
 */
export function importTemplatesFromJson(jsonStr: string): {
  success: boolean;
  importedCount: number;
  errors: string[];
} {
  const errors: string[] = [];
  try {
    const payload = JSON.parse(jsonStr);
    if (!payload || typeof payload !== 'object') {
      return { success: false, importedCount: 0, errors: ['Invalid JSON format.'] };
    }

    if (payload.schemaVersion !== '1.0.0') {
      return {
        success: false,
        importedCount: 0,
        errors: [`Unsupported template schema version: ${payload.schemaVersion}`],
      };
    }

    if (!Array.isArray(payload.templates)) {
      return { success: false, importedCount: 0, errors: ['Payload missing "templates" array.'] };
    }

    let count = 0;
    const existing = loadAllTemplates().filter((t) => !DEFAULT_PREDICATE_TEMPLATES.some((d) => d.id === t.id));

    for (const t of payload.templates) {
      if (!t.name || !t.predicate) {
        errors.push(`Skipping template '${t.name || 'Unnamed'}': Missing name or predicate.`);
        continue;
      }
      const val = validatePredicateTree(t.predicate);
      if (!val.isValid) {
        errors.push(`Skipping template '${t.name}': Invalid predicate tree.`);
        continue;
      }
      existing.push({
        ...t,
        id: `template_import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
