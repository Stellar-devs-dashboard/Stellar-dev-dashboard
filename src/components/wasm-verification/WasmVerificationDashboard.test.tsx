import React from 'react'
import * as StellarSdk from '@stellar/stellar-sdk'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WasmVerificationDashboard from './WasmVerificationDashboard'
import useWasmVerification from '../../hooks/useWasmVerification'
import { OnChainFetchError } from '../../lib/wasmVerification/onChain'

vi.mock('../../hooks/useWasmVerification')
vi.mock('../../lib/store', () => ({
  useStore: () => ({ network: 'testnet' }),
}))

const CONTRACT_ID = StellarSdk.StrKey.encodeContract(new Uint8Array(32) as unknown as Buffer)

function buildResult(overrides: Partial<ReturnType<typeof useWasmVerification>> = {}) {
  return {
    onChain: { loading: false, error: null, artifact: null, wasmHashHex: null, latestLedger: null },
    candidates: [],
    history: [],
    historyLoading: false,
    refreshOnChain: vi.fn(),
    addCandidateFromFile: vi.fn(),
    addCandidateFromBuildWorker: vi.fn(),
    removeCandidate: vi.fn(),
    runVerification: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWasmVerification>
}

const mocked = vi.mocked(useWasmVerification)

describe('WasmVerificationDashboard', () => {
  beforeEach(() => mocked.mockReturnValue(buildResult()))

  it('renders the header and a contract ID field', () => {
    render(<WasmVerificationDashboard />)
    expect(screen.getByRole('heading', { name: /WASM build verification/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Contract ID')).toBeInTheDocument()
  })

  it('prompts for a contract ID before loading the on-chain artifact', () => {
    render(<WasmVerificationDashboard />)
    expect(screen.getByText(/Enter a contract ID/i)).toBeInTheDocument()
  })

  it('loads a contract once a valid contract ID is submitted', () => {
    render(<WasmVerificationDashboard />)
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: CONTRACT_ID } })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(mocked).toHaveBeenCalled()
  })

  it('shows a retryable error state when the on-chain fetch fails', () => {
    mocked.mockReturnValue(
      buildResult({
        onChain: {
          loading: false,
          error: new OnChainFetchError({ code: 'unavailable', message: 'Network unreachable.', retryable: true }),
          artifact: null,
          wasmHashHex: null,
          latestLedger: null,
        },
      })
    )
    render(<WasmVerificationDashboard />)
    fireEvent.change(screen.getByLabelText('Contract ID'), { target: { value: CONTRACT_ID } })
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Network unreachable/)).toBeInTheDocument()
  })

  it('switches between views via the nav tabs', () => {
    render(<WasmVerificationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'manifest' }))
    expect(screen.getByRole('heading', { name: 'Build manifest' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'dependencies' }))
    expect(screen.getByRole('heading', { name: 'Dependency inventory' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'attestations' }))
    expect(screen.getByRole('heading', { name: 'Generated attestations' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'methodology' }))
    expect(screen.getByRole('heading', { name: /How verification works/i })).toBeInTheDocument()
  })

  it('parses a pasted Cargo.lock in the dependencies view', () => {
    render(<WasmVerificationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'dependencies' }))
    fireEvent.change(screen.getByLabelText('Cargo.lock contents'), {
      target: { value: '[[package]]\nname = "soroban-sdk"\nversion = "21.0.0"\n' },
    })
    expect(screen.getByRole('heading', { name: '1 packages' })).toBeInTheDocument()
    expect(screen.getByText('soroban-sdk')).toBeInTheDocument()
  })

  it('shows an empty state for candidates until one is added', () => {
    render(<WasmVerificationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'candidates' }))
    expect(screen.getByText(/No source candidates yet/i)).toBeInTheDocument()
  })

  it('flags invalid pasted attestation JSON without crashing', () => {
    render(<WasmVerificationDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'attestations' }))
    fireEvent.change(screen.getByLabelText('Attestation JSON to verify'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check attestation' }))
    expect(screen.getByText(/Not valid JSON/i)).toBeInTheDocument()
  })
})
