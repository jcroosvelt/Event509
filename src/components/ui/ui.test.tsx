import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { AppProvider } from '@/store/app';
import { useForm } from '@/lib/form';
import { Field, Input, Modal, Segmented } from './index';

const wrap = (ui: ReactNode) => render(<AppProvider>{ui}</AppProvider>);

describe('Field', () => {
  it('relie le libellé, l’aide et l’erreur au champ', () => {
    wrap(
      <Field label="Email" error="Saisissez une adresse comme nom@domaine.com" required>
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveProperty('required', true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const msg = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(msg?.textContent).toContain('nom@domaine.com');
    expect(msg?.getAttribute('role')).toBe('alert');
  });
});

describe('Modal', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Ouvrir</button>
        <Modal open={open} onClose={() => { onClose(); setOpen(false); }} title="Titre">
          <input aria-label="Champ" />
        </Modal>
      </>
    );
  }

  it('place le focus dans la fenêtre, se ferme avec Échap et rend le focus', () => {
    const onClose = vi.fn();
    wrap(<Harness onClose={onClose} />);
    const opener = screen.getByText('Ouvrir');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Champ'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('Segmented', () => {
  it('se comporte comme un groupe radio navigable aux flèches', () => {
    function S() {
      const [v, setV] = useState<'a' | 'b' | 'c'>('a');
      return <Segmented label="Choix" value={v} onChange={setV} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />;
    }
    wrap(<S />);
    const a = screen.getByRole('radio', { name: 'A' });
    expect(a.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('radio', { name: 'A' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('useForm', () => {
  const rules = { email: (v: unknown) => (!String(v).includes('@') ? 'Saisissez une adresse' : undefined) };

  it('n’affiche pas d’erreur pendant la saisie, valide à la sortie du champ et efface en corrigeant', () => {
    const { result } = renderHook(() => useForm({ email: '' }, rules));
    act(() => result.current.bind('email').onChange({ target: { value: 'j' } }));
    expect(result.current.errors.email).toBeUndefined();
    act(() => result.current.bind('email').onBlur());
    expect(result.current.errors.email).toBe('Saisissez une adresse');
    act(() => result.current.bind('email').onChange({ target: { value: 'j@' } }));
    expect(result.current.errors.email).toBeUndefined();
  });

  it('refuse l’envoi d’un formulaire invalide', () => {
    const { result } = renderHook(() => useForm({ email: '' }, rules));
    let ok = true;
    act(() => {
      ok = result.current.validate();
    });
    expect(ok).toBe(false);
    expect(result.current.errors.email).toBe('Saisissez une adresse');
  });
});
