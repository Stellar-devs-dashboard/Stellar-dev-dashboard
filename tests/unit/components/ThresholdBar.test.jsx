import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThresholdBar from '../../../src/components/multisig/ThresholdBar';

describe('ThresholdBar', () => {
  it('renders label and weight text', () => {
    render(<ThresholdBar currentWeight={2} threshold={4} totalWeight={6} label="Signature Weight" />);
    expect(screen.getByText('Signature Weight')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument();
  });

  it('shows max weight when totalWeight > 0', () => {
    render(<ThresholdBar currentWeight={1} threshold={3} totalWeight={5} label="Test" />);
    expect(screen.getByText(/max 5/)).toBeInTheDocument();
  });

  it('renders without label', () => {
    const { container } = render(<ThresholdBar currentWeight={3} threshold={3} totalWeight={3} />);
    // No label span rendered
    expect(container.querySelector('span')).toBeNull();
  });
});
