import { formatBytes } from '../../lib/resourceProfiling/metrics';
import type { ResourceProfile } from '../../types/resourceProfiling';
import { cardStyle, mutedStyle, pillStyle, tableStyle, tableWrapStyle, tdStyle, thStyle } from './styles';

export interface HotPathPanelProps {
  profile: ResourceProfile | null;
}

/**
 * Ranks a candidate profile's ledger footprint entries by approximate size so the largest
 * read/write targets -- the most likely places to optimize -- surface first. This is a size
 * ranking of the captured footprint, not a call-graph or execution-trace hot path.
 */
export default function HotPathPanel({ profile }: HotPathPanelProps) {
  if (!profile) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>Capture or select a candidate profile to see its footprint hot paths.</p>
      </div>
    );
  }

  const ranked = [...profile.footprint].sort((a, b) => b.approxSizeBytes - a.approxSizeBytes);

  if (ranked.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>This profile has no captured footprint entries.</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 8px' }}>Footprint hot paths</h3>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Ledger entry type</th>
              <th style={thStyle}>Access</th>
              <th style={thStyle}>Approx. size</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((entry, index) => (
              <tr key={`${entry.xdr}-${index}`}>
                <td style={tdStyle}>#{index + 1}</td>
                <td style={tdStyle}>{entry.type}</td>
                <td style={tdStyle}>
                  <span style={pillStyle(entry.access === 'read-write' ? 'var(--amber)' : 'var(--text-muted)')}>{entry.access}</span>
                </td>
                <td style={tdStyle}>{formatBytes(entry.approxSizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={mutedStyle}>
        Sizes are derived from each ledger key&apos;s XDR encoding, not the full stored entry value, and rank relative
        weight rather than measure exact on-ledger storage cost.
      </p>
    </div>
  );
}
