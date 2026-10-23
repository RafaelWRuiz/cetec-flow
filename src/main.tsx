import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import SecondOptionSimulatorPreview from './components/SecondOptionSimulatorPreview'
import SecondOptionImportPreview from './components/SecondOptionImportPreview'
import './styles.css'

const previewScreen = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('tela')
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {previewScreen === 'simulador-segunda-opcao'
      ? <SecondOptionSimulatorPreview />
      : previewScreen === 'importar-segunda-opcao'
        ? <SecondOptionImportPreview />
        : <App />}
  </StrictMode>,
)
