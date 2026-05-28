import React, { useState } from 'react';
import { WASMProcessor } from '../../lib/deployment/WASMProcessor';

const ARGUMENT_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'int', label: 'Integer' },
  { value: 'bool', label: 'Boolean' },
  { value: 'address', label: 'Address' },
  { value: 'bytes', label: 'Bytes (hex)' },
];

export default function ConstructorBuilder({ args = [], setArgs, onError }) {
  const [localErrors, setLocalErrors] = useState({});

  const handleArgChange = (index, field, value) => {
    const newArgs = [...args];
    if (!newArgs[index]) {
      newArgs[index] = { type: 'string', value: '' };
    }
    newArgs[index][field] = value;
    setArgs(newArgs);

    // Validate on change
    const errors = {};
    newArgs.forEach((arg, i) => {
      if (arg.value.trim() === '') {
        errors[i] = 'Value cannot be empty';
      }
    });
    setLocalErrors(errors);
    onError?.(Object.keys(errors).length > 0 ? Object.values(errors)[0] : null);
  };

  const addArgument = () => {
    setArgs([...args, { type: 'string', value: '' }]);
    setLocalErrors({});
    onError?.(null);
  };

  const removeArgument = (index) => {
    const newArgs = args.filter((_, i) => i !== index);
    setArgs(newArgs);
    const newErrors = { ...localErrors };
    delete newErrors[index];
    setLocalErrors(newErrors);
    onError?.(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            fontWeight: 600,
          }}
        >
          Constructor Arguments
        </label>
        <button
          onClick={addArgument}
          style={{
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 600,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
        >
          + Add Argument
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {args.length === 0 ? (
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
            No constructor arguments. Click "Add Argument" to add one.
          </div>
        ) : (
          args.map((arg, index) => (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '12px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${localErrors[index] ? 'var(--red)' : 'var(--border)'}`,
              }}
            >
              <select
                value={arg.type || 'string'}
                onChange={(e) => handleArgChange(index, 'type', e.target.value)}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {ARGUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input
                  value={arg.value || ''}
                  onChange={(e) => handleArgChange(index, 'value', e.target.value)}
                  placeholder={
                    arg.type === 'bool'
                      ? 'true or false'
                      : arg.type === 'address'
                        ? 'G... account or C... contract'
                        : arg.type === 'bytes'
                          ? '0x...'
                          : `Enter ${arg.type} value`
                  }
                  style={{
                    padding: '8px 10px',
                    background: 'var(--bg-base)',
                    border: `1px solid ${localErrors[index] ? 'var(--red)' : 'var(--border-bright)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    transition: 'var(--transition)',
                  }}
                />
                {localErrors[index] && (
                  <div
                    style={{
                      fontSize: '9px',
                      color: 'var(--red)',
                    }}
                  >
                    {localErrors[index]}
                  </div>
                )}
              </div>

              <button
                onClick={() => removeArgument(index)}
                disabled={args.length === 1}
                style={{
                  padding: '8px 10px',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: 'var(--radius-md)',
                  color: args.length === 1 ? 'var(--text-muted)' : 'var(--red)',
                  cursor: args.length === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                  opacity: args.length === 1 ? 0.5 : 1,
                  transition: 'var(--transition)',
                }}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
