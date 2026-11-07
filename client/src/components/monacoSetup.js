// Loads Monaco from the bundled npm package (no CDN, works offline).
// This module is imported lazily by CodeEditor, so Monaco stays out of the main bundle.
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

try {
  // Programs run in a sandbox with Node/stdin, so only report syntax errors for JS.
  monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
} catch {
  /* optional */
}

loader.config({ monaco });

export default monaco;
