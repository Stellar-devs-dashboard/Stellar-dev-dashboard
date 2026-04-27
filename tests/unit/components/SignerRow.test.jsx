import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as StellarSdk from '@stellar/stellar-sdk';
import SignerRow from '../../../src/components/multisig/SignerRow';

const VALID_KEY = StellarSdk.Keypair.random().publicKey();

describe('SignerRow', () => {
  const defaultSigner = { key: VALID_KEY, weight: 2, isMaster: false, label: '' };

  it('renders public key input and weight input', () => {
    render(<SignerRow signer={defaultSigner} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByDisplayValue(VALID_KEY)).toBeInTheDocument();
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
  });

  it('shows remove button when not readOnly', () => {
    render(<SignerRow signer={defaultSigner} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: /remove signer/i })).toBeInTheDocument();
  });

  it('hides remove button when readOnly', () => {
    render(<SignerRow signer={defaultSigner} index={0} onChange={vi.fn()} onRemove={vi.fn()} readOnly />);
    expect(screen.queryByRole('button', { name: /remove signer/i })).toBeNull();
  });

  it('calls onRemove with index when remove clicked', () => {
    const onRemove = vi.fn();
    render(<SignerRow signer={defaultSigner} index={2} onChange={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remove signer/i }));
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('calls onChange when key input changes', () => {
    const onChange = vi.fn();
    render(<SignerRow signer={{ ...defaultSigner, key: '' }} index={0} onChange={onChange} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/G\.\.\. public key/i), { target: { value: 'GNEW' } });
    expect(onChange).toHaveBeenCalledWith(0, 'key', 'GNEW');
  });

  it('shows invalid key error for bad key', () => {
    render(<SignerRow signer={{ ...defaultSigner, key: 'bad-key' }} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText(/invalid public key/i)).toBeInTheDocument();
  });

  it('shows label when provided', () => {
    render(<SignerRow signer={{ ...defaultSigner, label: 'Treasury' }} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Treasury')).toBeInTheDocument();
  });
});
