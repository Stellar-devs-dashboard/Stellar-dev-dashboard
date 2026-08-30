import React, { useState } from 'react';
import type {
  PredicateNode,
  PredicateType,
  AbsBeforePredicateNode,
  RelBeforePredicateNode,
} from '../../types/claimableBalanceExplorer';
import {
  createUnconditional,
  createAbsBefore,
  createRelBefore,
  createAnd,
  createOr,
  createNot,
  clonePredicateTree,
  explainPredicate,
  validatePredicateTree,
  formatDurationSeconds,
} from '../../lib/claimableBalance/predicateTree';

interface VisualPredicateBuilderProps {
  rootNode: PredicateNode;
  onChange: (node: PredicateNode) => void;
  readOnly?: boolean;
}

export default function VisualPredicateBuilder({
  rootNode,
  onChange,
  readOnly = false,
}: VisualPredicateBuilderProps) {
  const [timezone, setTimezone] = useState<'UTC' | 'Local'>('UTC');
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  const explanation = explainPredicate(rootNode, {
    timezone: timezone === 'Local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  });

  const validation = validatePredicateTree(rootNode);

  function handleUpdateNode(targetId: string, newNode: PredicateNode) {
    function updateRecursive(current: PredicateNode): PredicateNode {
      if (current.id === targetId) {
        return newNode;
      }
      if (current.type === 'not') {
        return { ...current, inner: updateRecursive(current.inner) };
      }
      if (current.type === 'and' || current.type === 'or') {
        return {
          ...current,
          left: updateRecursive(current.left),
          right: updateRecursive(current.right),
        };
      }
      return current;
    }

    const updated = updateRecursive(rootNode);
    onChange(updated);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--bg-surface, #1e222d)',
        border: '1px solid var(--border-color, #2d3343)',
        borderRadius: '8px',
        padding: '16px',
      }}
    >
      {/* Header with summary and controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid var(--border-color, #2d3343)',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary, #fff)' }}>
            Predicate Tree
          </span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: validation.isValid ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
              color: validation.isValid ? '#2ecc71' : '#e74c3c',
            }}
          >
            {validation.isValid ? `Valid (Depth: ${validation.maxDepth}/6)` : 'Invalid Predicate'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setTimezone(timezone === 'UTC' ? 'Local' : 'UTC')}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'var(--bg-muted, #2a2e3d)',
              color: 'var(--text-secondary, #94a3b8)',
              border: '1px solid var(--border-color, #2d3343)',
              cursor: 'pointer',
            }}
          >
            Timezone: {timezone}
          </button>
          <button
            type="button"
            onClick={() => setShowJsonPreview(!showJsonPreview)}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'var(--bg-muted, #2a2e3d)',
              color: 'var(--text-secondary, #94a3b8)',
              border: '1px solid var(--border-color, #2d3343)',
              cursor: 'pointer',
            }}
          >
            {showJsonPreview ? 'Hide AST' : 'View AST'}
          </button>
        </div>
      </div>

      {/* Human readable summary */}
      <div
        style={{
          background: 'rgba(52, 152, 219, 0.08)',
          borderLeft: '3px solid #3498db',
          padding: '8px 12px',
          borderRadius: '0 4px 4px 0',
          fontSize: '13px',
          color: 'var(--text-primary, #e2e8f0)',
        }}
      >
        <strong>Summary:</strong> {explanation.summary}
      </div>

      {/* Validation Warnings/Errors */}
      {validation.issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {validation.issues.map((issue, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '12px',
                color: issue.severity === 'error' ? '#e74c3c' : '#f39c12',
              }}
            >
              • {issue.message}
            </div>
          ))}
        </div>
      )}

      {/* Visual Recursive Tree View */}
      <div
        style={{
          overflowX: 'auto',
          padding: '8px 0',
        }}
      >
        <PredicateNodeRenderer
          node={rootNode}
          onUpdate={handleUpdateNode}
          readOnly={readOnly}
          timezone={timezone}
        />
      </div>

      {/* JSON Preview Modal / Collapsible */}
      {showJsonPreview && (
        <pre
          style={{
            background: 'var(--bg-base, #131722)',
            padding: '12px',
            borderRadius: '6px',
            fontSize: '11px',
            overflowX: 'auto',
            color: '#a5b4fc',
            border: '1px solid var(--border-color, #2d3343)',
          }}
        >
          {JSON.stringify(rootNode, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface PredicateNodeRendererProps {
  node: PredicateNode;
  onUpdate: (targetId: string, newNode: PredicateNode) => void;
  readOnly?: boolean;
  timezone: 'UTC' | 'Local';
  depth?: number;
}

function PredicateNodeRenderer({
  node,
  onUpdate,
  readOnly,
  timezone,
  depth = 1,
}: PredicateNodeRendererProps) {
  function handleChangeType(newType: PredicateType) {
    if (readOnly) return;
    let replacement: PredicateNode;
    switch (newType) {
      case 'unconditional':
        replacement = createUnconditional();
        break;
      case 'absBefore':
        replacement = createAbsBefore(Math.floor(Date.now() / 1000) + 86400 * 7);
        break;
      case 'relBefore':
        replacement = createRelBefore(86400 * 3);
        break;
      case 'and':
        replacement = createAnd(clonePredicateTree(node), createUnconditional());
        break;
      case 'or':
        replacement = createOr(clonePredicateTree(node), createUnconditional());
        break;
      case 'not':
        replacement = createNot(clonePredicateTree(node));
        break;
      default:
        replacement = createUnconditional();
    }
    onUpdate(node.id, replacement);
  }

  const borderColors: Record<PredicateType, string> = {
    unconditional: '#2ecc71',
    absBefore: '#3498db',
    relBefore: '#9b59b6',
    and: '#e67e22',
    or: '#e74c3c',
    not: '#f1c40f',
  };

  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColors[node.type] || '#2d3343'}`,
        paddingLeft: '12px',
        marginLeft: depth > 1 ? '12px' : '0',
        marginTop: '8px',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: `${borderColors[node.type]}22`,
            color: borderColors[node.type],
          }}
        >
          {node.type}
        </span>

        {!readOnly && (
          <select
            value={node.type}
            onChange={(e) => handleChangeType(e.target.value as PredicateType)}
            style={{
              fontSize: '12px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--bg-base, #131722)',
              color: 'var(--text-primary, #fff)',
              border: '1px solid var(--border-color, #2d3343)',
            }}
          >
            <option value="unconditional">Unconditional (Anytime)</option>
            <option value="absBefore">Absolute Timestamp (Before Date)</option>
            <option value="relBefore">Relative Duration (Within Duration)</option>
            <option value="and">AND (Both conditions)</option>
            <option value="or">OR (Either condition)</option>
            <option value="not">NOT (Invert condition)</option>
          </select>
        )}
      </div>

      {/* Node Specific Controls */}
      {node.type === 'absBefore' && (
        <AbsBeforeEditor
          node={node}
          onUpdate={(updated) => onUpdate(node.id, updated)}
          readOnly={readOnly}
          timezone={timezone}
        />
      )}

      {node.type === 'relBefore' && (
        <RelBeforeEditor
          node={node}
          onUpdate={(updated) => onUpdate(node.id, updated)}
          readOnly={readOnly}
        />
      )}

      {node.type === 'not' && (
        <div style={{ marginTop: '4px' }}>
          <PredicateNodeRenderer
            node={node.inner}
            onUpdate={onUpdate}
            readOnly={readOnly}
            timezone={timezone}
            depth={depth + 1}
          />
        </div>
      )}

      {(node.type === 'and' || node.type === 'or') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>
            Branch 1:
          </div>
          <PredicateNodeRenderer
            node={node.left}
            onUpdate={onUpdate}
            readOnly={readOnly}
            timezone={timezone}
            depth={depth + 1}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontWeight: 600 }}>
            Branch 2:
          </div>
          <PredicateNodeRenderer
            node={node.right}
            onUpdate={onUpdate}
            readOnly={readOnly}
            timezone={timezone}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  );
}

function AbsBeforeEditor({
  node,
  onUpdate,
  readOnly,
  timezone,
}: {
  node: AbsBeforePredicateNode;
  onUpdate: (newNode: AbsBeforePredicateNode) => void;
  readOnly?: boolean;
  timezone: 'UTC' | 'Local';
}) {
  const isoStr = new Date(node.epochSeconds * 1000).toISOString().slice(0, 16);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    const epoch = Math.floor(new Date(val).getTime() / 1000);
    if (!isNaN(epoch) && epoch > 0) {
      onUpdate(createAbsBefore(epoch));
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
        Deadline ({timezone}):
      </label>
      <input
        type="datetime-local"
        disabled={readOnly}
        value={isoStr}
        onChange={handleDateChange}
        style={{
          fontSize: '12px',
          padding: '4px 8px',
          borderRadius: '4px',
          background: 'var(--bg-base, #131722)',
          color: 'var(--text-primary, #fff)',
          border: '1px solid var(--border-color, #2d3343)',
        }}
      />
      <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
        (Epoch: {node.epochSeconds}s)
      </span>
    </div>
  );
}

function RelBeforeEditor({
  node,
  onUpdate,
  readOnly,
}: {
  node: RelBeforePredicateNode;
  onUpdate: (newNode: RelBeforePredicateNode) => void;
  readOnly?: boolean;
}) {
  const [days, setDays] = useState(Math.floor(node.durationSeconds / 86400));
  const [hours, setHours] = useState(Math.floor((node.durationSeconds % 86400) / 3600));

  function updateDuration(newDays: number, newHours: number) {
    const total = Math.max(0, newDays * 86400 + newHours * 3600);
    onUpdate(createRelBefore(total));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>Duration:</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          min="0"
          disabled={readOnly}
          value={days}
          onChange={(e) => {
            const d = parseInt(e.target.value, 10) || 0;
            setDays(d);
            updateDuration(d, hours);
          }}
          style={{
            width: '60px',
            fontSize: '12px',
            padding: '4px 6px',
            borderRadius: '4px',
            background: 'var(--bg-base, #131722)',
            color: 'var(--text-primary, #fff)',
            border: '1px solid var(--border-color, #2d3343)',
          }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>days</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          min="0"
          max="23"
          disabled={readOnly}
          value={hours}
          onChange={(e) => {
            const h = parseInt(e.target.value, 10) || 0;
            setHours(h);
            updateDuration(days, h);
          }}
          style={{
            width: '50px',
            fontSize: '12px',
            padding: '4px 6px',
            borderRadius: '4px',
            background: 'var(--bg-base, #131722)',
            color: 'var(--text-primary, #fff)',
            border: '1px solid var(--border-color, #2d3343)',
          }}
        />
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>hours</span>
      </div>

      <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)' }}>
        Total: {formatDurationSeconds(node.durationSeconds)} ({node.durationSeconds}s)
      </span>
    </div>
  );
}
