import { useCallback, useEffect, useRef, useState } from 'react';

// Countdown driven by the server's clock. Pass the `deadline` and `serverNow` from the
// last server response; the browser's wall clock is never used (only elapsed time since
// that response, measured with performance.now()). Call `sync` after a refresh.
export const useServerCountdown = (deadline, serverNow) => {
  const anchor = useRef({ remainingMs: 0, perf: 0 });
  const [remainingMs, setRemainingMs] = useState(() => {
    const r = Date.parse(deadline) - Date.parse(serverNow);
    return Number.isFinite(r) ? r : 0;
  });

  const sync = useCallback((dl, sn) => {
    const r = Date.parse(dl) - Date.parse(sn);
    if (!Number.isFinite(r)) return;
    anchor.current = { remainingMs: r, perf: performance.now() };
    setRemainingMs(r);
  }, []);

  useEffect(() => { sync(deadline, serverNow); }, [deadline, serverNow, sync]);

  useEffect(() => {
    const timer = setInterval(() => {
      const left = anchor.current.remainingMs - (performance.now() - anchor.current.perf);
      setRemainingMs(left);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return { remainingMs, remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000)), sync };
};

export default useServerCountdown;
