import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { makeCompatibilityProbe } from '../../../tests/fixtures/compatibility';
import { assessCompatibility } from '../../lib/compatibility';
import CompatibilityStatusPanel from './CompatibilityStatusPanel';

describe('CompatibilityStatusPanel', () => {
  it('renders identity, RPC capabilities, freshness, feature gates, and evidence', () => {
    const probe = makeCompatibilityProbe();
    const assessment = assessCompatibility(probe, { now: new Date('2026-08-28T12:01:00.000Z') });
    render(<CompatibilityStatusPanel probe={probe} assessment={assessment} />);
    expect(screen.getByRole('heading', { name: 'Compatibility assessment' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Network identity & bounds' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard feature gates' })).toBeInTheDocument();
    expect(screen.getByLabelText('Soroban RPC method support')).toHaveTextContent(
      'simulateTransaction'
    );
    expect(screen.getByText(/Evidence ledger/)).toBeInTheDocument();
  });

  it('has no detectable WCAG 2.1 AA violations in a degraded result', async () => {
    const probe = makeCompatibilityProbe({ unsupportedMethods: ['getFeeStats'] });
    const assessment = assessCompatibility(probe, { now: new Date('2026-08-28T12:01:00.000Z') });
    const { container } = render(
      <CompatibilityStatusPanel probe={probe} assessment={assessment} />
    );
    const results = await axe(container, { runOnly: { type: 'tag', values: ['wcag21aa'] } });
    expect(results.violations).toEqual([]);
  });
});
