import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/store/app', () => ({ useApp: vi.fn() }));

import { useApp } from '@/store/app';
import { RequireAuth } from './guards';

const state = (s: Record<string, unknown>) => vi.mocked(useApp).mockReturnValue({ t: (x: string) => x, ...s } as never);
const page = () => render(
  <MemoryRouter initialEntries={['/organisateur']}>
    <Routes>
      <Route path="/organisateur" element={<RequireAuth><p>ESPACE PROTEGE</p></RequireAuth>} />
      <Route path="/connexion" element={<p>PAGE DE CONNEXION</p>} />
    </Routes>
  </MemoryRouter>,
);

describe('pages protégées : retour de la connexion Google', () => {
  it('pendant la recherche de la session par cookie : ni connexion ni contenu (on attend)', () => {
    state({ user: null, booting: true });
    page();
    expect(screen.queryByText('PAGE DE CONNEXION')).toBeNull();
    expect(screen.queryByText('ESPACE PROTEGE')).toBeNull();
  });
  it('sans session une fois la recherche finie : renvoi vers la connexion', () => {
    state({ user: null, booting: false });
    page();
    expect(screen.getByText('PAGE DE CONNEXION')).toBeTruthy();
  });
  it('session trouvée : la page s’affiche', () => {
    state({ user: { id: 'u1', authComplete: true }, booting: false });
    page();
    expect(screen.getByText('ESPACE PROTEGE')).toBeTruthy();
  });
});
