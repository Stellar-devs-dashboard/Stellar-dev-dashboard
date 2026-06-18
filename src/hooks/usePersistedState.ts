import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredValue, setStoredValue } from '../lib/storage';
import { onStateChange, syncState, resolveStateConflict } from '../utils/stateSync';

export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (newValue: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const valueRef = useRef(defaultValue);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    getStoredValue(key).then((stored) => {
      const typed = stored as T | null;
      if (!cancelled && typed !== null) {
        setValue(typed);
        valueRef.current = typed;
      }
      if (!cancelled) setLoaded(true);
    }).catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    const unsubscribe = onStateChange((changedKey: string, incomingValue: unknown) => {
      if (changedKey !== key) return;
      setValue((current) => {
        const merged = resolveStateConflict(current, incomingValue) as T;
        valueRef.current = merged;
        return merged;
      });
    });
    return () => {
      unsubscribe();
    };
  }, [key]);

  const update = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prev)
        : newValue;
      valueRef.current = resolved;
      syncState(key, resolved).catch(() => {
        setStoredValue(key, resolved).catch(() => {});
      });
      return resolved;
    });
  }, [key]);

  return [value, update, loaded];
}
