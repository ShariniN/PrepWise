// Code replay: rebuilds how a document evolved from the edit-event batches the editor flushed.
// Pure function, no database. Output states are {t, text|patch, markers}:
//   - text: the full document (first state, periodic snapshots so a player can seek, and a final state if needed)
//   - patch: {pos, del, ins} applied to the previous state: delete `del` characters at `pos`, then insert `ins`
//   - markers: strings such as paste, large_paste, truncated, focus, blur, editor_restarted, approximate, final_submission
//   - t: milliseconds since the first editing session started
// Events only describe what the client reported. If the client did not send inserted text, the reconstruction is
// approximate (placeholder characters) and `matchesFinal` will say so.

export const REPLAY_LIMITS = { maxStates: 2000, maxChars: 200_000, outputBudget: 500_000, snapshotEvery: 50, largePaste: 500 };
const PLACEHOLDER = '•';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const reconstructReplay = (batches, { initialText = '', finalText = null, limits = {} } = {}) => {
  const L = { ...REPLAY_LIMITS, ...limits };
  let doc = String(initialText ?? '');
  const states = [{ t: 0, text: doc, markers: ['start'] }];
  let budget = doc.length;
  let truncated = null;
  let offset = 0;
  let prevRaw = -1;
  let lastAbs = 0;
  let totalEvents = 0;
  let approximate = false;
  let last = null; // last coalescable state

  const emit = (state) => {
    if (states.length >= L.maxStates) { truncated = truncated || 'max_states'; return false; }
    const cost = (state.text?.length || 0) + (state.patch?.ins?.length || 0);
    if (budget + cost > L.outputBudget) { truncated = truncated || 'output_budget'; return false; }
    budget += cost;
    states.push(state);
    return true;
  };

  outer:
  for (const batch of batches) {
    let firstInBatch = true;
    for (const e of batch.events || []) {
      totalEvents += 1;
      const markers = [];
      if (prevRaw >= 0 && e.t < prevRaw - (firstInBatch ? 0 : 1000)) { offset = lastAbs + 1000; markers.push('editor_restarted'); last = null; }
      prevRaw = e.t;
      firstInBatch = false;
      const abs = offset + e.t;
      lastAbs = Math.max(lastAbs, abs);

      if (e.type === 'focus' || e.type === 'blur') {
        last = null;
        if (!emit({ t: abs, patch: null, markers: [...markers, e.type] })) break outer;
        continue;
      }

      let patch;
      if (e.type === 'delete') {
        const len = Math.max(0, e.len || 1);
        const pos = Number.isFinite(e.pos) ? clamp(e.pos, 0, doc.length) : Math.max(0, doc.length - len);
        const del = Math.min(len, doc.length - pos);
        if (del === 0) continue;
        patch = { pos, del, ins: '' };
        doc = doc.slice(0, pos) + doc.slice(pos + del);
      } else { // insert | paste
        const pos = Number.isFinite(e.pos) ? clamp(e.pos, 0, doc.length) : doc.length;
        let ins = typeof e.text === 'string' ? e.text : '';
        if (!ins) {
          ins = PLACEHOLDER.repeat(clamp(e.len || 1, 1, 2000));
          markers.push('approximate');
          approximate = true;
        } else if ((e.len || 0) > ins.length) {
          markers.push('truncated'); // the stored text was cut; the paste was longer
        }
        if (e.type === 'paste') { markers.push('paste'); if ((e.len || ins.length) >= L.largePaste) markers.push('large_paste'); }
        patch = { pos, del: 0, ins };
        doc = doc.slice(0, pos) + ins + doc.slice(pos);
      }
      if (doc.length > L.maxChars) { truncated = 'document_too_large'; break outer; }

      // Coalesce runs of plain typing / backspacing into one state so a long session fits in maxStates.
      const plain = markers.length === 0 && e.type !== 'paste';
      if (plain && last && last.kind === e.type && abs - last.t < 1000) {
        const p = last.state.patch;
        if (e.type === 'insert' && patch.pos === p.pos + p.ins.length) {
          p.ins += patch.ins; last.t = abs; last.state.t = abs; budget += patch.ins.length;
          if (last.state.text !== undefined) last.state.text = doc;
          continue;
        }
        if (e.type === 'delete' && patch.pos + patch.del === p.pos && p.ins === '') {
          p.pos = patch.pos; p.del += patch.del; last.t = abs; last.state.t = abs;
          if (last.state.text !== undefined) last.state.text = doc;
          continue;
        }
      }
      const state = { t: abs, patch, markers };
      if ((states.length % L.snapshotEvery) === 0) state.text = doc;
      if (!emit(state)) break outer;
      last = plain ? { kind: e.type, t: abs, state } : null;
    }
  }

  const matchesFinal = finalText === null ? null : doc === finalText;
  if (finalText !== null && !matchesFinal && !truncated) {
    emit({ t: lastAbs, text: finalText, markers: ['final_submission', approximate ? 'approximate' : 'drift'] });
  }
  return {
    states, totalEvents, truncated, approximate, matchesFinal, durationMs: lastAbs, reconstructedLength: doc.length,
  };
};
