import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { METRIC_DESCRIPTORS, formatMetricValue } from '../../lib/resourceProfiling/metrics';
import type { MetricCategory, ResourceProfile } from '../../types/resourceProfiling';
import { cardStyle, mutedStyle } from './styles';

const CATEGORY_COLOR: Record<MetricCategory, string> = {
  compute: 'var(--cyan)',
  storage: 'var(--amber)',
  footprint: 'var(--green)',
  events: 'var(--purple, #a78bfa)',
  size: 'var(--blue, #60a5fa)',
  fee: 'var(--red)',
};

interface TreemapNode {
  name: string;
  size: number;
  category: MetricCategory;
  formatted: string;
}

/**
 * A flame-graph-style breakdown of where a captured profile's resource weight sits, grouped by
 * metric category. Only "weight-shaped" metrics (bytes, instructions, entries) participate --
 * fee metrics are shown in the comparison table instead, since stroops don't share a scale with
 * bytes/instructions and mixing them would make the treemap misleading.
 */
export default function FlameResourceView({ profile }: { profile: ResourceProfile | null }) {
  if (!profile) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>Capture or select a candidate profile to see its resource breakdown.</p>
      </div>
    );
  }

  const nodes: TreemapNode[] = (['cpuInstructions', 'memoryBytes', 'readBytes', 'writeBytes', 'eventSizeBytes', 'returnValueSizeBytes', 'transactionSizeBytes'] as const)
    .map((key) => {
      const value = profile.metrics[key];
      if (typeof value !== 'number' || value <= 0) return null;
      const descriptor = METRIC_DESCRIPTORS[key];
      return { name: descriptor.label, size: value, category: descriptor.category, formatted: formatMetricValue(key, value) };
    })
    .filter((node): node is TreemapNode => node !== null);

  if (nodes.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={mutedStyle}>This profile has no measured weight metrics to visualize (see missing metrics below).</p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 8px' }}>Resource breakdown</h3>
      <div style={{ width: '100%', height: 320 }} role="img" aria-label="Treemap of resource metrics by relative weight">
        <ResponsiveContainer>
          <Treemap
            data={nodes}
            dataKey="size"
            stroke="var(--bg-base)"
            content={<TreemapCell />}
            isAnimationActive={false}
          >
            <Tooltip
              formatter={(_value: number, _name: string, item) => [(item?.payload as TreemapNode)?.formatted ?? '', (item?.payload as TreemapNode)?.name ?? '']}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <ul style={{ ...mutedStyle, display: 'flex', gap: '12px', flexWrap: 'wrap', listStyle: 'none', padding: 0, marginTop: '8px' }}>
        {nodes.map((node) => (
          <li key={node.name}>
            <span aria-hidden="true" style={{ display: 'inline-block', width: '10px', height: '10px', background: CATEGORY_COLOR[node.category], marginRight: '4px' }} />
            {node.name}: {node.formatted}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TreemapCellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  category?: MetricCategory;
}

function TreemapCell(props: TreemapCellProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, category } = props;
  const fill = category ? CATEGORY_COLOR[category] : 'var(--cyan)';
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.35} stroke="var(--bg-base)" />
      {width > 60 && height > 24 && (
        <text x={x + 6} y={y + 16} fontSize={11} fill="var(--text-primary)">
          {name}
        </text>
      )}
    </g>
  );
}
