import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { LicenseGate } from './components/license-gate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LicenseGate>
      <App />
    </LicenseGate>
  </StrictMode>,
)
