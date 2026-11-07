import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

// Loads data from `fetcher` whenever `key` changes (a string describing the inputs).
// Pass enabled=false to skip. Stale responses are ignored.
export default function useAnalyticsData(fetcher, key, enabled = true) {
  const [state, setState] = useState({ data: null, error: '', loading: enabled });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fetcherRef.current()
      .then((data) => { if (!cancelled) setState({ data, error: '', loading: false }); })
      .catch((e) => { if (!cancelled) setState({ data: null, error: errorMessage(e, 'Could not load this view'), loading: false }); });
    return () => { cancelled = true; };
  }, [key, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}
