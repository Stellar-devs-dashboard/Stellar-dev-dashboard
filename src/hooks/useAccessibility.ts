import { useEffect, useCallback } from 'react';
import { announceToScreenReader, setFocus, registerShortcut } from '../utils/accessibility';

type FocusTarget = string | HTMLElement;

/**
 * useAccessibility - React hook for accessibility features
 * Handles focus management, keyboard shortcuts, and screen reader announcements
 */
export const useAccessibility = (elementId: string | null = null) => {
  const announce = useCallback((message: string, polite = false) => {
    announceToScreenReader(message, polite ? 'polite' : 'assertive');
  }, []);

  const setElementFocus = useCallback((target: FocusTarget) => {
    if (typeof target === 'string') {
      setFocus(target);
    } else if (target instanceof HTMLElement) {
      target.focus();
    }
  }, []);

  const registerAccessibilityShortcut = useCallback(
    (key: string, handler: () => void, options: { description?: string; category?: string; id?: string } = {}) => {
      return registerShortcut(key, handler, {
        ...options,
        category: 'accessibility',
      });
    },
    []
  );

  useEffect(() => {
    if (elementId) {
      const timer = setTimeout(() => setFocus(elementId), 0);
      return () => clearTimeout(timer);
    }
  }, [elementId]);

  return {
    announce,
    setFocus: setElementFocus,
    registerShortcut: registerAccessibilityShortcut,
  };
};

export default useAccessibility;
