import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import NavBar from '../components/NavBar';
import CodeEditor from '../components/CodeEditor';
import { getReplay } from '../api/integrity';
import { errorMessage } from '../api/client';
import { fmtOffset } from '../utils/assessment';

const SPEEDS = [1, 2, 4, 8];
const TICK_MS = 100;
const MAX_IDLE_MS = 3000; // playback skips quiet stretches longer than this

// Marker colours: orange (slot 2) for paste family, grey for focus, ink for the rest.
// Each kind also has its own shape, so colour is never the only cue.
const MARKS = {
  paste: { color: '#eb6834', label: 'Paste' },
  large_paste: { color: '#eb6834', label: 'Large paste (500+ characters)' },
  blur: { color: '#52514e', label: 'Editor lost focus' },
  focus: { color: '#8a8984', label: 'Editor focused' },
  editor_restarted: { color: '#6250d6', label: 'Editor reloaded' },
  final_submission: { color: '#1baf7a', label: 'Final submission' },
};

const applyPatch = (text, p) => text.slice(0, p.pos) + (p.ins || '') + text.slice(p.pos + (p.del || 0));

// Document at state index i: nearest earlier full-text state, then patches forward.
const docAt = (states, i) => {
  let s = i;
  while (s > 0 && typeof states[s].text !== 'string') s -= 1;
  let text = typeof states[s].text === 'string' ? states[s].text : '';
  for (let k = s + 1; k <= i; k += 1) {
    if (typeof states[k].text === 'string') text = states[k].text;
    else if (states[k].patch) text = applyPatch(text, states[k].patch);
  }
  return text;
};

const indexAtTime = (states, t) => {
  let lo = 0; let hi = states.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (states[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
};

const IntegrityReplay = () => {
  const { sessionId } = useParams();
  const [params] = useSearchParams();
  const questionId = params.get('questionId') || '';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const tRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getReplay(sessionId, questionId);
        if (!cancelled) { setData(d); setT(0); tRef.current = 0; }
      } catch (e) { if (!cancelled) setError(errorMessage(e, 'Could not load the replay')); }
    })();
    return () => { cancelled = true; };
  }, [sessionId, questionId]);

  const states = useMemo(() => data?.states || [], [data]);
  const endT = states.length ? states[states.length - 1].t : 0;
  const idx = states.length ? indexAtTime(states, t) : 0;
  const text = useMemo(() => (states.length ? docAt(states, idx) : ''), [states, idx]);

  const seek = useCallback((v) => { tRef.current = v; setT(v); }, []);

  useEffect(() => {
    if (!playing || !states.length) return undefined;
    const iv = setInterval(() => {
      const cur = tRef.current;
      let next = cur + TICK_MS * speed;
      const i = indexAtTime(states, cur);
      const following = states[i + 1];
      if (following && following.t - cur > MAX_IDLE_MS) next = following.t; // skip a long quiet stretch
      if (next >= endT) { seek(endT); setPlaying(false); return; }
      seek(next);
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [playing, speed, states, endT, seek]);

  const step = (d) => {
    setPlaying(false);
    const ni = Math.min(states.length - 1, Math.max(0, idx + d));
    seek(states[ni].t);
  };

  const markers = useMemo(() => states.flatMap((s) => (s.markers || []).filter((m) => MARKS[m]).map((m) => ({ t: s.t, m }))), [states]);
  const warnings = useMemo(() => {
    if (!data) return [];
    const w = [];
    if (data.approximate) w.push('Approximate replay: the editor did not send all inserted text, so some pasted or typed content is shown as placeholders.');
    if (data.matchesFinal === false) w.push('The reconstruction does not exactly match the final saved answer. Treat the intermediate states as a guide only.');
    if (data.truncated) w.push(`The replay was shortened (${String(data.truncated).replace(/_/g, ' ')}).`);
    if (data.note) w.push(data.note);
    return w;
  }, [data]);

  const W = 900;
  const x = (v) => 10 + (endT ? (v / endT) * (W - 20) : 0);
  const cur = states[idx];

  const shell = (children) => (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <Link to="/integrity" className="text-sm text-indigo-700 hover:underline">&larr; Review queue</Link>
        {children}
      </main>
    </div>
  );

  if (error) return shell(<p role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{error}</p>);
  if (!data) return shell(<p className="text-gray-500" role="status">Loading replay...</p>);
  if (!states.length) return shell(<p className="bg-white rounded-2xl shadow p-6 text-gray-700">{data.note || 'No editing was recorded for this question.'}</p>);

  const btn = 'px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm disabled:opacity-40';

  return shell(
    <>
      <section className="bg-white rounded-2xl shadow p-6 space-y-2">
        <h1 className="text-2xl font-bold text-gray-800">Code replay</h1>
        <p className="text-sm text-gray-600">
          Reconstructed from recorded editing activity ({data.totalEvents} events, {fmtOffset(data.durationMs)}). Starting document: {data.initialSource}.
          A fast stretch of typing or a paste is a reason to look, not a finding.
        </p>
        {warnings.map((w) => (
          <p key={w} role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">{w}</p>
        ))}
      </section>

      <section className="bg-white rounded-2xl shadow p-6 space-y-3">
        <CodeEditor value={text} readOnly language={data.language || 'javascript'} height="360px" ariaLabel="Replayed code" />

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={() => step(-1)} disabled={idx === 0} aria-label="Previous change">Back</button>
          <button type="button" className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} onClick={() => { if (!playing && t >= endT) seek(0); setPlaying(!playing); }}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className={btn} onClick={() => step(1)} disabled={idx >= states.length - 1} aria-label="Next change">Next</button>
          <label className="text-sm text-gray-700 flex items-center gap-1 ml-2">Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-sm">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </select>
          </label>
          <span className="ml-auto font-mono text-sm text-gray-700" aria-live="off">{fmtOffset(t)} / {fmtOffset(endT)}</span>
        </div>

        <input type="range" min={0} max={endT} step={Math.max(1, Math.round(endT / 2000))} value={Math.min(t, endT)}
          onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} className="w-full" aria-label="Replay position" />
        <svg viewBox={`0 0 ${W} 26`} className="w-full h-6" role="img" aria-label={`${markers.length} markers on the replay`}>
          <line x1="10" x2={W - 10} y1="13" y2="13" stroke="#e4e3df" />
          {markers.map((mk, i) => {
            const c = MARKS[mk.m].color; const cx = x(mk.t);
            if (mk.m === 'large_paste') return <rect key={i} x={cx - 5} y={8} width={10} height={10} fill={c} stroke="#fff" strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></rect>;
            if (mk.m === 'paste') return <circle key={i} cx={cx} cy={13} r={4} fill={c} stroke="#fff" strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></circle>;
            return <path key={i} d={`M${cx} 5 L${cx + 4} 13 L${cx} 21 L${cx - 4} 13 Z`} fill={mk.m === 'focus' ? 'none' : c} stroke={c} strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></path>;
          })}
          <line x1={x(t)} x2={x(t)} y1="0" y2="26" stroke="#2a78d6" strokeWidth="2" />
        </svg>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Marker legend">
          <li>Circle: paste</li><li>Square: paste of 500+ characters</li><li>Diamond: editor focus lost (hollow: regained), reload or final submission</li>
        </ul>
        {cur?.markers?.length > 0 && (
          <p className="text-sm text-gray-800">At this point: {cur.markers.map((m) => MARKS[m]?.label || m.replace(/_/g, ' ')).join(', ')}</p>
        )}
      </section>
    </>
  );
};

export default IntegrityReplay;
