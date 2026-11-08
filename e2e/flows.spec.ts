import { expect, test } from '@playwright/test';
import { fresh, isMobile, loginAs } from './helpers';

test.describe('participant', () => {
  test('achète 2 billets à places numérotées avec un code promo et les retrouve dans son portefeuille', async ({ page }) => {
    await fresh(page, '/e/ayiti-tech-summit');
    // Session obligatoire pour un événement multi-sessions
    await page.getByRole('radio', { name: /Jour 1/ }).click();
    const add = page.getByRole('button', { name: 'Ajouter un billet Pass 2 jours' });
    await add.click();
    await add.click();
    // Sur mobile, la barre d'achat collante porte le bouton ; sur ordinateur, le panneau latéral
    const cont = page.getByRole('button', { name: 'Continuer' });
    await (isMobile(page) ? cont.last() : cont.first()).click();
    await page.waitForURL(/\/achat/);

    // Les places hors de la zone du billet sont désactivées ; on prend 2 places libres de la zone
    const free = page.locator('button[aria-label*="Pass 2 jours"]:not([disabled])');
    await free.nth(0).click();
    await free.nth(1).click();
    await expect(page.getByText(/2\/2 place\(s\) choisie\(s\)/)).toBeVisible();

    await page.getByPlaceholder('Code promo').fill('NOEL2026');
    await page.getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.getByText('Réduction')).toBeVisible();
    await page.getByRole('button', { name: /^Payer/ }).click();

    await expect(page.getByRole('heading', { name: 'C’est confirmé !' })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Place [A-Z]-\d+/).first()).toBeVisible();

    await page.goto('/billets');
    await expect(page.getByRole('link', { name: /Pass 2 jours — Ayiti Tech Summit/ })).toHaveCount(3); // 1 billet de démo + 2 achetés
  });

  test('ne peut pas payer avec un formulaire incomplet : le premier champ en erreur reçoit le focus', async ({ page }) => {
    await fresh(page, '/e/festival-kompa-live-2026/achat?t=t1b:1');
    await page.getByLabel(/Nom complet/).fill('');
    await page.getByRole('button', { name: /^Payer/ }).click();
    await expect(page.getByText('Indiquez le nom qui figurera sur les billets')).toBeVisible();
    await expect(page.getByLabel(/Nom complet/)).toBeFocused();
  });

  test('transfère un billet : il devient inactif', async ({ page }) => {
    await fresh(page, '/billets/it1');
    await page.getByRole('button', { name: 'Transférer' }).click();
    await page.getByLabel(/Email ou téléphone du destinataire/).fill('ami@example.com');
    await page.getByRole('dialog').getByRole('button', { name: 'Transférer' }).click();
    await expect(page.getByText('QR désactivé')).toBeVisible();
    await expect(page.getByText('Transféré à ami@example.com')).toBeVisible();
  });

  test('l’interface passe entièrement en anglais', async ({ page }) => {
    await fresh(page, '/compte/parametres');
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible();
    await page.goto('/e/festival-kompa-live-2026');
    await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
    await expect(page.getByText('Up to 8 tickets per person')).toBeVisible();
  });
});

test.describe('accès et rôles', () => {
  test('un visiteur est renvoyé vers la connexion puis revient à la page demandée', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('e509.user', 'null'));
    await page.goto('/billets');
    await expect(page).toHaveURL(/\/connexion\?next=%2Fbillets/);
    await page.getByText('Comptes de démonstration').click();
    await page.getByRole('button', { name: 'Participant' }).click();
    await expect(page).toHaveURL(/\/billets$/);
  });

  test('un participant ne voit pas l’administration', async ({ page }) => {
    await fresh(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
  });

  test('le staff d’entrée n’a accès qu’au check-in', async ({ page }) => {
    await loginAs(page, /Staff d’entrée/);
    await page.goto('/organisateur/versements');
    await expect(page).toHaveURL(/\/organisateur\/checkin$/);
    if (!isMobile(page)) {
      const nav = page.getByRole('navigation', { name: 'Espace organisateur' });
      await expect(nav.getByRole('link')).toHaveCount(1);
    }
  });

  test('le comptable voit les versements mais pas l’éditeur d’événement', async ({ page }) => {
    await loginAs(page, /Comptable/);
    await page.goto('/organisateur/versements');
    await expect(page.getByRole('heading', { name: 'Versements et factures' })).toBeVisible();
    await page.goto('/organisateur/evenements/nouveau');
    await expect(page).not.toHaveURL(/nouveau/);
  });
});

test.describe('organisateur', () => {
  test('check-in : valide, refuse un doublon et un faux billet, puis valide hors ligne', async ({ page }) => {
    await loginAs(page, /Organisateur \(admin\)/);
    await page.goto('/organisateur/checkin');
    await expect(page.locator('.text-3xl.font-extrabold')).toContainText(/\/ [1-9]/); // liste des participants chargée
    const result = page.locator('p[aria-live="assertive"]');
    await page.getByRole('button', { name: 'Billet valide' }).click();
    await expect(result).toContainText('Entrée validée');
    await page.waitForTimeout(3100); // anti double lecture
    await page.getByRole('button', { name: 'Billet déjà utilisé' }).click();
    await expect(result).toContainText('Déjà scanné');
    await page.waitForTimeout(3100);
    await page.getByRole('button', { name: 'Faux billet' }).click();
    await expect(result).toContainText('Billet invalide');
    await page.getByRole('switch', { name: 'Forcer hors ligne' }).click();
    await page.waitForTimeout(3100);
    await page.getByRole('button', { name: 'Billet valide' }).click();
    await expect(result).toContainText('Entrée validée');
    await expect(page.getByRole('button', { name: /Synchroniser \(1\)/ })).toBeVisible();
  });

  test('crée et publie un événement', async ({ page }) => {
    await loginAs(page, /Organisateur \(admin\)/);
    await page.goto('/organisateur/evenements/nouveau');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Donnez un titre d’au moins 4 caractères')).toBeVisible();
    await page.getByLabel(/Titre de l’événement/).fill('Soirée test Playwright');
    await page.getByLabel(/^Description/).fill('Une soirée de test pour vérifier la publication de bout en bout.');
    await page.getByRole('button', { name: /Musique/ }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByLabel(/Nom du lieu/).fill('Salle de test');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Publier maintenant' }).click();
    await expect(page).toHaveURL(/\/organisateur\/evenements$/);
    await expect(page.getByRole('link', { name: 'Soirée test Playwright' })).toBeVisible();
  });
});

test('les billets restent consultables hors ligne (service worker)', async ({ page, context }) => {
  await fresh(page, '/billets');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la page est désormais contrôlée par le service worker
  await context.setOffline(true);
  await page.goto('/billets/it3');
  await expect(page.getByRole('heading', { name: 'Ayiti Tech Summit' })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR code d’entrée/ })).toBeVisible();
  await context.setOffline(false);
});

test('chaque page événement a un aperçu de partage', async ({ request }) => {
  const html = await (await request.get('/e/festival-kompa-live-2026')).text();
  expect(html).toContain('<meta property="og:title" content="Festival Kompa Live 2026"');
  expect(html).toContain('og:image');
});

test('la déconnexion survit au rechargement de la page', async ({ page }) => {
  await fresh(page, '/compte');
  await page.getByRole('button', { name: 'Déconnexion' }).last().click();
  await page.reload();
  await page.goto('/compte');
  await expect(page).toHaveURL(/\/connexion/);
});
