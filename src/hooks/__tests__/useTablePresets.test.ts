import { renderHook, act } from '@testing-library/react';
import { useTablePresets } from '../useTablePresets';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useTablePresets', () => {
  const mockTableId = 'test-table';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should initialize with empty presets', () => {
    const { result } = renderHook(() => useTablePresets(mockTableId));

    expect(result.current.presets).toEqual([]);
    expect(result.current.visibleColumns).toEqual([]);
    expect(result.current.density).toBe('comfortable');
  });

  it('should save a new preset', () => {
    const { result } = renderHook(() => useTablePresets(mockTableId));

    act(() => {
      result.current.setVisibleColumns(['col1', 'col2']);
      result.current.setDensity('compact');
    });

    act(() => {
      result.current.onPresetSave({
        id: 'preset-1',
        name: 'Test Preset',
        columns: ['col1', 'col2'],
        density: 'compact',
      });
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe('Test Preset');
  });

  it('should delete a preset', () => {
    const { result } = renderHook(() => useTablePresets(mockTableId));

    const preset = {
      id: 'preset-1',
      name: 'Test Preset',
      columns: ['col1', 'col2'],
      density: 'compact' as const,
    };

    act(() => {
      result.current.onPresetSave(preset);
    });

    expect(result.current.presets).toHaveLength(1);

    act(() => {
      result.current.onPresetDelete('preset-1');
    });

    expect(result.current.presets).toHaveLength(0);
  });

  it('should apply a preset', () => {
    const { result } = renderHook(() => useTablePresets(mockTableId));

    const preset = {
      id: 'preset-1',
      name: 'Test Preset',
      columns: ['col1', 'col2', 'col3'],
      density: 'spacious' as const,
    };

    act(() => {
      result.current.onPresetSave(preset);
    });

    act(() => {
      result.current.onPresetApply(preset);
    });

    expect(result.current.visibleColumns).toEqual(['col1', 'col2', 'col3']);
    expect(result.current.density).toBe('spacious');
  });

  it('should load presets from localStorage', () => {
    const storedPresets = [
      {
        id: 'preset-1',
        name: 'Stored Preset',
        columns: ['col1'],
        density: 'compact' as const,
      },
    ];

    localStorage.setItem('table-presets', JSON.stringify({ [mockTableId]: storedPresets }));

    const { result } = renderHook(() => useTablePresets(mockTableId));

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe('Stored Preset');
  });

  it('should handle localStorage errors gracefully', () => {
    // Mock localStorage to throw error
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = vi.fn(() => {
      throw new Error('Storage error');
    });

    const { result } = renderHook(() => useTablePresets(mockTableId));

    expect(result.current.presets).toEqual([]);

    localStorage.getItem = originalGetItem;
  });
});
