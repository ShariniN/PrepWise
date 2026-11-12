import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'
import '@fontsource-variable/inter'
import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import { AppContextProvider } from './app/AppContextProvider.jsx'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AppContextProvider>
      <App />
    </AppContextProvider>
  </BrowserRouter>,
)

// Dev builds only: lets tools/e2e/browser-runner-check.mjs drive the in-browser code runner.
if (import.meta.env.DEV) {
  import('./features/practice/browserRunner/index.js').then((runner) => { window.__prepwiseRunner = runner })
}
