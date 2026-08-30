import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ClaimableBalanceComposerDashboard from '../ClaimableBalanceComposerDashboard';

// Mock store
vi.mock('../../../lib/store', () => ({
  useStore: () => ({
    connectedAddress: 'GBZXN7PIRZGNMHGA72STUFTOPTQOMBVGLBGQ4G2KYG4XCEBQU7YMGSO2',
    network: 'testnet',
  }),
}));

describe('ClaimableBalanceComposerDashboard', () => {
  it('renders dashboard headers and tabs', () => {
    render(<ClaimableBalanceComposerDashboard />);
    expect(screen.getByText(/Claimable Balance Studio & Lifecycle Explorer/i)).toBeDefined();
    expect(screen.getByText(/Lifecycle Explorer/i)).toBeDefined();
    expect(screen.getByText(/Predicate Templates Vault/i)).toBeDefined();
    expect(screen.getByText(/Reserves & Sponsorship Rules/i)).toBeDefined();
  });
});
