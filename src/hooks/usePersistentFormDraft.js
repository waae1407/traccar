import { useEffect, useMemo, useRef, useState } from 'react';
import { clearTaskDraft, readTaskDraft, saveTaskDraft } from '@/lib/sessionContinuity';

const safeParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export default function usePersistentFormDraft(key, initialValue, options = {}) {
  const { enabled = true, clearOnSubmit = false } = options;
  const initialRef = useRef(initialValue);
  const storageKey = useMemo(() => key, [key]);

  const [value, setValue] = useState(() => {
    if (!enabled || typeof window === 'undefined') return initialRef.current;
    const globalDraft = readTaskDraft(storageKey)?.data;
    if (globalDraft) return globalDraft;
    return safeParse(window.sessionStorage.getItem(storageKey), null) || safeParse(window.localStorage.getItem(storageKey), initialRef.current);
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    saveTaskDraft(storageKey, value);
  }, [enabled, storageKey, value]);

  const clearDraft = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey);
      window.localStorage.removeItem(storageKey);
    }
    clearTaskDraft(storageKey);
    if (clearOnSubmit) setValue(initialRef.current);
  };

  return [value, setValue, clearDraft];
}