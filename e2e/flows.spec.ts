import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
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
    await page.getByLabel(/Email du destinataire/).fill('ami@example.com');
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
    // L'application doit être démarrée : sinon elle réécrit l'utilisateur de démonstration par-dessus
    await expect(page.locator('#contenu')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('e509.user', 'null'));
    await page.goto('/compte');
    await expect(page).toHaveURL(/\/connexion\?next=%2Fcompte/);
    await page.getByText('Comptes de démonstration').click();
    await page.getByRole('button', { name: 'Participant' }).click();
    await expect(page).toHaveURL(/\/compte$/);
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
    await expect(page.getByRole('heading', { name: 'Versements', exact: true })).toBeVisible();
    await page.goto('/organisateur/evenements/nouveau');
    await expect(page).not.toHaveURL(/nouveau/);
  });
});

test.describe('organisateur', () => {
  test('contrôle d’entrée : choix de l’événement, vérification puis validation, refus d’un doublon et d’un faux billet, puis hors ligne', async ({ page }) => {
    await loginAs(page, /Organisateur \(admin\)/);
    await page.goto('/organisateur/checkin');
    // Plusieurs événements publiés : on choisit d'abord celui dont on contrôle les billets
    await page.getByRole('link', { name: /Festival Kompa Live 2026/ }).click();
    await page.waitForURL(/\/organisateur\/checkin\/.+/);
    await expect(page.locator('.text-3xl.font-extrabold')).toContainText(/\/ [1-9]/); // liste des participants chargée
    const validate = page.getByRole('button', { name: 'Valider l’entrée' });
    const next = page.getByRole('button', { name: 'OK, scanner le suivant' });

    // Billet valide : le scanner s'arrête, l'organisateur voit qui entre, puis valide ; le scan reprend
    await page.getByRole('button', { name: 'Billet valide' }).click();
    await expect(validate).toBeVisible();
    await validate.click();
    await expect(page.getByText(/Entrée validée :/)).toBeVisible();
    await expect(validate).toHaveCount(0);

    await page.getByRole('button', { name: 'Billet déjà utilisé' }).click();
    await expect(page.getByText('Déjà scanné').first()).toBeVisible();
    await next.click();
    await expect(next).toHaveCount(0);

    await page.getByRole('button', { name: 'Faux billet' }).click();
    await expect(page.getByText('Billet invalide').first()).toBeVisible();
    await next.click();

    // Hors ligne : la validation est gardée puis synchronisée au retour du réseau
    await page.getByRole('switch', { name: 'Forcer hors ligne' }).click();
    await page.getByRole('button', { name: 'Billet valide' }).click();
    await validate.click();
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

test.describe('administration', () => {
  test('un signalement envoyé par un participant arrive en modération', async ({ page }) => {
    await fresh(page, '/e/festival-kompa-live-2026');
    await page.getByRole('button', { name: 'Signaler' }).click();
    await page.getByLabel(/Détails/).fill('Le prix affiché ne correspond pas à l’affiche.');
    await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(page.getByText('Merci, votre signalement a été envoyé à l’équipe Event509')).toBeVisible();
    // Les données de démo vivent en mémoire : on navigue sans recharger la page
    const go = (path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await go('/connexion');
    await page.getByText('Comptes de démonstration').click();
    await page.getByRole('button', { name: 'Admin plateforme' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/connexion'));
    await go('/admin/moderation?onglet=signalements');
    await expect(page.getByText('« Le prix affiché ne correspond pas à l’affiche. »')).toBeVisible();
  });

  test('valide puis paie un versement demandé', async ({ page }) => {
    await loginAs(page, /Admin plateforme/);
    await page.goto('/admin/versements');
    const row = page.getByRole('row', { name: /Tech Ayiti/ }).filter({ hasText: 'À valider' });
    await row.getByRole('button', { name: 'Approuver' }).click();
    await expect(page.getByText('Versement approuvé : virement en préparation')).toBeVisible();
    await page.getByRole('row', { name: /Tech Ayiti/ }).filter({ hasText: 'En cours' }).getByRole('button', { name: 'Marquer payé' }).click();
    await expect(page.getByText('Versement marqué comme payé')).toBeVisible();
  });

  test('résout un litige : la décision exige une explication', async ({ page }) => {
    await loginAs(page, /Admin plateforme/);
    await page.goto('/admin/litiges');
    await page.getByRole('button', { name: 'Traiter' }).first().click();
    await page.getByRole('button', { name: 'Appliquer la décision' }).click();
    await expect(page.getByText('Expliquez la décision aux deux parties')).toBeVisible();
    await page.getByLabel(/Explication de la décision/).fill('Le billet a bien été refusé à tort, remboursement complet.');
    await page.getByRole('button', { name: 'Appliquer la décision' }).click();
    await expect(page.getByText('Litige résolu : les deux parties sont prévenues')).toBeVisible();
  });

  test('le tableau de bord admin affiche des données calculées et crée un objectif', async ({ page }) => {
    await loginAs(page, /Admin plateforme/);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Objectifs' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouvel objectif' }).click();
    await page.getByLabel(/^Nom/).fill('2 000 billets en décembre');
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('button', { name: /Objectif « 2 000 billets en décembre »/ })).toBeVisible();
  });
});

test.describe('programme Organisateur vérifié (démonstration)', () => {
  test('la page de présentation s’affiche et renvoie vers la demande', async ({ page }) => {
    await fresh(page, '/organisateur-verifie');
    await expect(page.getByRole('heading', { name: 'Devenez un organisateur vérifié' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Demander la vérification' }).first()).toHaveAttribute('href', '/organisateur/verification');
  });

  test('la demande et l’abonnement sont réservés au site en ligne', async ({ page }) => {
    await loginAs(page, /Organisateur \(admin\)/);
    await page.goto('/organisateur/verification');
    await expect(page.getByRole('heading', { name: 'Programme disponible sur le site en ligne' })).toBeVisible();
    await page.goto('/organisateur/abonnement');
    await expect(page.getByRole('heading', { name: 'Programme disponible sur le site en ligne' })).toBeVisible();
  });
});

test.describe('page professionnelle (démonstration)', () => {
  test('l’adresse /organisateur/<nom> ouvre la page, sans masquer l’espace organisateur', async ({ page }) => {
    await fresh(page, '/organisateur/lakay-productions');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lakay Productions');
    await page.goto('/organisateur/evenements');
    await expect(page).not.toHaveURL(/lakay/);
    await page.goto('/organisateur/adresse-inconnue');
    await expect(page.getByText('Cette page n’existe pas')).toBeVisible();
  });
});

test.describe('widget de billetterie (démonstration)', () => {
  test('n’est pas disponible pour un organisateur sans l’avantage API', async ({ page }) => {
    await page.goto('/widget/festival-kompa-live-2026');
    await expect(page.getByText('Ce widget de billetterie n’est pas disponible.')).toBeVisible();
  });
});

test.describe('pages légales', () => {
  test('les trois documents sont en ligne et l’administrateur peut modifier un texte', async ({ page }) => {
    await fresh(page, '/cgu');
    await expect(page.getByRole('heading', { level: 1, name: /Conditions d’utilisation|Terms of use/ })).toBeVisible();
    await expect(page.getByText(/intermédiaire technique|technical intermediary/)).toBeVisible();
    await page.goto('/confidentialite');
    await expect(page.getByRole('heading', { level: 1, name: /Politique de confidentialité|Privacy policy/ })).toBeVisible();
    await page.goto('/remboursement');
    await expect(page.getByRole('heading', { level: 1, name: /Politique de remboursement|Refund policy/ })).toBeVisible();

    await loginAs(page, /Admin plateforme/);
    await page.goto('/admin/contenu');
    await expect(page.getByRole('heading', { name: /Contenu et réglages|Content and settings/ })).toBeVisible();
    const box = page.getByRole('textbox', { name: /Texte d’origine|Original text/ });
    await box.fill('# Remboursements de test\n> Mise à jour\n\n## 1. Principe\n\nTexte modifié par l’administrateur.');
    await page.getByRole('button', { name: /Enregistrer le texte|Save the text/ }).click();
    await expect(page.getByText(/la page est à jour|the page is up to date/)).toBeVisible();
  });
});

test.describe('devises', () => {
  test('l’acheteur choisit une devise du monde ; les prix suivent, et le paiement reste en gourdes', async ({ page }) => {
    await fresh(page, '/compte/parametres');
    await page.locator('#contenu').getByLabel(/^(Devise|Currency)$/).selectOption('EUR');
    await page.goto('/explorer');
    await expect(page.getByText(/€\s?\d|\d\s?€/).first()).toBeVisible();

    // À la caisse, la devise se change aussi et une note rappelle que le prélèvement se fait en gourdes
    await page.goto('/e/festival-kompa-live-2026/achat?t=t1b:1');
    const caisse = page.locator('#contenu').getByLabel(/^(Devise|Currency)$/);
    await expect(caisse).toHaveValue('EUR');
    await expect(page.getByText(/débité de|charged/)).toBeVisible();
    await caisse.selectOption('HTG');
    await expect(page.getByText(/débité de|charged/)).toHaveCount(0);
  });
});

test.describe('événements près de l’utilisateur', () => {
  test('l’accueil et l’exploration mettent en premier la ville et le pays, et on peut personnaliser', async ({ page }) => {
    await fresh(page, '/');
    await page.evaluate(() => localStorage.setItem('e509.place', JSON.stringify({ country: 'HT', city: 'Cap-Haïtien', manual: true })));
    await page.reload();
    await expect(page.getByRole('heading', { name: /Cap-Haïtien/ })).toBeVisible();
    // Dans la section proche : les événements de la ville d'abord
    const near = page.locator('section[aria-labelledby="h-near"]');
    await expect(near.getByRole('link').first()).toBeVisible();

    // Exploration : tri « Pour vous » par défaut
    await page.goto('/explorer');
    await expect(page.getByRole('radio', { name: /Pour vous|For you/ })).toBeChecked();

    // Personnaliser : pays, ville et centres d'intérêt
    await page.goto('/');
    await page.getByRole('button', { name: /Personnaliser|Personalize/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^(Ville|City)/).fill('Jacmel');
    await dialog.getByRole('button', { name: /Musique|Music/ }).click();
    await dialog.getByRole('button', { name: /^(Enregistrer|Save)$/ }).click();
    await expect(page.getByRole('heading', { name: /Jacmel/ })).toBeVisible();
  });
});

test.describe('installation de l’application Android (APK)', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  // Fiche de version simulée : ces tests ne dépendent pas du vrai fichier APK
  const RELEASE = { versionCode: 20, versionName: '1.0.20', size: 24848818, sha256: 'ab12cd34ef56', date: '2026-11-13', minAndroid: '7.0', file: '/app/event509.apk' };
  const withRelease = async (context: BrowserContext) => {
    await context.route(/\/app\/version\.json/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RELEASE) }));
    return context;
  };
  // Sans service worker : sinon il traite lui-même la requête et la simulation ne la voit pas
  const newCtx = async (browser: Browser, opts: BrowserContextOptions) => withRelease(await browser.newContext({ serviceWorkers: 'block', ...opts }));
  test.use({ serviceWorkers: 'block' });
  test.beforeEach(async ({ context }) => {
    await withRelease(context);
  });

  test('sur un téléphone Android : invitation, fenêtre d’informations, téléchargement de l’APK', async ({ browser }) => {
    const ctx = await newCtx(browser, { userAgent: ANDROID, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Installez l’application EVENT509|Install the EVENT509 app/ })).toBeVisible({ timeout: 8000 });
    // Ce n'est pas la PWA : aucun événement d'installation, le bouton mène aux informations puis au fichier APK
    await dialog.getByRole('button', { name: /^(Installer|Install)$/ }).click();
    await expect(dialog.getByText(/Google Play/)).toBeVisible();
    const link = dialog.getByRole('link', { name: /Télécharger l’application|Download the app/ });
    await expect(link).toHaveAttribute('href', '/app/event509.apk');
    await expect(link).toHaveAttribute('download', 'EVENT509.apk');
    await expect(dialog.getByText('1.0.20').first()).toBeVisible();
    await expect(dialog.getByText(/24 Mo|24 MB/).first()).toBeVisible();
    await ctx.close();
  });

  test('« Plus tard » masque l’invitation, qui ne revient pas au rechargement', async ({ browser }) => {
    const ctx = await newCtx(browser, { userAgent: ANDROID, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8000 });
    await dialog.getByRole('button', { name: /Plus tard|Later/ }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await ctx.close();
  });

  test('pas d’invitation hors Android ni dans l’application', async ({ browser }) => {
    const desktop = await newCtx(browser, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', viewport: { width: 1280, height: 800 } });
    const pc = await desktop.newPage();
    await pc.goto('/');
    await pc.waitForTimeout(2500);
    await expect(pc.getByRole('dialog')).toHaveCount(0); // ordinateur : l'APK ne s'installe que sur Android
    await desktop.close();
    const ctx = await newCtx(browser, { userAgent: ANDROID });
    const inside = await ctx.newPage();
    await inside.addInitScript(() => {
      (window as unknown as { AppBridge: unknown }).AppBridge = { postMessage: () => {} };
    });
    await inside.goto('/');
    await inside.waitForTimeout(2500);
    await expect(inside.getByRole('dialog')).toHaveCount(0); // l'application elle-même
    await ctx.close();
  });

  test('la page /telecharger donne les informations et le fichier', async ({ page }) => {
    await page.goto('/telecharger');
    await expect(page.getByRole('heading', { level: 1, name: /Application Android|Android app/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Télécharger l’application|Download the app/ })).toHaveAttribute('href', '/app/event509.apk');
  });

  test('dans l’application, une version plus récente propose la mise à jour', async ({ browser }) => {
    const ctx = await newCtx(browser, { userAgent: ANDROID, viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    const sent: string[] = [];
    await page.exposeFunction('record', (m: string) => sent.push(m));
    await page.addInitScript(() => {
      const w = window as unknown as { AppBridge: { postMessage: (m: string) => void }; onAppVersion?: (v: { build: number; name: string }) => void; record: (m: string) => void };
      w.AppBridge = {
        postMessage: (m: string) => {
          w.record(m);
          // Une ancienne version installée (numéro 1) répond à « app:version »
          if (m === 'app:version') setTimeout(() => w.onAppVersion?.({ build: 1, name: '1.0.1' }), 50);
        },
      };
    });
    await page.goto('/');
    const banner = page.getByRole('region', { name: /Mise à jour disponible|Update available/ });
    await expect(banner).toBeVisible({ timeout: 8000 });
    await banner.getByRole('button', { name: /Mettre à jour|Update/ }).click();
    await expect.poll(() => sent.includes('update:open')).toBe(true);
    await ctx.close();
  });
});

test.describe('commission', () => {
  test('le pourcentage de commission est défini par l’administrateur et repris dans les conditions d’utilisation', async ({ page }) => {
    await loginAs(page, /Admin plateforme/);
    await page.goto('/admin/commissions');
    const fee = page.getByLabel(/^(Pourcentage \(%\)|Percentage \(%\))/);
    await fee.fill('7');
    await page.getByRole('button', { name: /^(Enregistrer|Save)$/ }).first().click();
    // Réglage enregistré (démonstration : gardé sur l'appareil) avant de changer de page
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('e509.demo.fees') ?? '{}').percent === 7);
    await page.goto('/cgu');
    await expect(page.getByText(/7 % \+/)).toBeVisible();
  });
});
