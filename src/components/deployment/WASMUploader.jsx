import React, { useState } from 'react';
import { WASMProcessor } from '../../lib/deployment/WASMProcessor';

export default function WASMUploader({ onFile, onError, file }) {
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0] || null;
    setLocalError(null);

    if (!selectedFile) {
      onFile?.(null);
      return;
    }

    setIsLoading(true);
    try {
      const bytes = await WASMProcessor.parseFile(selectedFile);
      const sizeKb = Math.ceil(bytes.length / 1024);
      
      if (sizeKb > 256) {
        throw new Error('WASM file is too large (max 256 KB)');
      }

      onFile?.({
        file: selectedFile,
        bytes,
        sizeKb,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to process WASM file';
      setLocalError(errorMsg);
      onError?.(errorMsg);
      onFile?.(null);
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = localError || (onError && typeof onError === 'string' ? onError : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <label
        htmlFor="wasm-upload"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '20px',
          border: `2px dashed ${displayError ? 'var(--red)' : file ? 'var(--green)' : 'var(--border-bright)'}`,
          borderRadius: 'var(--radius-md)',
          background: displayError ? 'rgba(220, 38, 38, 0.08)' : file ? 'rgba(34, 197, 94, 0.08)' : 'var(--bg-elevated)',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all var(--transition)',
          opacity: isLoading ? 0.6 : 1,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '24px' }}>📦</div>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {file ? `✓ ${file.file.name}` : isLoading ? 'Processing...' : 'Drop WASM file or click to select'}
        </div>
        {file && (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}
          >
            {file.sizeKb} KB
          </div>
        )}
        <input
          id="wasm-upload"
          type="file"
          accept=".wasm"
          onChange={handleFileChange}
          disabled={isLoading}
          style={{ display: 'none' }}
        />
      </label>
      {displayError && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--red)',
            background: 'rgba(220, 38, 38, 0.1)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            lineHeight: 1.5,
          }}
        >
          {displayError}
        </div>
      )}
    </div>
  );
}
