import { useEffect, useRef } from "react";

/**
 * Hook to access latest values in callbacks without adding to dependency arrays.
 * Prevents effect re-runs while avoiding stale closures.
 *
 * Rule 8.2: useLatest for Stable Callback Refs
 * Reference: React Best Practices Guide (Vercel Engineering)
 *
 * @param value - The value to keep up-to-date
 * @returns A ref that always contains the latest value
 *
 * @example
 * const onSearchRef = useLatest(onSearch);
 * useEffect(() => {
 *   const timeout = setTimeout(() => onSearchRef.current?.(query), 300);
 *   return () => clearTimeout(timeout);
 * }, [query]); // No onSearch dependency!
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

