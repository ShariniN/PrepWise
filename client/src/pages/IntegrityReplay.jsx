import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Select, Skeleton } from '../components/ui';
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
    <AppShell width="default">
      <div className="space-y-5">
        <Button as={Link} to="/integrity" variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />}>Review queue</Button>
        {children}
      </div>
    </AppShell>
  );

  if (error) return shell(<Card role="alert" tone="sand" className="text-danger-700">{error}</Card>);
  if (!data) return shell(<Card role="status" aria-label="Loading replay" className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-72 w-full" /></Card>);
  if (!states.length) return shell(<Card className="text-ink-2">{data.note || 'No editing was recorded for this question.'}</Card>);

  return shell(
    <>
      <Card as="section" className="space-y-3">
        <h1 className="font-display text-3xl font-semibold text-ink">Code replay</h1>
        <p className="text-sm text-ink-2">
          Reconstructed from recorded editing activity ({data.totalEvents} events, {fmtOffset(data.durationMs)}). Starting document: {data.initialSource}.
          A fast stretch of typing or a paste is a reason to look, not a finding.
        </p>
        {warnings.map((w) => (
          <p key={w} role="status" className="rounded-2xl border border-sun-300 bg-sun-50 p-3 text-sm text-ink">{w}</p>
        ))}
      </Card>

      <Card as="section" className="min-w-0 space-y-4">
        <CodeEditor value={text} readOnly language={data.language || 'javascript'} height="360px" ariaLabel="Replayed code" />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<SkipBack size={14} aria-hidden="true" />} onClick={() => step(-1)} disabled={idx === 0} aria-label="Previous change">Back</Button>
          <Button size="sm" icon={playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} onClick={() => { if (!playing && t >= endT) seek(0); setPlaying(!playing); }}>
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button size="sm" variant="secondary" iconRight={<SkipForward size={14} aria-hidden="true" />} onClick={() => step(1)} disabled={idx >= states.length - 1} aria-label="Next change">Next</Button>
          <label className="ml-2 flex items-center gap-2 text-sm text-ink-2">Speed
            <Select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-auto py-1.5">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
            </Select>
          </label>
          <span className="ml-auto font-mono text-sm tabular-nums text-ink-2" aria-live="off">{fmtOffset(t)} / {fmtOffset(endT)}</span>
        </div>

        <input type="range" min={0} max={endT} step={Math.max(1, Math.round(endT / 2000))} value={Math.min(t, endT)}
          onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }} className="w-full accent-primary-600" aria-label="Replay position" />
        <div className="viz-root overflow-x-auto"><svg viewBox={`0 0 ${W} 26`} className="h-6 w-full min-w-[560px]" role="img" aria-label={`${markers.length} markers on the replay`}>
          <line x1="10" x2={W - 10} y1="13" y2="13" stroke="#e4e3df" />
          {markers.map((mk, i) => {
            const c = MARKS[mk.m].color; const cx = x(mk.t);
            if (mk.m === 'large_paste') return <rect key={i} x={cx - 5} y={8} width={10} height={10} fill={c} stroke="var(--surface, #fff)" strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></rect>;
            if (mk.m === 'paste') return <circle key={i} cx={cx} cy={13} r={4} fill={c} stroke="var(--surface, #fff)" strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></circle>;
            return <path key={i} d={`M${cx} 5 L${cx + 4} 13 L${cx} 21 L${cx - 4} 13 Z`} fill={mk.m === 'focus' ? 'none' : c} stroke={c} strokeWidth="1.5"><title>{`${fmtOffset(mk.t)} ${MARKS[mk.m].label}`}</title></path>;
          })}
          <line x1={x(t)} x2={x(t)} y1="0" y2="26" stroke="#2a78d6" strokeWidth="2" />
        </svg></div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Marker legend">
          <li>Circle: paste</li><li>Square: paste of 500+ characters</li><li>Diamond: editor focus lost (hollow: regained), reload or final submission</li>
        </ul>
        {cur?.markers?.length > 0 && (
          <p className="text-sm text-ink">At this point: {cur.markers.map((m) => MARKS[m]?.label || m.replace(/_/g, ' ')).join(', ')}</p>
        )}
      </Card>
    </>
  );
};

export default IntegrityReplay;
