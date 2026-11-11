import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { loadDemo } from '@/data/demo';

// Les tests s'exécutent sur des données fictives, jamais sur de vraies données
loadDemo();

// jsdom ne fournit pas matchMedia (utilisé pour le thème et la réduction des animations)
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
