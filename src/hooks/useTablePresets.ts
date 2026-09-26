import { useState, useCallback, useEffect } from 'react';
import type { ColumnPreset, TableDensity } from '../components/common/EnhancedTable';

const STORAGE_KEY = 'table-presets';

export function useTablePresets(tableId: string) {
  const [presets, setPresets] = useState<ColumnPreset[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [density, setDensity] = useState<TableDensity>('comfortable');

  // Load presets from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allPresets = JSON.parse(stored);
        const tablePresets = allPresets[tableId] || [];
        setPresets(tablePresets);
      }
    } catch (error) {
      console.error('Failed to load table presets:', error);
    }
  }, [tableId]);

  // Save presets to localStorage
  const savePresets = useCallback((newPresets: ColumnPreset[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const allPresets = stored ? JSON.parse(stored) : {};
      allPresets[tableId] = newPresets;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allPresets));
      setPresets(newPresets);
    } catch (error) {
      console.error('Failed to save table presets:', error);
    }
  }, [tableId]);

  const handlePresetSave = useCallback((preset: ColumnPreset) => {
    const newPresets = [...presets, preset];
    savePresets(newPresets);
  }, [presets, savePresets]);

  const handlePresetDelete = useCallback((id: string) => {
    const newPresets = presets.filter((p) => p.id !== id);
    savePresets(newPresets);
  }, [presets, savePresets]);

  const handlePresetApply = useCallback((preset: ColumnPreset) => {
    setVisibleColumns(preset.columns);
    setDensity(preset.density);
  }, []);

  return {
    presets,
    visibleColumns,
    setVisibleColumns,
    density,
    setDensity,
    onPresetSave: handlePresetSave,
    onPresetDelete: handlePresetDelete,
    onPresetApply: handlePresetApply,
  };
}
