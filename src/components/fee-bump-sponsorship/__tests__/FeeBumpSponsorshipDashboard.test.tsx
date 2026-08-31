import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FeeBumpSponsorshipDashboard from '../FeeBumpSponsorshipDashboard';

// Mock store
vi.mock('../../../lib/store', () => ({
  useStore: () => ({
    connectedAddress: 'GBZXN7PIRZGNMHGA72STUFTOPTQOMBVGLBGQ4G2KYG4XCEBQU7YMGSO2',
    network: 'testnet',
  }),
}));

describe('FeeBumpSponsorshipDashboard', () => {
  it('renders studio title and primary tabs', () => {
    render(<FeeBumpSponsorshipDashboard />);
    expect(screen.getByText(/Fee-Bump & Sponsored-Transaction Studio/i)).toBeDefined();
    expect(screen.getByText(/Envelope Config/i)).toBeDefined();
    expect(screen.getByText(/Reserve Analysis/i)).toBeDefined();
    expect(screen.getByText(/Signer Routing/i)).toBeDefined();
    expect(screen.getByText(/Simulation & Verify/i)).toBeDefined();
    expect(screen.getByText(/Template Vault/i)).toBeDefined();
  });
});
