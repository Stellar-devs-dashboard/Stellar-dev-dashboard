import { describe, expect, it, vi } from 'vitest';
import { DiagnosticCollector } from '../collector';

const SECRET = `S${'D'.repeat(55)}`;

function deterministicCollector(maxEvents = 10, maxBreadcrumbs = 10) {
  let clock = 0;
  let ids = 0;
  return new DiagnosticCollector(
    { maxEvents, maxBreadcrumbs },
    () => new Date(Date.UTC(2026, 7, 28, 10, 0, clock++)),
    (prefix) => `${prefix}-${++ids}`
  );
}

describe('DiagnosticCollector', () => {
  it('keeps bounded event and breadcrumb rings with monotonic sequences', () => {
    const collector = deterministicCollector();
    for (let index = 0; index < 15; index += 1) {
      collector.capture({
        category: 'performance',
        name: `render-${index}`,
        message: 'Render measurement.',
        details: { index },
      });
    }
    for (let index = 0; index < 14; index += 1) {
      collector.addBreadcrumb({ action: `step-${index}` });
    }
    const snapshot = collector.getSnapshot();

    expect(snapshot.events).toHaveLength(10);
    expect(snapshot.events[0].name).toBe('render-5');
    expect(snapshot.breadcrumbs).toHaveLength(10);
    expect(snapshot.breadcrumbs[0].action).toBe('step-4');
    expect(snapshot.droppedEvents).toBe(5);
    expect(snapshot.events[snapshot.events.length - 1]?.sequence).toBeLessThan(
      snapshot.breadcrumbs[snapshot.breadcrumbs.length - 1]!.sequence
    );
    expect(JSON.stringify(snapshot)).not.toContain('[UNDEFINED]');
  });

  it('redacts before capture and never exposes a mutable internal record', () => {
    const collector = deterministicCollector();
    const source = { secret: SECRET, nested: { accountId: `G${'E'.repeat(55)}` } };
    const event = collector.capture({
      category: 'signing',
      name: 'signing.failed',
      message: `Signing failed for ${SECRET}`,
      outcome: 'failure',
      details: source,
    });
    source.secret = 'changed-after-capture';
    const first = collector.getSnapshot();
    (first.events[0] as { message: string }).message = 'mutated snapshot';
    (first.events[0].details as { secret: string }).secret = 'mutated nested snapshot';
    const second = collector.getSnapshot();
    const serialized = JSON.stringify(second);

    expect(event?.redactionCount).toBeGreaterThan(0);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('changed-after-capture');
    expect(second.events[0].message).not.toBe('mutated snapshot');
    expect(serialized).not.toContain('mutated nested snapshot');
  });

  it('links request completion causally and accepts only the first finish', () => {
    const collector = deterministicCollector();
    const request = collector.beginRequest('horizon.root', {
      endpointUrl: 'https://example.test/a',
    });
    const completed = request.finish('success', 'Request completed.', { status: 200 });
    const duplicate = request.finish('failure', 'Late failure.');
    const [started, finished] = collector.getSnapshot().events;

    expect(duplicate).toBeNull();
    expect(completed).not.toBeNull();
    expect(started.outcome).toBe('started');
    expect(finished.requestId).toBe(started.requestId);
    expect(finished.correlationId).toBe(started.correlationId);
    expect(finished.causationId).toBe(started.id);
    expect(finished.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('pauses capture, isolates broken subscribers, and resumes without clearing evidence', () => {
    const collector = deterministicCollector();
    const observer = vi.fn();
    collector.subscribe(() => {
      throw new Error('observer failure');
    });
    const unsubscribe = collector.subscribe(observer);
    collector.setEnabled(false);
    expect(
      collector.capture({ category: 'runtime', name: 'paused', message: 'ignored' })
    ).toBeNull();
    collector.setEnabled(true);
    collector.addBreadcrumb({ action: 'resumed' });
    unsubscribe();
    collector.clear();

    expect(observer).toHaveBeenCalled();
    expect(collector.getSnapshot().events).toEqual([]);
    expect(collector.getSnapshot().breadcrumbs).toEqual([]);
  });

  it('re-redacts retained evidence when a new session literal becomes sensitive', () => {
    const collector = deterministicCollector();
    collector.capture({
      category: 'runtime',
      name: 'tenant.failure',
      message: 'The Moonlight-Cascade workspace failed.',
      details: { workspace: 'moonlight-cascade' },
    });
    collector.addBreadcrumb({ action: 'Opened MOONLIGHT-CASCADE workspace' });

    collector.setCustomRules([
      {
        id: 'workspace',
        label: 'Workspace',
        literal: 'moonlight-cascade',
        caseSensitive: false,
        enabled: true,
      },
    ]);
    const snapshot = collector.getSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(serialized.toLowerCase()).not.toContain('moonlight-cascade');
    expect(serialized).toContain('[REDACTED_CUSTOM:workspace]');
    expect(snapshot.totalRedactions).toBeGreaterThanOrEqual(2);
  });
});
