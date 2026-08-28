import { useState } from 'react';
import { buttonStyle, cardStyle, mutedStyle, primaryButtonStyle } from './styles';

export interface ExportPanelProps {
  hasBaseline: boolean;
  hasComparison: boolean;
  hasBudgetEvaluation: boolean;
  onExportBaseline: (_redact: boolean) => void;
  onExportComparison: (_redact: boolean) => void;
  onExportCiGate: () => void;
}

export default function ExportPanel({ hasBaseline, hasComparison, hasBudgetEvaluation, onExportBaseline, onExportComparison, onExportCiGate }: ExportPanelProps) {
  const [redact, setRedact] = useState(true);

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 8px' }}>Export</h3>
      <p style={mutedStyle}>
        Exports are versioned JSON documents (schema version tagged) suitable for archiving or feeding a CI gate script.
        Contract/account addresses and free-text call summaries are redacted by default.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0' }}>
        <input type="checkbox" checked={redact} onChange={(event) => setRedact(event.target.checked)} />
        <span style={mutedStyle}>Redact addresses and inputs in exports</span>
      </label>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} disabled={!hasBaseline} onClick={() => onExportBaseline(redact)}>
          Export baseline JSON
        </button>
        <button type="button" style={buttonStyle} disabled={!hasComparison} onClick={() => onExportComparison(redact)}>
          Export comparison JSON
        </button>
        <button type="button" style={primaryButtonStyle} disabled={!hasBudgetEvaluation} onClick={onExportCiGate}>
          Export CI budget gate
        </button>
      </div>
    </div>
  );
}
