import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ALL_METRIC_KEYS, METRIC_DESCRIPTORS, formatMetricValue } from '../../lib/resourceProfiling/metrics';
import type { Baseline, ResourceMetricKey, ResourceProfile } from '../../types/resourceProfiling';
import { cardStyle, inputStyle, labelStyle, mutedStyle } from './styles';

export interface MetricTimelineProps {
  baseline: Baseline | null;
  candidate: ResourceProfile | null;
}

export default function MetricTimeline({ baseline, candidate }: MetricTimelineProps) {
  const [metric, setMetric] = useState<ResourceMetricKey>('cpuInstructions');

  const availableMetrics = ALL_METRIC_KEYS.filter((key) =>
    (baseline?.profiles ?? []).some((profile) => typeof profile.metrics[key] === 'number')
  );

  if (!baseline || baseline.profiles.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>Select a baseline with at least one sample to see a metric timeline.</p>
      </div>
    );
  }

  const points = baseline.profiles
    .map((profile, index) => {
      const value = profile.metrics[metric];
      return typeof value === 'number' ? { index, capturedAt: profile.provenance.capturedAt, value } : null;
    })
    .filter((point): point is { index: number; capturedAt: string; value: number } => point !== null)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((point, ordinal) => ({ ...point, ordinal: ordinal + 1 }));

  const candidateValue = candidate?.metrics[metric];

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0 }}>Metric timeline</h3>
        <div>
          <label htmlFor="rp-timeline-metric" style={labelStyle}>
            Metric
          </label>
          <select id="rp-timeline-metric" style={inputStyle} value={metric} onChange={(event) => setMetric(event.target.value as ResourceMetricKey)}>
            {(availableMetrics.length > 0 ? availableMetrics : ALL_METRIC_KEYS).map((key) => (
              <option key={key} value={key}>
                {METRIC_DESCRIPTORS[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {points.length === 0 ? (
        <p style={mutedStyle}>No captured samples have this metric yet.</p>
      ) : (
        <div style={{ width: '100%', height: 260, marginTop: '8px' }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="ordinal" tick={{ fontSize: 11 }} label={{ value: 'Sample #', position: 'insideBottom', offset: -4, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(value: number) => formatMetricValue(metric, value)} />
              <Tooltip formatter={(value: number) => formatMetricValue(metric, value)} labelFormatter={(label) => `Sample ${label}`} />
              <Legend />
              <Line type="monotone" dataKey="value" name={METRIC_DESCRIPTORS[metric].label} stroke="var(--cyan)" dot isAnimationActive={false} />
              {typeof candidateValue === 'number' && points.length > 0 && (
                <ReferenceDot
                  x={points[points.length - 1].ordinal + 1}
                  y={candidateValue}
                  r={6}
                  fill="var(--amber)"
                  stroke="var(--bg-base)"
                  label={{ value: 'Candidate', position: 'top', fontSize: 11 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
