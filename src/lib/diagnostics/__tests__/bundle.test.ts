import { describe, expect, it } from 'vitest';
import type { DiagnosticBundle, DiagnosticEvent } from '../../../types/diagnostics';
import {
  DEFAULT_BUNDLE_INCLUSION,
  DiagnosticBundleError,
  buildDiagnosticBundle,
  compareDiagnosticBundles,
  parseDiagnosticBundle,
  serializeDiagnosticBundle,
  verifyDiagnosticBundle,
} from '../bundle';
import { stableCanonicalJson } from '../redaction';

const NOW = new Date('2026-08-28T12:00:00.000Z');

function event(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    schemaVersion: 1,
    id: 'event-1',
    sequence: 1,
    timestamp: NOW.toISOString(),
    category: 'request',
    severity: 'info',
    name: 'horizon.root',
    message: 'Request completed.',
    outcome: 'success',
    details: { status: 200 },
    source: 'probe',
    redactionCount: 0,
    truncated: false,
    ...overrides,
  };
}

async function bundle(
  id: string,
  events: DiagnosticEvent[] = [event()],
  now = NOW
): Promise<DiagnosticBundle> {
  return (
    await buildDiagnosticBundle({
      id,
      now,
      events,
      breadcrumbs: [
        {
          id: 'crumb-1',
          sequence: 2,
          timestamp: now.toISOString(),
          action: 'diagnostics.opened',
          detail: { section: 'overview' },
          redactionCount: 0,
        },
      ],
      environment: {
        capturedAt: now.toISOString(),
        appVersion: '0.1.0',
        buildMode: 'test',
        browserFamily: 'chromium',
        platformClass: 'desktop',
        language: 'en-NG',
        timezone: 'Africa/Lagos',
        viewport: { width: 1440, height: 900 },
        online: true,
        cookieEnabled: true,
      },
      featureFlags: [{ id: 'diagnostics', enabled: true, source: 'runtime' }],
    })
  ).bundle;
}

async function resign(bundle: DiagnosticBundle): Promise<void> {
  const { digest: _digest, ...manifest } = bundle.manifest;
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      stableCanonicalJson({
        kind: bundle.kind,
        schemaVersion: bundle.schemaVersion,
        id: bundle.id,
        createdAt: bundle.createdAt,
        manifest,
        content: bundle.content,
      })
    )
  );
  bundle.manifest.digest = Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
}

describe('diagnostic bundles', () => {
  it('builds a versioned, expiring, SHA-256 verified bundle with preview counts', async () => {
    const preview = await buildDiagnosticBundle({
      id: 'bundle-verifiable',
      now: NOW,
      expiresInDays: 7,
      events: [event()],
      breadcrumbs: [],
    });

    expect(preview.bundle.schemaVersion).toBe(1);
    expect(preview.bundle.manifest.algorithm).toBe('SHA-256');
    expect(preview.bundle.manifest.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.eventCount).toBe(1);
    expect(preview.expiresAt).toBe('2026-09-04T12:00:00.000Z');
    await expect(verifyDiagnosticBundle(preview.bundle, { now: NOW })).resolves.toBe(true);
    await expect(
      parseDiagnosticBundle(serializeDiagnosticBundle(preview.bundle), { now: NOW })
    ).resolves.toMatchObject({ id: 'bundle-verifiable' });
  });

  it('honors field and category inclusion before calculating integrity', async () => {
    const preview = await buildDiagnosticBundle({
      id: 'bundle-minimal',
      now: NOW,
      events: [event(), event({ id: 'event-wallet', category: 'wallet' })],
      breadcrumbs: [
        {
          id: 'crumb',
          sequence: 3,
          timestamp: NOW.toISOString(),
          action: 'wallet.opened',
          detail: { private: 'hidden' },
          redactionCount: 1,
        },
      ],
      environment: {
        capturedAt: NOW.toISOString(),
        appVersion: '0.1.0',
        buildMode: 'test',
        browserFamily: 'chromium',
        platformClass: 'desktop',
        language: 'en-NG',
        timezone: 'Africa/Lagos',
        viewport: { width: 100, height: 100 },
        online: true,
        cookieEnabled: true,
      },
      inclusion: {
        ...DEFAULT_BUNDLE_INCLUSION,
        eventCategories: ['wallet'],
        eventDetails: false,
        breadcrumbs: false,
        environmentLocale: false,
        environmentTimezone: false,
        environmentViewport: false,
      },
    });

    expect(preview.bundle.content.events).toHaveLength(1);
    expect(preview.bundle.content.events[0].category).toBe('wallet');
    expect(preview.bundle.content.events[0].details).toEqual({});
    expect(preview.bundle.content.breadcrumbs).toEqual([]);
    expect(preview.bundle.content.environment).not.toHaveProperty('language');
    expect(preview.bundle.content.environment).not.toHaveProperty('timezone');
    expect(preview.bundle.content.environment).not.toHaveProperty('viewport');
    expect(preview.omittedFields).toEqual(
      expect.arrayContaining(['event details', 'breadcrumbs', 'locale', 'timezone', 'viewport'])
    );
    await expect(verifyDiagnosticBundle(preview.bundle, { now: NOW })).resolves.toBe(true);
  });

  it('rejects tampering, malformed JSON, oversized input, future versions, and expiry', async () => {
    const valid = await bundle('bundle-invalid-cases');
    const tampered = structuredClone(valid);
    tampered.content.events[0].message = 'changed after signing';
    await expect(verifyDiagnosticBundle(tampered, { now: NOW })).rejects.toMatchObject({
      code: 'integrity-failed',
    });
    const manifestTampered = structuredClone(valid);
    manifestTampered.manifest.expiresAt = '2026-09-20T12:00:00.000Z';
    await expect(verifyDiagnosticBundle(manifestTampered, { now: NOW })).rejects.toMatchObject({
      code: 'integrity-failed',
    });
    await expect(parseDiagnosticBundle('{broken', { now: NOW })).rejects.toMatchObject({
      code: 'invalid-bundle',
    });
    await expect(
      parseDiagnosticBundle('x'.repeat(2 * 1024 * 1024 + 1), { now: NOW })
    ).rejects.toMatchObject({ code: 'size-limit' });

    const future = { ...valid, schemaVersion: 99 };
    await expect(parseDiagnosticBundle(JSON.stringify(future), { now: NOW })).rejects.toMatchObject(
      {
        code: 'unsupported-version',
      }
    );
    await expect(
      verifyDiagnosticBundle(valid, { now: new Date('2026-09-10T00:00:00.000Z') })
    ).rejects.toMatchObject({ code: 'expired' });
  });

  it('rejects a correctly signed import when it still contains a redaction bypass', async () => {
    const unsafe = await bundle('bundle-unsafe');
    unsafe.content.events[0].message = `Leaked S${'Z'.repeat(55)}`;
    unsafe.manifest.byteLength = new TextEncoder().encode(
      stableCanonicalJson(unsafe.content)
    ).byteLength;
    await resign(unsafe);

    await expect(parseDiagnosticBundle(JSON.stringify(unsafe), { now: NOW })).rejects.toEqual(
      expect.objectContaining<Partial<DiagnosticBundleError>>({ code: 'invalid-bundle' })
    );
  });

  it('rejects correctly signed records that violate the closed structural schema', async () => {
    const malformed = await bundle('bundle-malformed-record');
    (malformed.content.events[0] as unknown as { category: string }).category = 'arbitrary';
    malformed.manifest.byteLength = new TextEncoder().encode(
      stableCanonicalJson(malformed.content)
    ).byteLength;
    await resign(malformed);

    await expect(parseDiagnosticBundle(JSON.stringify(malformed), { now: NOW })).rejects.toEqual(
      expect.objectContaining({ code: 'invalid-bundle' })
    );

    const unknownField = await bundle('bundle-unknown-field');
    (unknownField.content as unknown as Record<string, unknown>).opaquePayload = {
      arbitrary: 'data',
    };
    unknownField.manifest.byteLength = new TextEncoder().encode(
      stableCanonicalJson(unknownField.content)
    ).byteLength;
    await resign(unknownField);
    await expect(
      parseDiagnosticBundle(JSON.stringify(unknownField), { now: NOW })
    ).rejects.toMatchObject({ code: 'invalid-bundle' });

    const inclusionMismatch = await bundle('bundle-inclusion-mismatch');
    inclusionMismatch.manifest.inclusion.events = false;
    await resign(inclusionMismatch);
    await expect(
      parseDiagnosticBundle(JSON.stringify(inclusionMismatch), { now: NOW })
    ).rejects.toMatchObject({ code: 'invalid-bundle' });
  });

  it('compares category, failure, environment, and integrity changes', async () => {
    const left = await bundle('bundle-left', [
      event({ name: 'wallet.connect', category: 'wallet', outcome: 'failure' }),
    ]);
    const right = await bundle('bundle-right', [
      event({ name: 'rpc.health', category: 'request', outcome: 'failure' }),
      event({ id: 'event-2', name: 'render.ok', category: 'rendering' }),
    ]);
    right.content.environment = { ...right.content.environment, online: false };
    right.manifest.byteLength = new TextEncoder().encode(
      stableCanonicalJson(right.content)
    ).byteLength;
    await resign(right);

    const comparison = await compareDiagnosticBundles(left, right, NOW);
    expect(comparison.integrity).toEqual({ left: true, right: true });
    expect(comparison.eventDelta).toBe(1);
    expect(comparison.newFailureNames).toEqual(['rpc.health']);
    expect(comparison.resolvedFailureNames).toEqual(['wallet.connect']);
    expect(comparison.environmentChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'online', left: 'true', right: 'false' }),
      ])
    );
    expect(comparison.categoryDeltas).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'rendering', delta: 1 })])
    );
  });
});
