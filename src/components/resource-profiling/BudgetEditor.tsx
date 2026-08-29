import { useState } from 'react';
import { ALL_METRIC_KEYS, METRIC_DESCRIPTORS } from '../../lib/resourceProfiling/metrics';
import { createDefaultThreshold } from '../../lib/resourceProfiling/budgetEngine';
import type { BudgetEvaluation, ComparisonThreshold, ResourceBudget, ResourceMetricKey, ThresholdDirection } from '../../types/resourceProfiling';
import { buttonStyle, cardStyle, inputStyle, labelStyle, mutedStyle, pillStyle, primaryButtonStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export interface BudgetEditorProps {
  budgets: ResourceBudget[];
  selectedBudgetId: string | null;
  onSelect: (_id: string) => void;
  onCreate: (_name: string) => void;
  onDelete: (_id: string) => void;
  onSave: (_budget: ResourceBudget) => void;
  evaluation: BudgetEvaluation | null;
}

function ThresholdRow({
  threshold,
  onChange,
  onRemove,
}: {
  threshold: ComparisonThreshold;
  onChange: (_next: ComparisonThreshold) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <td style={tdStyle}>{METRIC_DESCRIPTORS[threshold.metric].label}</td>
      <td style={tdStyle}>
        <input
          aria-label={`${METRIC_DESCRIPTORS[threshold.metric].label} absolute bound`}
          type="number"
          min={0}
          style={inputStyle}
          value={threshold.absolute ?? ''}
          onChange={(event) => onChange({ ...threshold, absolute: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </td>
      <td style={tdStyle}>
        <input
          aria-label={`${METRIC_DESCRIPTORS[threshold.metric].label} percentage bound`}
          type="number"
          min={0}
          step={0.01}
          style={inputStyle}
          value={threshold.percentage ?? ''}
          onChange={(event) => onChange({ ...threshold, percentage: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </td>
      <td style={tdStyle}>
        <select
          aria-label={`${METRIC_DESCRIPTORS[threshold.metric].label} direction`}
          style={inputStyle}
          value={threshold.direction}
          onChange={(event) => onChange({ ...threshold, direction: event.target.value as ThresholdDirection })}
        >
          <option value="increase">increase</option>
          <option value="decrease">decrease</option>
          <option value="any">any</option>
        </select>
      </td>
      <td style={tdStyle}>
        <button type="button" style={buttonStyle} onClick={onRemove} aria-label={`Remove ${METRIC_DESCRIPTORS[threshold.metric].label} threshold`}>
          Remove
        </button>
      </td>
    </tr>
  );
}

export default function BudgetEditor({ budgets, selectedBudgetId, onSelect, onCreate, onDelete, onSave, evaluation }: BudgetEditorProps) {
  const [newBudgetName, setNewBudgetName] = useState('');
  const selected = budgets.find((budget) => budget.id === selectedBudgetId) ?? null;
  const [addMetric, setAddMetric] = useState<ResourceMetricKey>('cpuInstructions');

  if (budgets.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>No budgets yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {budgets.map((budget) => (
            <button
              key={budget.id}
              type="button"
              aria-pressed={budget.id === selectedBudgetId}
              style={budget.id === selectedBudgetId ? primaryButtonStyle : buttonStyle}
              onClick={() => onSelect(budget.id)}
            >
              {budget.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input aria-label="New budget name" style={inputStyle} value={newBudgetName} onChange={(event) => setNewBudgetName(event.target.value)} placeholder="New budget name" />
          <button
            type="button"
            style={buttonStyle}
            disabled={!newBudgetName.trim()}
            onClick={() => {
              onCreate(newBudgetName.trim());
              setNewBudgetName('');
            }}
          >
            New budget
          </button>
          {selected && budgets.length > 1 && (
            <button type="button" style={buttonStyle} onClick={() => onDelete(selected.id)}>
              Delete selected
            </button>
          )}
        </div>
      </div>

      {selected && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>{selected.name}</h3>
            {evaluation && (
              <span style={pillStyle(evaluation.pass ? 'var(--green)' : 'var(--red)')}>{evaluation.pass ? 'PASS' : 'FAIL'}</span>
            )}
          </div>
          <label htmlFor="rp-budget-description" style={labelStyle}>
            Description
          </label>
          <input
            id="rp-budget-description"
            style={inputStyle}
            value={selected.description}
            onChange={(event) => onSave({ ...selected, description: event.target.value })}
          />

          <div style={{ ...tableWrapStyle, marginTop: '12px' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Metric</th>
                  <th style={thStyle}>Absolute bound</th>
                  <th style={thStyle}>Percentage bound</th>
                  <th style={thStyle}>Direction</th>
                  <th style={thStyle}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.thresholds.map((threshold, index) => (
                  <ThresholdRow
                    key={threshold.metric}
                    threshold={threshold}
                    onChange={(next) =>
                      onSave({ ...selected, thresholds: selected.thresholds.map((item, i) => (i === index ? next : item)) })
                    }
                    onRemove={() => onSave({ ...selected, thresholds: selected.thresholds.filter((_item, i) => i !== index) })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'flex-end' }}>
            <div>
              <label htmlFor="rp-add-metric" style={labelStyle}>
                Add threshold for
              </label>
              <select id="rp-add-metric" style={inputStyle} value={addMetric} onChange={(event) => setAddMetric(event.target.value as ResourceMetricKey)}>
                {ALL_METRIC_KEYS.filter((key) => !selected.thresholds.some((threshold) => threshold.metric === key)).map((key) => (
                  <option key={key} value={key}>
                    {METRIC_DESCRIPTORS[key].label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => onSave({ ...selected, thresholds: [...selected.thresholds, createDefaultThreshold(addMetric)] })}
            >
              Add threshold
            </button>
          </div>

          {evaluation && evaluation.results.some((result) => !result.pass) && (
            <ul style={{ marginTop: '12px' }}>
              {evaluation.results
                .filter((result) => !result.pass)
                .map((result) => (
                  <li key={result.metric} style={{ color: 'var(--red)' }}>
                    {result.reason}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
