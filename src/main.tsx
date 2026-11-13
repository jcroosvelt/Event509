import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import App from './App';
import { AppProvider } from './store/app';
import { DEMO, hydrate } from './services/api';
import { initPush } from './lib/push';

/** Au passage démo → serveur, les données de démonstration gardées sur l'appareil sont effacées. */
function resetDemoStorage() {
  try {
    const mode = DEMO ? 'demo' : 'api';
    if (localStorage.getItem('e509.mode') === mode) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith('e509.') && !['e509.lang', 'e509.currency', 'e509.theme'].includes(k)) localStorage.removeItem(k);
    localStorage.setItem('e509.mode', mode);
  } catch {
    /* stockage indisponible */
  }
}

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

async function start() {
  resetDemoStorage();
  initPush();
  // Version de démonstration seulement : la condition est évaluée à la compilation, si bien que le site en ligne
  // (VITE_API_URL défini) ne contient ni ce chargement ni aucune donnée fictive.
  if (!import.meta.env.VITE_API_URL) (await import('./data/demo')).loadDemo();
  // Mode serveur : le catalogue est chargé avant le premier affichage
  try {
    await hydrate();
  } catch {
    document.getElementById('root')!.innerHTML =
      '<p style="font-family:system-ui;padding:48px 16px;text-align:center">Event509 est momentanément indisponible. Vérifiez votre connexion puis rechargez la page.</p>';
    return;
  }
  render();
}

void start();
