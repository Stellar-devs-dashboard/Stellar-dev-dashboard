import React from 'react';

export default function DeploymentTracker({ status }) {
  if (!status) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}
      >
        No deployment status
      </div>
    );
  }

  const getStatusColor = (stat) => {
    switch (stat) {
      case 'submitted':
      case 'confirmed':
        return 'var(--green)';
      case 'pending':
        return 'var(--amber)';
      case 'failed':
        return 'var(--red)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getStatusIcon = (stat) => {
    switch (stat) {
      case 'submitted':
      case 'confirmed':
        return '✅';
      case 'pending':
        return '⏳';
      case 'failed':
        return '❌';
      default:
        return '📌';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${getStatusColor(status.status)}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: '16px' }}>{getStatusIcon(status.status)}</span>
        <span style={{ color: getStatusColor(status.status), textTransform: 'capitalize' }}>
          {status.status}
        </span>
        {status.isSimulation && (
          <span
            style={{
              fontSize: '10px',
              background: 'rgba(255, 184, 0, 0.2)',
              color: 'var(--amber)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              marginLeft: 'auto',
            }}
          >
            SIMULATION
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          fontSize: '11px',
        }}
      >
        {status.contractId && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Contract ID
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
                color: 'var(--cyan)',
                fontWeight: 600,
                fontSize: '10px',
              }}
            >
              {status.contractId}
            </div>
          </div>
        )}

        {status.txHash && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Transaction Hash
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
                fontSize: '10px',
              }}
            >
              {status.txHash}
            </div>
          </div>
        )}

        {status.sourceAccount && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Source Account
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
                fontSize: '10px',
              }}
            >
              {status.sourceAccount}
            </div>
          </div>
        )}

        {typeof status.constructorArgsCount === 'number' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Constructor Args
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              {status.constructorArgsCount}
            </div>
          </div>
        )}

        {status.networkUsed && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Network
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' }}>
              {status.networkUsed}
            </div>
          </div>
        )}

        {status.timestamp && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              padding: '8px',
              background: 'var(--bg-base)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontSize: '9px',
              }}
            >
              Timestamp
            </div>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
              {new Date(status.timestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {status.error && (
        <div
          style={{
            padding: '12px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--red)',
            fontSize: '11px',
            lineHeight: 1.5,
          }}
        >
          {status.error}
        </div>
      )}

      <pre
        style={{
          margin: 0,
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          fontSize: '9px',
          color: 'var(--text-secondary)',
          overflowX: 'auto',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {JSON.stringify(status, null, 2)}
      </pre>
    </div>
  );
}
