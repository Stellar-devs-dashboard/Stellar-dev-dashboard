import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as StellarSdk from '@stellar/stellar-sdk';
import SignatureStatus from '../../../src/components/multisig/SignatureStatus';

const KP_A = StellarSdk.Keypair.random();
const KP_B = StellarSdk.Keypair.random();

const makeSession = (overrides = {}) => ({
  id: 'msig-test',
  status: 'collecting',
  threshold: 2,
  requiredSigners: [
    { key: KP_A.publicKey(), weight: 1, label: 'Alice' },
    { key: KP_B.publicKey(), weight: 1, label: 'Bob' },
  ],
  collectedSignatures: [],
  ...overrides,
});

describe('SignatureStatus', () => {
  it('renders status label', () => {
    render(<SignatureStatus session={makeSession()} />);
    expect(screen.getByText(/collecting signatures/i)).toBeInTheDocument();
  });

  it('shows all required signers', () => {
    render(<SignatureStatus session={makeSession()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows "ready to submit" when status is ready', () => {
    render(<SignatureStatus session={makeSession({ status: 'ready' })} />);
    expect(screen.getByText(/ready to submit/i)).toBeInTheDocument();
  });

  it('shows "more weight needed" when threshold not met', () => {
    render(<SignatureStatus session={makeSession()} />);
    expect(screen.getByText(/more weight needed/i)).toBeInTheDocument();
  });

  it('marks signed signers with checkmark', () => {
    const session = makeSession({
      collectedSignatures: [{ signerKey: KP_A.publicKey() }],
    });
    render(<SignatureStatus session={session} />);
    // The ✓ character should appear once (for Alice)
    const checks = screen.getAllByText('✓');
    expect(checks).toHaveLength(1);
  });
});
