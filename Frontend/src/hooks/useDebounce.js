import { useState, useEffect } from "react";

/**
 * Debounce a value by a given delay.
 * @param {*} value
 * @param {number} delay - Delay in milliseconds
 * @returns {*}
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
