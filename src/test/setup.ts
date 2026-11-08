import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
