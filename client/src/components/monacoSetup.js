// Loads Monaco from the bundled npm package (no CDN, works offline).
// Only the generic editor worker is wired up; language services (IntelliSense)
// for JS/TS are therefore basic, but syntax highlighting works for all languages.
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco });

export default monaco;
