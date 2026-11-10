import React, { Suspense, useEffect, useId, useRef, useState } from 'react';
import { EDITOR_LANGUAGES } from '../utils/practice';

const Editor = React.lazy(async () => {
  // Prefer the bundled Monaco. If that fails, the CDN loader of
  // @monaco-editor/react is used; if that fails too, onFail shows a textarea.
  try {
    await import('./monacoSetup');
  } catch {
    /* fall through to the CDN loader */
  }
  const mod = await import('@monaco-editor/react');
  return { default: mod.default };
});

const PREF_KEY = 'prepwise.editorPrefs';
const readPrefs = () => {
  try {
    return { theme: 'light', fontSize: 14, tabSize: 4, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { theme: 'light', fontSize: 14, tabSize: 4 };
  }
};

class MonacoBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const selectCls = 'rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink focus:outline-none focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15';

// Monaco wrapper. `recorder` is optional ({ recordChange, record }) from useEditEvents.
const CodeEditor = ({
  value, onChange, language = 'javascript', onLanguageChange, languages,
  recorder, readOnly = false, height = '380px', ariaLabel = 'Code editor',
}) => {
  // Each editor needs its own Monaco model. A shared path (one per language) made every editor on a
  // page share one text buffer, e.g. the starter code silently became the reference solution.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [prefs, setPrefs] = useState(readPrefs);
  const [failed, setFailed] = useState(false);
  const prev = useRef(value || '');
  const pasteHint = useRef(false);
  const recorderRef = useRef(recorder);
  useEffect(() => { recorderRef.current = recorder; }, [recorder]);

  const setPref = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const handleChange = (v) => {
    const next = v ?? '';
    recorderRef.current?.recordChange?.(prev.current, next, pasteHint.current ? 'paste' : undefined);
    pasteHint.current = false;
    prev.current = next;
    onChange?.(next);
  };

  // Keep the diff base in sync when the parent replaces the value (e.g. draft restore).
  useEffect(() => { prev.current = value || ''; }, [value, language]);

  const handleMount = (editor) => {
    editor.onDidPaste(() => { pasteHint.current = true; });
    editor.onDidFocusEditorText(() => recorderRef.current?.record?.('focus'));
    editor.onDidBlurEditorText(() => recorderRef.current?.record?.('blur'));
  };

  const langs = languages
    ? EDITOR_LANGUAGES.filter((l) => languages.includes(l.value))
    : EDITOR_LANGUAGES;

  const fallback = (
    <textarea
      aria-label={ariaLabel}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      onChange={(e) => handleChange(e.target.value)}
      onPaste={() => { pasteHint.current = true; }}
      onFocus={() => recorderRef.current?.record?.('focus')}
      onBlur={() => recorderRef.current?.record?.('blur')}
      style={{ height, fontSize: prefs.fontSize, tabSize: prefs.tabSize }}
      className="w-full font-mono border border-line rounded-2xl p-3 bg-sand text-ink"
    />
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
        {onLanguageChange && (
          <label className="flex items-center gap-1">Language
            <select className={selectCls} value={language} onChange={(e) => onLanguageChange(e.target.value)}>
              {langs.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">Font
          <select className={selectCls} value={prefs.fontSize} onChange={(e) => setPref({ fontSize: Number(e.target.value) })}>
            {[12, 14, 16, 18, 20].map((s) => <option key={s} value={s}>{s}px</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">Tab
          <select className={selectCls} value={prefs.tabSize} onChange={(e) => setPref({ tabSize: Number(e.target.value) })}>
            {[2, 4, 8].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" className={`${selectCls} hover:border-primary-300 hover:bg-primary-50`}
          onClick={() => setPref({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}>
          Theme: {prefs.theme}
        </button>
        {failed && <span className="text-sun-700">Editor failed to load, using a plain text box.</span>}
      </div>
      {failed ? fallback : (
        <MonacoBoundary onFail={() => setFailed(true)}>
          <Suspense fallback={<div className="text-sm text-ink-muted p-3 border border-line rounded-2xl" style={{ height }}>Loading editor...</div>}>
            <div className="border border-line rounded-2xl overflow-hidden" aria-label={ariaLabel}>
              <Editor
                height={height}
                language={language}
                path={`prepwise-${instanceId}-${language}`}
                value={value}
                theme={prefs.theme === 'dark' ? 'vs-dark' : 'light'}
                onChange={handleChange}
                onMount={handleMount}
                loading={<div className="text-sm text-ink-muted p-3">Loading editor...</div>}
                options={{
                  minimap: { enabled: false },
                  fontSize: prefs.fontSize,
                  tabSize: prefs.tabSize,
                  readOnly,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                }}
              />
            </div>
          </Suspense>
        </MonacoBoundary>
      )}
    </div>
  );
};

export default CodeEditor;
