import { useState } from 'react';
import { NETWORKS, type NetworkName } from '../../lib/stellar';
import type { CaptureSimulationInput } from '../../types/resourceProfiling';
import { buttonStyle, cardStyle, inputStyle, labelStyle, mutedStyle, primaryButtonStyle } from './styles';

type ArgType = CaptureSimulationInput['args'][number]['type'];
const ARG_TYPES: ArgType[] = ['string', 'int', 'address', 'bool'];

export interface CapturePanelProps {
  defaultNetwork: NetworkName;
  online: boolean;
  loading: boolean;
  onCapture: (_input: CaptureSimulationInput) => void;
  onCancel: () => void;
}

export default function CapturePanel({ defaultNetwork, online, loading, onCapture, onCancel }: CapturePanelProps) {
  const [network, setNetwork] = useState<NetworkName>(defaultNetwork);
  const [contractId, setContractId] = useState('');
  const [functionName, setFunctionName] = useState('');
  const [sourceAccount, setSourceAccount] = useState('');
  const [artifactName, setArtifactName] = useState('');
  const [args, setArgs] = useState<CaptureSimulationInput['args']>([]);

  const addArg = () => setArgs((current) => [...current, { type: 'string', value: '' }]);
  const updateArg = (index: number, patch: Partial<CaptureSimulationInput['args'][number]>) =>
    setArgs((current) => current.map((arg, i) => (i === index ? { ...arg, ...patch } : arg)));
  const removeArg = (index: number) => setArgs((current) => current.filter((_arg, i) => i !== index));

  const canSubmit = Boolean(contractId.trim() && functionName.trim() && sourceAccount.trim()) && online && !loading;

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: '0 0 12px' }}>Capture a new profile</h2>
      <p style={mutedStyle}>
        Runs a real Soroban simulation through the dashboard&apos;s shared invocation API and normalizes the result into a
        resource profile. No signature or submission is required.
      </p>

      {!online && (
        <div role="status" style={{ ...mutedStyle, color: 'var(--amber)', marginTop: '8px' }}>
          You&apos;re offline. Capturing a new profile requires network access; saved baselines are still fully usable.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '12px' }}>
        <div>
          <label htmlFor="rp-network" style={labelStyle}>
            Network
          </label>
          <select id="rp-network" style={inputStyle} value={network} onChange={(event) => setNetwork(event.target.value as NetworkName)}>
            {Object.keys(NETWORKS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rp-contract" style={labelStyle}>
            Contract ID
          </label>
          <input id="rp-contract" style={inputStyle} value={contractId} onChange={(event) => setContractId(event.target.value)} placeholder="C..." />
        </div>
        <div>
          <label htmlFor="rp-function" style={labelStyle}>
            Function name
          </label>
          <input id="rp-function" style={inputStyle} value={functionName} onChange={(event) => setFunctionName(event.target.value)} placeholder="transfer" />
        </div>
        <div>
          <label htmlFor="rp-source" style={labelStyle}>
            Source account
          </label>
          <input id="rp-source" style={inputStyle} value={sourceAccount} onChange={(event) => setSourceAccount(event.target.value)} placeholder="G..." />
        </div>
        <div>
          <label htmlFor="rp-artifact" style={labelStyle}>
            Artifact name (optional)
          </label>
          <input
            id="rp-artifact"
            style={inputStyle}
            value={artifactName}
            onChange={(event) => setArtifactName(event.target.value)}
            placeholder="token-contract.wasm"
          />
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={labelStyle}>Arguments</span>
          <button type="button" style={buttonStyle} onClick={addArg}>
            Add argument
          </button>
        </div>
        {args.map((arg, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <select
              aria-label={`Argument ${index + 1} type`}
              style={{ ...inputStyle, maxWidth: '120px' }}
              value={arg.type}
              onChange={(event) => updateArg(index, { type: event.target.value as ArgType })}
            >
              {ARG_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              aria-label={`Argument ${index + 1} value`}
              style={inputStyle}
              value={arg.value}
              onChange={(event) => updateArg(index, { value: event.target.value })}
            />
            <button type="button" style={buttonStyle} onClick={() => removeArg(index)} aria-label={`Remove argument ${index + 1}`}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button
          type="button"
          style={primaryButtonStyle}
          disabled={!canSubmit}
          onClick={() => onCapture({ network, contractId, functionName, sourceAccount, artifactName: artifactName || undefined, args })}
        >
          {loading ? 'Simulating…' : 'Capture profile'}
        </button>
        {loading && (
          <button type="button" style={buttonStyle} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
