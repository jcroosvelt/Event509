import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '@/store/app';
import { ApiError } from '@/lib/errors';

vi.mock('@/services/api', async (orig) => {
  const real = await orig<typeof import('@/services/api')>();
  return { ...real, authConfig: vi.fn() };
});

import * as api from '@/services/api';
import AuthEntry from './GoogleAuth';
import { ProfileWizard } from './ProfileWizard';

const wrap = (ui: React.ReactElement, url = '/') => render(<MemoryRouter initialEntries={[url]}><AppProvider>{ui}</AppProvider></MemoryRouter>);
const FR = (s: string) => new RegExp(s, 'i');
const set = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

describe('page de connexion et d’inscription', () => {
  it('Google configuré : un seul bouton Google, aucun formulaire e-mail / mot de passe', async () => {
    vi.mocked(api.authConfig).mockResolvedValue({ google: true, passkeys: true });
    const { container } = wrap(<AuthEntry mode="login" />, '/connexion?next=/organisateur');
    const btn = await screen.findByRole('link', { name: /Continuer avec Google|Continue with Google/ });
    expect(btn.getAttribute('href')).toMatch(/\/auth\/google\/start\?purpose=login&next=%2Forganisateur$/);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(screen.getByRole('link', { name: /conditions d’utilisation|terms of use/i }).getAttribute('href')).toBe('/cgu');
    expect(screen.getByRole('link', { name: /politique de confidentialité|privacy policy/i }).getAttribute('href')).toBe('/confidentialite');
    expect(screen.getByRole('link', { name: /plus accès à mon compte Google|no longer have access/i }).getAttribute('href')).toBe('/connexion/recuperation');
    expect(screen.getByRole('link', { name: /ancien compte|older account/i }).getAttribute('href')).toBe('/connexion/ancien');
  });

  it('affiche les erreurs du retour de Google sans détail technique', async () => {
    vi.mocked(api.authConfig).mockResolvedValue({ google: true, passkeys: false });
    wrap(<AuthEntry mode="login" />, '/connexion?error=legacy_account');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/ancien compte|older/i);
  });

  it('Google non configuré (démonstration) : les formulaires d’origine restent disponibles', async () => {
    vi.mocked(api.authConfig).mockResolvedValue({ google: false, passkeys: false });
    const { container } = wrap(<AuthEntry mode="login" />);
    await waitFor(() => expect(container.querySelector('input[type="password"]')).not.toBeNull());
  });
});

describe('application Android (WebView)', () => {
  it('ne propose pas le bouton Google (refusé par Google dans une application) mais garde les autres accès', async () => {
    vi.mocked(api.authConfig).mockResolvedValue({ google: true, passkeys: true });
    (window as unknown as { AppBridge: unknown }).AppBridge = { postMessage: () => undefined };
    try {
      wrap(<AuthEntry mode="login" />);
      await screen.findByRole('status');
      expect(screen.queryByRole('link', { name: /Continuer avec Google|Continue with Google/ })).toBeNull();
      expect(screen.getByRole('link', { name: /ancien compte|older account/i })).toBeTruthy();
    } finally {
      delete (window as unknown as { AppBridge?: unknown }).AppBridge;
    }
  });
});

describe('inscription progressive : profil, questions, conditions', () => {
  const setup = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
    wrap(<ProfileWizard title="Terminez" email="marie@gmail.test" initial={{ givenName: 'Marie', familyName: 'Claire', country: 'HT', city: '' }} onSubmit={onSubmit} />);
    return onSubmit;
  };
  const next = () => fireEvent.click(screen.getByRole('button', { name: /^(Continuer|Continue)$/ }));
  const questions = () => screen.getAllByLabelText(/Votre question|Your question/);
  const answers = () => screen.getAllByLabelText(/Votre réponse|Your reply/);

  it('étape 1 : e-mail Google en lecture seule, préremplissage, ville obligatoire', () => {
    setup();
    const email = screen.getByDisplayValue('marie@gmail.test') as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(email.disabled).toBe(true);
    expect((screen.getByDisplayValue('Marie') as HTMLInputElement).value).toBe('Marie');
    expect((screen.getByRole('button', { name: /^(Continuer|Continue)$/ }) as HTMLButtonElement).disabled).toBe(true);
    set(screen.getByLabelText(/^(Ville|City)/), 'Jacmel');
    expect((screen.getByRole('button', { name: /^(Continuer|Continue)$/ }) as HTMLButtonElement).disabled).toBe(false);
    // Pas de date de naissance ni de téléphone demandés
    expect(screen.queryByLabelText(/naissance|birth|téléphone|phone/i)).toBeNull();
  });

  it('exige trois questions complètes puis les deux acceptations avant de créer le compte', async () => {
    const onSubmit = setup();
    set(screen.getByLabelText(/^(Ville|City)/), 'Jacmel');
    next();
    // Étape 2 : trois questions et trois réponses
    expect(questions()).toHaveLength(3);
    expect((screen.getByRole('button', { name: /^(Continuer|Continue)$/ }) as HTMLButtonElement).disabled).toBe(true);
    const qs = ['Comment s’appelait mon premier chat ?', 'Quel était le titre de mon premier projet ?', 'Où ai-je caché mon carnet rouge ?'];
    questions().forEach((q, i) => set(q, qs[i]!));
    answers().forEach((a, i) => set(a, ['Moustache', 'Kanaval', 'Sous le lit'][i]!));
    next();
    // Étape 3 : conditions et confidentialité
    const create = screen.getByRole('button', { name: /Créer mon compte|Create my account/ }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    const [terms, privacy] = screen.getAllByRole('checkbox');
    fireEvent.click(terms!);
    expect(create.disabled).toBe(true);
    fireEvent.click(privacy!);
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ givenName: 'Marie', familyName: 'Claire', country: 'HT', city: 'Jacmel', acceptTerms: true, acceptPrivacy: true, questions: [{ question: qs[0], answer: 'Moustache' }, { question: qs[1], answer: 'Kanaval' }, { question: qs[2], answer: 'Sous le lit' }] });
  });

  it('un refus du serveur sur les questions ramène à l’étape des questions avec le message', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, 'Évitez les questions sur des informations publiques.', undefined, 'questions_invalid'));
    setup(onSubmit);
    set(screen.getByLabelText(/^(Ville|City)/), 'Jacmel');
    next();
    questions().forEach((q, i) => set(q, `Question personnelle numéro ${i + 1} ?`));
    answers().forEach((a, i) => set(a, `réponse ${i + 1} unique`));
    next();
    const [terms, privacy] = screen.getAllByRole('checkbox');
    fireEvent.click(terms!);
    fireEvent.click(privacy!);
    fireEvent.click(screen.getByRole('button', { name: /Créer mon compte|Create my account/ }));
    expect(await screen.findByText(/informations publiques/)).toBeTruthy();
    expect(questions()).toHaveLength(3); // revenu à l'étape des questions
  });
});

void FR;
