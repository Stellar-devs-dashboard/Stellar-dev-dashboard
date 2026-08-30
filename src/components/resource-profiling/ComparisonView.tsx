import { METRIC_DESCRIPTORS, formatMetricValue } from '../../lib/resourceProfiling/metrics';
import type { ComparisonResult } from '../../types/resourceProfiling';
import { cardStyle, classificationColor, mutedStyle, pillStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export interface ComparisonViewProps {
  comparison: ComparisonResult | null;
}

function formatPercentage(value: number | null): string {
  if (value === null) return '—';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

export default function ComparisonView({ comparison }: ComparisonViewProps) {
  if (!comparison) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>
          Select a baseline with at least one sample and capture (or choose) a candidate profile to see a comparison.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={mutedStyle}>Comparing against baseline</div>
            <strong>{comparison.baselineName}</strong>
          </div>
          <span style={pillStyle(classificationColor(comparison.overallClassification))}>{comparison.overallClassification}</span>
        </div>
        <div style={mutedStyle}>
          {comparison.regressionCount} regression{comparison.regressionCount === 1 ? '' : 's'} ·{' '}
          {comparison.improvementCount} improvement{comparison.improvementCount === 1 ? '' : 's'} · generated{' '}
          {new Date(comparison.generatedAt).toLocaleString()}
        </div>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              <th style={thStyle}>Baseline (mean)</th>
              <th style={thStyle}>Candidate</th>
              <th style={thStyle}>Δ</th>
              <th style={thStyle}>Δ%</th>
              <th style={thStyle}>Classification</th>
            </tr>
          </thead>
          <tbody>
            {comparison.metrics.map((metric) => (
              <tr key={metric.metric}>
                <td style={tdStyle}>{METRIC_DESCRIPTORS[metric.metric].label}</td>
                <td style={tdStyle}>{metric.baselineValue === null ? '—' : formatMetricValue(metric.metric, metric.baselineValue)}</td>
                <td style={tdStyle}>{metric.candidateValue === null ? '—' : formatMetricValue(metric.metric, metric.candidateValue)}</td>
                <td style={tdStyle}>{metric.absoluteDelta === null ? '—' : formatMetricValue(metric.metric, metric.absoluteDelta)}</td>
                <td style={tdStyle}>{formatPercentage(metric.percentageDelta)}</td>
                <td style={tdStyle}>
                  <span style={pillStyle(classificationColor(metric.classification))}>{metric.classification}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
