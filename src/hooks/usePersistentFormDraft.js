import { useEffect, useMemo, useRef, useState } from 'react';

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
    return safeParse(window.localStorage.getItem(storageKey), initialRef.current);
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  }, [enabled, storageKey, value]);

  const clearDraft = () => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey);
    if (clearOnSubmit) setValue(initialRef.current);
  };

  return [value, setValue, clearDraft];
}