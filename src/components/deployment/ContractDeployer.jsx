import React, { useState } from 'react';
import { useStore } from '../../lib/store';
import WASMUploader from './WASMUploader';
import ConstructorBuilder from './ConstructorBuilder';
import DeploymentTracker from './DeploymentTracker';
import { ContractDeployer } from '../../lib/deployment/ContractDeployer';
import { CostEstimator } from '../../lib/deployment/CostEstimator';
import { getContractUrl } from '../../lib/externalExplorers';

const STEPS = [
  { id: 1, label: 'Upload WASM', icon: '📦' },
  { id: 2, label: 'Constructor Args', icon: '⚙️' },
  { id: 3, label: 'Review & Estimate', icon: '💰' },
  { id: 4, label: 'Deploy', icon: '🚀' },
  { id: 5, label: 'Complete', icon: '✅' },
];

export default function ContractDeployerView() {
  const { network, setDeploymentStatus, connectedAddress } = useStore();
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [wasmFile, setWasmFile] = useState(null);
  const [args, setArgs] = useState([{ type: 'string', value: '' }]);
  const [cost, setCost] = useState(null);
  const [deploymentResult, setDeploymentResult] = useState(null);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorSource, setErrorSource] = useState(null);

  const isMainnet = network === 'mainnet';
  const canProceed = wasmFile && args.some(arg => arg.value.trim() !== '');

  const handleFileChange = (fileData) => {
    if (fileData) {
      setWasmFile(fileData);
      setError(null);
      setErrorSource(null);
    } else {
      setWasmFile(null);
    }
  };

  const handleEstimate = async () => {
    if (!wasmFile?.bytes) return;
    
    setIsLoading(true);
    setError(null);
    setErrorSource(null);
    
    try {
      const deployer = new ContractDeployer();
      const estimate = await deployer.estimateDeploymentCost(
        wasmFile.bytes,
        args.filter(arg => arg.value.trim() !== '')
      );
      setCost(estimate);
      setCurrentStep(4);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to estimate cost';
      setError(msg);
      setErrorSource('estimate');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeploy = async () => {
    if (!wasmFile?.bytes || isMainnet) return;
    
    setIsLoading(true);
    setError(null);
    setErrorSource(null);
    
    try {
      const deployer = new ContractDeployer();
      const result = await deployer.deployContract(
        wasmFile.bytes,
        args.filter(arg => arg.value.trim() !== ''),
        connectedAddress || 'unknown',
        network
      );

      setDeploymentResult(result);
      setDeploymentStatus(result);
      setCurrentStep(5);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setError(msg);
      setErrorSource('deploy');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setWasmFile(null);
    setArgs([{ type: 'string', value: '' }]);
    setCost(null);
    setDeploymentResult(null);
    setError(null);
    setErrorSource(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '16px' }}>
          Soroban Contract Deployment Wizard
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {isMainnet
            ? '🔒 Mainnet Mode: Simulation only. Deploy on testnet for actual deployment.'
            : '✅ Testnet Mode: Full simulation and deployment available.'}
        </p>
      </div>

      {/* Progress Steps */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflow: 'auto',
          paddingBottom: '8px',
        }}
      >
        {STEPS.map((step, idx) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 'fit-content',
            }}
          >
            <button
              onClick={() => step.id < currentStep && setCurrentStep(step.id)}
              disabled={step.id > currentStep}
              style={{
                padding: '8px 12px',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                border: `2px solid ${
                  step.id === currentStep
                    ? 'var(--cyan)'
                    : step.id < currentStep
                      ? 'var(--green)'
                      : 'var(--border)'
                }`,
                background:
                  step.id === currentStep
                    ? 'rgba(34, 211, 238, 0.1)'
                    : step.id < currentStep
                      ? 'rgba(34, 197, 94, 0.1)'
                      : 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                cursor: step.id < currentStep ? 'pointer' : 'default',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition)',
              }}
              title={step.label}
            >
              {step.icon}
            </button>
            {idx < STEPS.length - 1 && (
              <div
                style={{
                  width: '20px',
                  height: '2px',
                  background:
                    step.id < currentStep ? 'var(--green)' : 'var(--border)',
                  transition: 'background var(--transition)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Step 1: Upload WASM */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                Upload WASM File
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Select a compiled Soroban smart contract (.wasm file)
              </p>
            </div>
            <WASMUploader 
              onFile={handleFileChange}
              onError={(err) => {
                setError(err);
                setErrorSource('upload');
              }}
              file={wasmFile}
            />
            {error && errorSource === 'upload' && (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid var(--red)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--red)',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Constructor Arguments */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                Constructor Arguments
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Configure arguments to pass to the contract constructor
              </p>
            </div>
            <ConstructorBuilder
              args={args}
              setArgs={setArgs}
              onError={(err) => {
                setError(err);
                setErrorSource('args');
              }}
            />
          </div>
        )}

        {/* Step 3: Review & Estimate */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                Review & Estimate Costs
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Review your deployment configuration and estimate the fees
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}
            >
              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  WASM Size
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {wasmFile?.sizeKb} KB
                </div>
              </div>

              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  Arguments
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {args.filter(a => a.value.trim() !== '').length}
                </div>
              </div>

              <div
                style={{
                  padding: '12px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '4px',
                  }}
                >
                  Network
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, textTransform: 'capitalize' }}>
                  {network}
                </div>
              </div>
            </div>

            {cost && (
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(34, 211, 238, 0.08)',
                  border: '1px solid var(--cyan)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600 }}>Estimated Cost Breakdown</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div>Base Fee: {(cost.baseStorageFee / 10000000).toFixed(7)} XLM</div>
                  <div>Per KB: {(cost.perKbFee / 10000000).toFixed(7)} XLM</div>
                  <div>Per Arg: {(cost.perArgFee / 10000000).toFixed(7)} XLM</div>
                  <div style={{ fontWeight: 700, color: 'var(--cyan)' }}>
                    Total: {(cost.estimatedFeeStroops / 10000000).toFixed(7)} XLM
                  </div>
                </div>
              </div>
            )}

            {error && errorSource === 'estimate' && (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid var(--red)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--red)',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Deploy */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                {isMainnet ? 'Review Deployment (Simulation)' : 'Deploy Contract'}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {isMainnet
                  ? 'Review the deployment configuration. Actual deployment is disabled on mainnet.'
                  : 'Click deploy to submit the contract to the testnet.'}
              </p>
            </div>

            <div
              style={{
                padding: '16px',
                background: isMainnet ? 'rgba(255, 184, 0, 0.08)' : 'var(--bg-elevated)',
                border: `1px solid ${isMainnet ? 'var(--amber)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Summary
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div>• WASM: {wasmFile?.sizeKb} KB</div>
                <div>• Args: {args.filter(a => a.value.trim() !== '').length}</div>
                <div>• Network: {network}</div>
                {cost && (
                  <div>• Fee: {(cost.estimatedFeeStroops / 10000000).toFixed(7)} XLM</div>
                )}
              </div>
            </div>

            {isMainnet && (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(255, 184, 0, 0.1)',
                  border: '1px solid var(--amber)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--amber)',
                }}
              >
                ⚠️ Mainnet mode: Deployment is disabled for safety. Switch to testnet to deploy.
              </div>
            )}

            {error && errorSource === 'deploy' && (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid var(--red)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  color: 'var(--red)',
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Complete */}
        {currentStep === 5 && deploymentResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>
                ✅ Deployment Complete
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Your contract has been deployed successfully
              </p>
            </div>

            <DeploymentTracker status={deploymentResult} />

            {deploymentResult.contractId && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '12px',
                }}
              >
                <a
                  href={getContractUrl('stellarExpert', network, deploymentResult.contractId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--cyan)',
                    color: 'var(--bg-base)',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    transition: 'opacity var(--transition)',
                  }}
                  onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
                  onMouseLeave={(e) => (e.target.style.opacity = '1')}
                >
                  View on Stellar Expert
                </a>
                <a
                  href={getContractUrl('steexp', network, deploymentResult.contractId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '10px 14px',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-bright)',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    transition: 'all var(--transition)',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'var(--border)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'var(--bg-elevated)';
                  }}
                >
                  View on Steexp
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          style={{
            padding: '10px 16px',
            background:
              currentStep === 1 ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
            color:
              currentStep === 1
                ? 'var(--text-muted)'
                : 'var(--text-primary)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '12px',
            cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
            opacity: currentStep === 1 ? 0.5 : 1,
            transition: 'var(--transition)',
          }}
        >
          ← Previous
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          {currentStep === 1 && (
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!wasmFile}
              style={{
                padding: '10px 16px',
                background: wasmFile ? 'var(--cyan)' : 'var(--bg-elevated)',
                color: wasmFile ? 'var(--bg-base)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: wasmFile ? 'pointer' : 'not-allowed',
                opacity: wasmFile ? 1 : 0.5,
                transition: 'var(--transition)',
              }}
            >
              Next →
            </button>
          )}

          {currentStep === 2 && (
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!canProceed}
              style={{
                padding: '10px 16px',
                background: canProceed ? 'var(--cyan)' : 'var(--bg-elevated)',
                color: canProceed ? 'var(--bg-base)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: canProceed ? 'pointer' : 'not-allowed',
                opacity: canProceed ? 1 : 0.5,
                transition: 'var(--transition)',
              }}
            >
              Next →
            </button>
          )}

          {currentStep === 3 && (
            <button
              onClick={handleEstimate}
              disabled={!wasmFile || isLoading}
              style={{
                padding: '10px 16px',
                background:
                  wasmFile && !isLoading ? 'var(--cyan)' : 'var(--bg-elevated)',
                color:
                  wasmFile && !isLoading
                    ? 'var(--bg-base)'
                    : 'var(--text-muted)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: wasmFile && !isLoading ? 'pointer' : 'not-allowed',
                opacity: wasmFile && !isLoading ? 1 : 0.5,
                transition: 'var(--transition)',
              }}
            >
              {isLoading ? 'Estimating...' : 'Estimate & Continue →'}
            </button>
          )}

          {currentStep === 4 && (
            <>
              <button
                onClick={handleDeploy}
                disabled={isMainnet || isLoading}
                style={{
                  padding: '10px 16px',
                  background:
                    !isMainnet && !isLoading ? 'var(--green)' : 'var(--bg-elevated)',
                  color: !isMainnet && !isLoading ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: !isMainnet && !isLoading ? 'pointer' : 'not-allowed',
                  opacity: !isMainnet && !isLoading ? 1 : 0.5,
                  transition: 'var(--transition)',
                }}
              >
                {isLoading ? 'Deploying...' : '🚀 Deploy to Testnet'}
              </button>
            </>
          )}

          {currentStep === 5 && (
            <button
              onClick={handleReset}
              style={{
                padding: '10px 16px',
                background: 'var(--cyan)',
                color: 'var(--bg-base)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              Start Over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
